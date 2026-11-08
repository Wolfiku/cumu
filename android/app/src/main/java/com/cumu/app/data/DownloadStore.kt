package com.cumu.app.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import okhttp3.Request
import java.io.File
import java.security.MessageDigest

@Serializable
data class OfflineSong(
    val song: Song,
    val file: String,
    val coverFile: String? = null,
    val bytes: Long = 0,
)

/**
 * Songs saved on the phone for offline playback. Files go to the app's
 * private storage (removed with the app); the index is a small JSON file.
 */
class DownloadStore(
    context: Context,
    private val api: ApiClient,
    private val scope: CoroutineScope,
) {
    private val dir = File(context.filesDir, "offline").apply { mkdirs() }
    private val coverDir = File(dir, "covers").apply { mkdirs() }
    private val indexFile = File(dir, "index.json")

    private val _songs = MutableStateFlow(loadIndex())
    /** Downloaded songs by id. */
    val songs: StateFlow<Map<String, OfflineSong>> = _songs.asStateFlow()

    private val _progress = MutableStateFlow<Map<String, Float>>(emptyMap())
    /** Running downloads: song id → 0..1 (or -1 when the size is unknown). */
    val progress: StateFlow<Map<String, Float>> = _progress.asStateFlow()

    private val _runningAlbums = MutableStateFlow<Map<String, Int>>(emptyMap())
    /** Album id → number of its songs currently downloading (for album badges). */
    val runningAlbums: StateFlow<Map<String, Int>> = _runningAlbums.asStateFlow()

    private fun countAlbum(song: Song, delta: Int) {
        val id = song.albumId ?: return
        _runningAlbums.update { m ->
            val n = (m[id] ?: 0) + delta
            if (n <= 0) m - id else m + (id to n)
        }
    }

    private val _errors = MutableStateFlow<String?>(null)
    val errors: StateFlow<String?> = _errors.asStateFlow()
    fun clearError() { _errors.value = null }

    private val parallel = Semaphore(2)

    fun isDownloaded(id: String) = _songs.value.containsKey(id)
    fun localFile(id: String): File? = _songs.value[id]?.let { File(dir, it.file) }?.takeIf { it.exists() }
    fun localCover(id: String): File? = _songs.value[id]?.coverFile?.let { File(coverDir, it) }?.takeIf { it.exists() }

    val totalBytes: Long get() = _songs.value.values.sumOf { it.bytes }

    fun download(songs: List<Song>) {
        if (api.offline.value && songs.any { !isDownloaded(it.id) }) {
            _errors.value = "Offline: Herunterladen geht wieder, sobald der Server erreichbar ist"
            api.retrySoon()
            return
        }
        for (song in songs) {
            if (isDownloaded(song.id) || _progress.value.containsKey(song.id)) continue
            _progress.update { it + (song.id to 0f) }
            countAlbum(song, +1)
            scope.launch(Dispatchers.IO) {
                parallel.withPermit {
                    try {
                        downloadOne(song)
                    } catch (e: Exception) {
                        _errors.value = "Download fehlgeschlagen: ${song.title} (${e.message ?: "Fehler"})"
                    } finally {
                        _progress.update { it - song.id }
                        countAlbum(song, -1)
                    }
                }
            }
        }
    }

    private fun downloadOne(song: Song) {
        val ext = song.filename?.substringAfterLast('.', "")?.lowercase()?.takeIf { it.length in 2..5 } ?: "audio"
        val name = "${song.id}.$ext"
        val tmp = File(dir, "$name.part")
        val req = Request.Builder().url(api.streamUrl(song.id)).build()
        api.http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, "HTTP ${res.code}")
            val body = res.body ?: throw ApiException(res.code, "leere Antwort")
            val total = body.contentLength()
            var done = 0L
            var lastReport = 0L
            body.byteStream().use { input ->
                tmp.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        if (done - lastReport > 256 * 1024) {
                            lastReport = done
                            val p = if (total > 0) done.toFloat() / total else -1f
                            _progress.update { it + (song.id to p) }
                        }
                    }
                }
            }
        }
        val target = File(dir, name)
        if (!tmp.renameTo(target)) { tmp.delete(); throw ApiException(0, "Datei konnte nicht gespeichert werden") }

        val coverName = api.coverUrl(song.cover)?.let { url -> runCatching { saveCover(url) }.getOrNull() }
        val entry = OfflineSong(song = song, file = name, coverFile = coverName, bytes = target.length())
        synchronized(this) {
            _songs.update { it + (song.id to entry) }
            saveIndex()
        }
    }

    /** Covers are shared by all songs of an album, so they are stored by URL hash. */
    private fun saveCover(url: String): String {
        val hash = MessageDigest.getInstance("SHA-1").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
        val f = File(coverDir, "$hash.img")
        if (f.exists()) return f.name
        api.baseHttp.newCall(Request.Builder().url(url).build()).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, "cover")
            val tmp = File(coverDir, "$hash.part")
            res.body!!.byteStream().use { i -> tmp.outputStream().use { o -> i.copyTo(o) } }
            tmp.renameTo(f)
        }
        return f.name
    }

    fun delete(ids: Collection<String>) {
        synchronized(this) {
            val current = _songs.value
            for (id in ids) current[id]?.let { File(dir, it.file).delete() }
            val remaining = current - ids.toSet()
            // Remove covers no remaining song uses
            val used = remaining.values.mapNotNull { it.coverFile }.toSet()
            coverDir.listFiles()?.forEach { if (it.name !in used) it.delete() }
            _songs.value = remaining
            saveIndex()
        }
    }

    fun deleteAll() = delete(_songs.value.keys.toList())

    private fun loadIndex(): Map<String, OfflineSong> = runCatching {
        if (!indexFile.exists()) return emptyMap()
        api.json.decodeFromString(ListSerializer(OfflineSong.serializer()), indexFile.readText())
            .filter { File(dir, it.file).exists() }
            .associateBy { it.song.id }
    }.getOrDefault(emptyMap())

    private fun saveIndex() {
        val tmp = File(dir, "index.json.tmp")
        tmp.writeText(api.json.encodeToString(ListSerializer(OfflineSong.serializer()), _songs.value.values.toList()))
        tmp.renameTo(indexFile)
    }
}
