package com.cumu.app.playback

import android.content.ComponentName
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.cumu.app.CumuApplication
import com.cumu.app.data.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PlayerState(
    val current: Song? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val queue: List<Song> = emptyList(),
    val index: Int = -1,
    val shuffle: Boolean = false,
    val repeatMode: Int = Player.REPEAT_MODE_OFF,
    val error: String? = null,
)

/**
 * The UI side of playback: a MediaController connected to PlaybackService,
 * plus a StateFlow the Compose screens observe. Songs travel inside the
 * MediaItems (as JSON in the extras), so the queue survives the activity.
 */
class PlayerConnection(private val app: CumuApplication) {

    private var controller: MediaController? = null
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    private val pending = mutableListOf<(MediaController) -> Unit>()

    init {
        app.appScope.launch(Dispatchers.Main) {
            val token = SessionToken(app, ComponentName(app, PlaybackService::class.java))
            val c = MediaController.Builder(app, token).buildAsync().await()
            controller = c
            c.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = publish()
            })
            pending.forEach { it(c) }
            pending.clear()
            publish()
            // Position ticks while playing
            while (isActive) {
                if (c.isPlaying) publish()
                delay(500)
            }
        }
    }

    private fun withController(block: (MediaController) -> Unit) {
        app.appScope.launch(Dispatchers.Main) {
            controller?.let(block) ?: pending.add(block)
        }
    }

    private fun publish() {
        val c = controller ?: return
        val queue = (0 until c.mediaItemCount).mapNotNull { songOf(c.getMediaItemAt(it)) }
        _state.value = PlayerState(
            current = c.currentMediaItem?.let(::songOf),
            isPlaying = c.isPlaying,
            isBuffering = c.playbackState == Player.STATE_BUFFERING,
            positionMs = c.currentPosition.coerceAtLeast(0),
            durationMs = c.duration.takeIf { it > 0 } ?: 0,
            queue = queue,
            index = c.currentMediaItemIndex,
            shuffle = c.shuffleModeEnabled,
            repeatMode = c.repeatMode,
            error = c.playerError?.let { "Wiedergabe fehlgeschlagen: ${it.errorCodeName}" },
        )
    }

    // ── Commands ─────────────────────────────────────────────────────────────

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    /** Short notes for the user (shown as snackbar). */
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    /** Offline only downloaded songs can play; the others are left out of the queue. */
    private fun playable(songs: List<Song>, startIndex: Int): Pair<List<Song>, Int>? {
        if (!app.api.offline.value) return songs to startIndex
        val wanted = songs.getOrNull(startIndex)
        if (wanted != null && !app.downloads.isDownloaded(wanted.id)) {
            _messages.tryEmit("Offline: „${wanted.title}“ ist nicht heruntergeladen")
            return null
        }
        val kept = songs.filter { app.downloads.isDownloaded(it.id) }
        if (kept.isEmpty()) {
            _messages.tryEmit("Offline: Keiner dieser Titel ist heruntergeladen")
            return null
        }
        return kept to (wanted?.let { w -> kept.indexOfFirst { it.id == w.id } } ?: 0).coerceAtLeast(0)
    }

    fun play(all: List<Song>, startAt: Int = 0, shuffle: Boolean = false) {
        if (all.isEmpty()) return
        val (songs, startIndex) = playable(all, startAt) ?: return
        val items = songs.map(::itemOf)
        withController { c ->
            c.shuffleModeEnabled = shuffle
            val start = if (shuffle) songs.indices.random() else startIndex.coerceIn(songs.indices)
            c.setMediaItems(items, start, 0)
            c.prepare()
            c.play()
        }
    }

    fun playNext(song: Song) {
        if (playable(listOf(song), 0) == null) return
        playNextNow(song)
    }

    private fun playNextNow(song: Song) = withController { c ->
        if (c.mediaItemCount == 0) { c.setMediaItem(itemOf(song)); c.prepare(); c.play() }
        else c.addMediaItem(c.currentMediaItemIndex + 1, itemOf(song))
    }

    fun enqueue(all: List<Song>) {
        val songs = playable(all, 0)?.first ?: return
        enqueueNow(songs)
    }

    private fun enqueueNow(songs: List<Song>) = withController { c ->
        val wasEmpty = c.mediaItemCount == 0
        c.addMediaItems(songs.map(::itemOf))
        if (wasEmpty) { c.prepare(); c.play() }
    }

    fun togglePlay() = withController { c ->
        if (c.playerError != null) { c.prepare(); c.play(); return@withController }
        if (c.isPlaying) c.pause() else {
            if (c.playbackState == Player.STATE_ENDED) c.seekTo(0, 0)
            c.play()
        }
    }

    fun next() = withController { it.seekToNextMediaItem() }
    fun previous() = withController { it.seekToPrevious() }
    fun seekTo(ms: Long) = withController { it.seekTo(ms) }
    fun skipTo(index: Int) = withController { it.seekTo(index, 0); it.play() }
    fun removeAt(index: Int) = withController { it.removeMediaItem(index) }
    fun move(from: Int, to: Int) = withController { it.moveMediaItem(from, to) }
    fun toggleShuffle() = withController { it.shuffleModeEnabled = !it.shuffleModeEnabled }
    fun cycleRepeat() = withController {
        it.repeatMode = when (it.repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    fun stop() = withController { it.stop(); it.clearMediaItems() }

    // ── MediaItem <-> Song ───────────────────────────────────────────────────

    private fun itemOf(song: Song): MediaItem {
        val local = app.downloads.localFile(song.id)
        val uri = local?.let { Uri.fromFile(it) } ?: Uri.parse(app.api.streamUrl(song.id))
        val artwork = app.downloads.localCover(song.id)?.let { Uri.fromFile(it) }
            ?: app.api.coverUrl(song.cover)?.let(Uri::parse)
        val extras = Bundle().apply { putString(KEY_SONG, app.api.json.encodeToString(Song.serializer(), song)) }
        return MediaItem.Builder()
            .setMediaId(song.id)
            .setUri(uri)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(song.title)
                    .setArtist(song.artistName)
                    .setAlbumTitle(song.albumTitle)
                    .setArtworkUri(artwork)
                    .setTrackNumber(song.trackNumber)
                    .setIsPlayable(true)
                    .setIsBrowsable(false)
                    .setExtras(extras)
                    .build(),
            )
            .build()
    }

    private fun songOf(item: MediaItem): Song? {
        val raw = item.mediaMetadata.extras?.getString(KEY_SONG)
        if (raw != null) runCatching { return app.api.json.decodeFromString(Song.serializer(), raw) }
        return Song(
            id = item.mediaId,
            title = item.mediaMetadata.title?.toString() ?: "",
            artistName = item.mediaMetadata.artist?.toString(),
            albumTitle = item.mediaMetadata.albumTitle?.toString(),
        )
    }

    companion object {
        private const val KEY_SONG = "cumu_song"
    }
}
