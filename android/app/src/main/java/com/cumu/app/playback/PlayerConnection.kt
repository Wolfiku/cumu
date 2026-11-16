package com.cumu.app.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.cumu.app.CumuApplication
import com.cumu.app.data.Audiobook
import com.cumu.app.data.Song
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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
    /** Playback speed (audiobooks only, music always plays at 1×). */
    val speed: Float = 1f,
    /** Name of the device that plays, when it is not this phone. */
    val remoteDevice: String? = null,
)

/** Active sleep timer: pauses at [endsAt] (epoch ms) or at the end of the current title. */
data class SleepTimer(val endsAt: Long? = null, val endOfTrack: Boolean = false)

/** Speeds offered for audiobooks. */
val AUDIOBOOK_SPEEDS = listOf(0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)

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

                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    // Sleep timer "end of title": the title is over, stop here
                    if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && _sleep.value?.endOfTrack == true) {
                        c.pause()
                        fallAsleep(c)
                    }
                    applySpeed(c)
                    // A new chapter: remember it at once
                    saveAudiobookProgress(c, force = true)
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    if (!isPlaying) saveAudiobookProgress(c, force = true)
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED) {
                        // Last chapter over: the server marks the book as finished
                        saveAudiobookProgress(c, force = true)
                        if (_sleep.value?.endOfTrack == true) fallAsleep(c)
                        // Queue over before autoplay could add songs: add them and go on
                        else maybeAutoplay(c, ended = true)
                    }
                }
            })
            pending.forEach { it(c) }
            pending.clear()
            applySpeed(c)
            listenLive()
            publish()
            // Position ticks while playing
            while (isActive) {
                if (remote != null) publish() // the other device's progress
                if (c.isPlaying) {
                    publish()
                    saveAudiobookProgress(c)
                    fadeBeforeEndOfTrack(c)
                    maybeAutoplay(c)
                }
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
        remote?.let { _state.value = remoteState(it); return }
        reportLocal(c)
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
            speed = c.playbackParameters.speed,
        )
    }

    // ── Live: other devices & listening parties ──────────────────────────────

    /** Another device of the account plays; this phone shows and controls it. */
    private data class Remote(val deviceId: String, val name: String, val state: com.cumu.app.data.LiveState, val receivedAt: Long)

    private var remote: Remote? = null
    private var lastReportKey = ""
    private var lastReportAt = 0L
    private var partySuggestions = 0

    /** True while another device plays and this one is its remote control. */
    val isRemote: Boolean get() = remote != null
    private val isGuest: Boolean get() = app.live.party.value?.isHost == false

    private fun guestNotice() {
        val host = app.live.party.value?.party?.host?.username ?: "Der Gastgeber"
        _messages.tryEmit("Shuffle und Wiederholen stellt $host ein")
    }

    private fun remotePositionMs(r: Remote): Long {
        val s = r.state
        var pos = s.position * 1000
        if (s.isPlaying) pos += (System.currentTimeMillis() - r.receivedAt).toDouble()
        val dur = s.duration * 1000
        return (if (dur > 0) pos.coerceAtMost(dur) else pos).toLong().coerceAtLeast(0)
    }

    private fun remoteState(r: Remote) = PlayerState(
        current = r.state.song,
        isPlaying = r.state.isPlaying,
        positionMs = remotePositionMs(r),
        durationMs = (r.state.duration * 1000).toLong(),
        queue = listOfNotNull(r.state.song),
        index = if (r.state.song != null) 0 else -1,
        shuffle = r.state.shuffle,
        repeatMode = when (r.state.repeat) { "all" -> Player.REPEAT_MODE_ALL; "one" -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF },
        remoteDevice = r.name,
    )

    private fun repeatName(mode: Int) = when (mode) { Player.REPEAT_MODE_ALL -> "all"; Player.REPEAT_MODE_ONE -> "one"; else -> "none" }

    /** Tells the other devices what this phone plays (on changes, and every 5 s while playing). */
    private fun reportLocal(c: MediaController, force: Boolean = false) {
        if (remote != null) return
        val song = c.currentMediaItem?.let(::songOf) ?: return
        val active = app.live.activeDeviceId.value
        if (!c.isPlaying && active != null && active != app.live.deviceId && !force) return
        val key = "${song.id}|${c.isPlaying}|${c.currentMediaItemIndex}|${c.mediaItemCount}|${c.shuffleModeEnabled}|${c.repeatMode}"
        val now = System.currentTimeMillis()
        if (!force && key == lastReportKey && now - lastReportAt < 5000) return
        lastReportKey = key
        lastReportAt = now
        app.live.reportState(
            com.cumu.app.data.LiveState(
                song = song, isPlaying = c.isPlaying,
                position = c.currentPosition.coerceAtLeast(0) / 1000.0,
                duration = (c.duration.takeIf { it > 0 } ?: 0) / 1000.0,
                volume = c.volume.toDouble(), shuffle = c.shuffleModeEnabled, repeat = repeatName(c.repeatMode),
                hasNext = c.hasNextMediaItem(), hasPrev = c.hasPreviousMediaItem(), queueLength = c.mediaItemCount,
            ),
        )
    }

    private fun updateRemote() {
        val activeId = app.live.activeDeviceId.value
        val active = app.live.devices.value.firstOrNull { it.id == activeId }
        val other = active != null && active.id != app.live.deviceId && active.state?.song != null && !isGuest
        if (other && active != null) {
            val st = active.state ?: return
            if (remote == null) {
                // Only one device of the account plays at a time
                withController { if (it.isPlaying) it.pause() }
            }
            val old = remote
            // Same state as before: keep its time, so the progress keeps running smoothly
            remote = Remote(active.id, active.name, st, if (old != null && old.deviceId == active.id && old.state == st) old.receivedAt else System.currentTimeMillis())
        } else if (remote != null && (active == null || active.id == app.live.deviceId || isGuest)) {
            remote = null
        }
        publish()
    }

    private fun listenLive() {
        app.appScope.launch(Dispatchers.Main) {
            kotlinx.coroutines.flow.combine(app.live.devices, app.live.activeDeviceId) { _, _ -> Unit }.collect { updateRemote() }
        }
        app.appScope.launch(Dispatchers.Main) {
            app.live.party.collect { p ->
                if (p == null) partySuggestions = 0
                if (p != null && !p.isHost) { remote = null; publish() }
                if (p != null && p.isHost) withController { reportLocal(it, force = true) }
            }
        }
        app.appScope.launch(Dispatchers.Main) {
            app.live.events.collect { e ->
                when (e) {
                    is com.cumu.app.data.LiveEvent.Command -> handleCommand(e)
                    is com.cumu.app.data.LiveEvent.DeviceState -> {
                        val r = remote
                        if (r != null && r.deviceId == e.deviceId) { remote = r.copy(state = e.state, receivedAt = System.currentTimeMillis()); publish() }
                        else if (e.state.isPlaying && e.deviceId == app.live.activeDeviceId.value) updateRemote()
                    }
                    is com.cumu.app.data.LiveEvent.PartySync -> followParty(e)
                    is com.cumu.app.data.LiveEvent.PartySuggestion -> addSuggestion(e)
                }
            }
        }
        app.appScope.launch { app.live.notices.collect { _messages.tryEmit(it) } }
    }

    private fun jsonSongs(songs: List<Song>) =
        kotlinx.serialization.json.JsonArray(songs.map { app.api.json.encodeToJsonElement(Song.serializer(), it) })

    private fun songsOf(el: kotlinx.serialization.json.JsonElement?): List<Song> =
        (el as? kotlinx.serialization.json.JsonArray)?.mapNotNull { runCatching { app.api.json.decodeFromJsonElement(Song.serializer(), it) }.getOrNull() }.orEmpty()

    private fun num(o: kotlinx.serialization.json.JsonObject, k: String): Double? =
        (o[k] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()

    private fun text(o: kotlinx.serialization.json.JsonObject, k: String): String? =
        (o[k] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content

    /** A command from another device of the account (this phone plays). */
    private fun handleCommand(e: com.cumu.app.data.LiveEvent.Command) {
        val a = e.args
        withController { c ->
            when (e.command) {
                "play" -> c.play()
                "pause" -> c.pause()
                "toggle" -> if (c.isPlaying) c.pause() else c.play()
                "next" -> c.seekToNextMediaItem()
                "prev" -> c.seekToPrevious()
                "seek" -> num(a, "position")?.let { c.seekTo((it * 1000).toLong()) }
                "volume" -> num(a, "value")?.let { c.volume = it.toFloat().coerceIn(0f, 1f) }
                "shuffle" -> c.shuffleModeEnabled = text(a, "value") == "true" || (a["value"] as? kotlinx.serialization.json.JsonPrimitive)?.content == "true"
                "repeat" -> c.repeatMode = when (text(a, "value")) { "all" -> Player.REPEAT_MODE_ALL; "one" -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF }
                "play_songs" -> {
                    val songs = songsOf(a["songs"])
                    if (songs.isNotEmpty()) {
                        remote = null
                        val i = (num(a, "index") ?: 0.0).toInt().coerceIn(songs.indices)
                        c.setMediaItems(songs.map(::itemOf), i, 0)
                        c.prepare(); c.play()
                    }
                }
                "transfer" -> text(a, "to")?.let { handOffTo(c, it) }
                "handoff" -> {
                    val songs = songsOf(a["queue"])
                    if (songs.isNotEmpty()) {
                        remote = null
                        val i = (num(a, "index") ?: 0.0).toInt().coerceIn(songs.indices)
                        c.shuffleModeEnabled = (a["shuffle"] as? kotlinx.serialization.json.JsonPrimitive)?.content == "true"
                        c.setMediaItems(songs.map(::itemOf), i, ((num(a, "position") ?: 0.0) * 1000).toLong())
                        c.prepare(); c.play()
                        _messages.tryEmit("Wiedergabe von ${e.fromName.ifBlank { "einem anderen Gerät" }} übernommen")
                    }
                }
            }
            publish()
            reportLocal(c, force = true)
        }
    }

    /** Gives the queue and position to another device and stops here. */
    private fun handOffTo(c: MediaController, targetId: String) {
        if (targetId == app.live.deviceId || c.mediaItemCount == 0) return
        val from = (c.currentMediaItemIndex - 50).coerceAtLeast(0)
        val to = (c.currentMediaItemIndex + 250).coerceAtMost(c.mediaItemCount)
        val songs = (from until to).mapNotNull { songOf(c.getMediaItemAt(it)) }
        app.live.sendCommand(targetId, "handoff", kotlinx.serialization.json.buildJsonObject {
            put("queue", jsonSongs(songs))
            put("index", kotlinx.serialization.json.JsonPrimitive(c.currentMediaItemIndex - from))
            put("position", kotlinx.serialization.json.JsonPrimitive(c.currentPosition / 1000.0))
            put("isPlaying", kotlinx.serialization.json.JsonPrimitive(true))
            put("shuffle", kotlinx.serialization.json.JsonPrimitive(c.shuffleModeEnabled))
            put("repeat", kotlinx.serialization.json.JsonPrimitive(repeatName(c.repeatMode)))
        })
        c.pause()
    }

    /** "Play on" a device from the device list. */
    fun playOnDevice(targetId: String) {
        val r = remote
        if (r != null) {
            if (targetId != r.deviceId) app.live.sendCommand(r.deviceId, "transfer", kotlinx.serialization.json.buildJsonObject { put("to", kotlinx.serialization.json.JsonPrimitive(targetId)) })
            return
        }
        if (targetId == app.live.deviceId) return
        withController { c ->
            if (c.mediaItemCount == 0) _messages.tryEmit("Starte zuerst einen Song") else handOffTo(c, targetId)
        }
    }

    /** Sends a command to the playing device instead of playing here. Returns true when it did. */
    private fun routeRemote(command: String, args: kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.JsonObject(emptyMap())): Boolean {
        // In a party everyone controls: the host's device carries the command out
        if (isGuest) { partyControl(command, args); return true }
        val r = remote ?: return false
        app.live.sendCommand(r.deviceId, command, args)
        return true
    }

    private fun partyControl(command: String, args: kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.JsonObject(emptyMap())) {
        app.live.send("party_control", kotlinx.serialization.json.buildJsonObject {
            put("command", kotlinx.serialization.json.JsonPrimitive(command))
            put("args", args)
        })
    }

    /** Guest of a party: plays what the host plays, in sync. */
    private fun followParty(e: com.cumu.app.data.LiveEvent.PartySync) {
        if (!isGuest) return
        val song = e.state.song ?: return
        val targetMs = ((e.state.position + if (e.state.isPlaying) (e.ageMs + 150) / 1000.0 else 0.0) * 1000).toLong()
        withController { c ->
            val cur = c.currentMediaItem?.let(::songOf)
            if (cur?.id != song.id) {
                c.shuffleModeEnabled = false
                c.repeatMode = Player.REPEAT_MODE_OFF
                c.setMediaItems(listOf(itemOf(song)), 0, targetMs)
                c.prepare()
                if (e.state.isPlaying) c.play() else c.pause()
                return@withController
            }
            if (e.state.isPlaying && !c.isPlaying) c.play()
            if (!e.state.isPlaying && c.isPlaying) c.pause()
            if (kotlin.math.abs(c.currentPosition - targetMs) > 1500) c.seekTo(targetMs)
        }
    }

    /** Host: a guest suggests a song; it plays right after the current one (in order). */
    private fun addSuggestion(e: com.cumu.app.data.LiveEvent.PartySuggestion) {
        if (app.live.party.value?.isHost != true) return
        withController { c ->
            val at = (c.currentMediaItemIndex + 1 + partySuggestions).coerceAtMost(c.mediaItemCount)
            c.addMediaItem(at, itemOf(e.song))
            partySuggestions++
            _messages.tryEmit("${e.by} schlägt „${e.song.title}“ vor")
        }
    }

    fun startParty() {
        if (remote != null) { _messages.tryEmit("Starte die Party auf ${remote?.name} oder hol die Wiedergabe erst hierher"); return }
        withController { c ->
            if (c.mediaItemCount == 0) { _messages.tryEmit("Starte zuerst einen Song, dann die Party"); return@withController }
            reportLocal(c, force = true)
            app.live.startParty()
        }
    }

    /** Song menu of a party guest: send it to the host. */
    fun suggestToParty(song: Song) {
        app.live.suggestToParty(song)
    }

    // ── Sleep timer ──────────────────────────────────────────────────────────

    private val _sleep = MutableStateFlow<SleepTimer?>(null)
    val sleep: StateFlow<SleepTimer?> = _sleep.asStateFlow()
    private var sleepJob: Job? = null

    /** Pauses playback in [minutes]; the music fades out over the last 15 seconds. */
    fun setSleepTimer(minutes: Int) = startSleepTimer(System.currentTimeMillis() + minutes * 60_000L)

    /** Adds [minutes] to a running timer (or starts one). */
    fun extendSleepTimer(minutes: Int) {
        val endsAt = _sleep.value?.endsAt
        if (endsAt == null) setSleepTimer(minutes) else startSleepTimer(endsAt + minutes * 60_000L)
    }

    private fun startSleepTimer(endsAt: Long) {
        sleepJob?.cancel()
        withController { it.volume = 1f }
        _sleep.value = SleepTimer(endsAt = endsAt)
        sleepJob = app.appScope.launch(Dispatchers.Main) {
            // Cancelling the timer stops this loop inside delay()
            while (true) {
                val left = endsAt - System.currentTimeMillis()
                if (left <= 0) break
                val c = controller
                if (c != null && left < FADE_MS) c.volume = (left.toFloat() / FADE_MS).coerceIn(0f, 1f)
                delay(if (left < FADE_MS) 200L else (left - FADE_MS).coerceIn(200L, 1000L))
            }
            controller?.let { c ->
                c.pause()
                fallAsleep(c)
            }
        }
    }

    /** Pauses once the current title (or audiobook chapter) is over. */
    fun sleepAtEndOfTrack() {
        sleepJob?.cancel()
        sleepJob = null
        withController { it.volume = 1f }
        _sleep.value = SleepTimer(endOfTrack = true)
    }

    fun cancelSleepTimer() {
        sleepJob?.cancel()
        sleepJob = null
        _sleep.value = null
        withController { it.volume = 1f }
    }

    private fun fallAsleep(c: MediaController) {
        sleepJob = null
        _sleep.value = null
        saveAudiobookProgress(c, force = true)
        // Back to full volume for the next time the user presses play
        app.appScope.launch(Dispatchers.Main) { delay(300); c.volume = 1f }
        _messages.tryEmit("Sleep-Timer: Wiedergabe pausiert")
    }

    /** "End of title": fade out over the last seconds of the title. */
    private fun fadeBeforeEndOfTrack(c: MediaController) {
        if (_sleep.value?.endOfTrack != true || c.duration <= 0) return
        val left = ((c.duration - c.currentPosition) / c.playbackParameters.speed.coerceAtLeast(0.1f)).toLong()
        c.volume = if (left < END_FADE_MS) (left.toFloat() / END_FADE_MS).coerceIn(0.05f, 1f) else 1f
    }

    // ── Autoplay ─────────────────────────────────────────────────────────────

    private var autoplayFor: String? = null

    /**
     * Near the end of the queue: appends similar music, so playback (and the
     * crossfade) simply continues. Never after audiobooks, never with repeat.
     */
    private fun maybeAutoplay(c: MediaController, ended: Boolean = false) {
        if (isGuest || remote != null) return // the host / the other device decides
        if (!app.playback.state.value.autoplay || app.api.offline.value) return
        val cur = c.currentMediaItem?.let(::songOf) ?: return
        if (cur.isAudiobook || c.repeatMode != Player.REPEAT_MODE_OFF) return
        if (c.nextMediaItemIndex != androidx.media3.common.C.INDEX_UNSET) return
        if (!ended && (c.duration <= 0 || c.duration - c.currentPosition > 30_000)) return
        if (autoplayFor == cur.id && !ended) return
        autoplayFor = cur.id
        val all = (0 until c.mediaItemCount).mapNotNull { songOf(c.getMediaItemAt(it)) }.filter { !it.isAudiobook }
        val seeds = all.take(c.currentMediaItemIndex + 1).takeLast(5).map { it.id }
        val exclude = all.takeLast(100).map { it.id }
        app.appScope.launch {
            val songs = app.repo.radio(seeds, exclude).filter { !it.isAudiobook }
            if (songs.isEmpty()) return@launch
            withController { ctl ->
                // The queue changed meanwhile (new list started): leave it alone
                if (ctl.currentMediaItem?.mediaId != cur.id) return@withController
                val firstNew = ctl.mediaItemCount
                ctl.addMediaItems(songs.map { itemOf(it.copy(autoplay = 1)) })
                if (ended || ctl.playbackState == Player.STATE_ENDED) {
                    ctl.seekTo(firstNew, 0)
                    ctl.play()
                }
            }
        }
    }

    // ── Audiobooks ───────────────────────────────────────────────────────────

    private val prefs = app.getSharedPreferences("cumu_player", Context.MODE_PRIVATE)

    /** Speed for audiobooks, kept for the next books. */
    val audiobookSpeed: Float get() = prefs.getFloat(KEY_SPEED, 1f).takeIf { it in AUDIOBOOK_SPEEDS } ?: 1f

    fun setAudiobookSpeed(speed: Float) {
        prefs.edit().putFloat(KEY_SPEED, speed).apply()
        withController { applySpeed(it) }
    }

    /** Audiobook chapters play at the chosen speed, music always at 1×. */
    private fun applySpeed(c: MediaController) {
        val book = c.currentMediaItem?.let(::songOf)?.isAudiobook == true
        val want = if (book) audiobookSpeed else 1f
        if (c.playbackParameters.speed != want) c.setPlaybackSpeed(want)
    }

    /**
     * Starts a book: at the saved position, at [chapterIndex] (from its
     * beginning) or, with [restart], from the very beginning.
     */
    fun playAudiobook(book: Audiobook, chapterIndex: Int? = null, restart: Boolean = false) {
        val chapters = book.chapters.map {
            it.copy(
                audiobookFlag = 1, bookId = book.id, bookTitle = book.title,
                cover = it.cover ?: book.cover, albumTitle = it.albumTitle ?: book.title,
                artistName = it.artistName ?: book.artistName,
            )
        }
        if (chapters.isEmpty()) return
        val p = book.progress
        var index = 0
        var startMs = 0L
        if (chapterIndex != null) {
            index = chapterIndex.coerceIn(chapters.indices)
        } else if (p != null && !p.finished && !restart) {
            index = chapters.indexOfFirst { it.id == p.songId }.coerceAtLeast(0)
            // A few seconds back, so the user finds back into the story
            startMs = ((p.position - 3.0).coerceAtLeast(0.0) * 1000).toLong()
        }
        val (songs, start) = playable(chapters, index) ?: return
        if (songs[start].id != chapters[index].id) startMs = 0
        val items = songs.map(::itemOf)
        withController { c ->
            c.shuffleModeEnabled = false
            c.repeatMode = Player.REPEAT_MODE_OFF
            c.setMediaItems(items, start, startMs)
            c.prepare()
            applySpeed(c)
            c.play()
        }
    }

    /** All chapters of a book to the end of the queue (book info attached). */
    fun enqueueAudiobook(book: Audiobook) {
        enqueue(book.chapters.map {
            it.copy(audiobookFlag = 1, bookId = book.id, bookTitle = book.title, cover = it.cover ?: book.cover, albumTitle = it.albumTitle ?: book.title)
        })
    }

    /** Jumps [deltaMs] forward (or back when negative) in the current title. */
    fun seekBy(deltaMs: Long) {
        remote?.let { r -> seekTo(remotePositionMs(r) + deltaMs); return }
        seekByLocal(deltaMs)
    }

    private fun seekByLocal(deltaMs: Long) = withController { c ->
        var target = c.currentPosition + deltaMs
        if (c.duration > 0) target = target.coerceAtMost(c.duration - 500)
        c.seekTo(target.coerceAtLeast(0))
    }

    private var lastProgressSave = 0L

    /** Sends the position in the current audiobook to the server (at most every 15 s unless [force]). */
    private fun saveAudiobookProgress(c: MediaController, force: Boolean = false) {
        val song = c.currentMediaItem?.let(::songOf) ?: return
        if (!song.isAudiobook) return
        val now = System.currentTimeMillis()
        if (!force && now - lastProgressSave < 15_000) return
        lastProgressSave = now
        val positionSec = c.currentPosition.coerceAtLeast(0) / 1000.0
        app.appScope.launch {
            runCatching { app.repo.saveAudiobookProgress(song.audiobookId, song.id, positionSec) }
        }
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
        // Party guest: the songs start for the whole party (on the host's device)
        if (isGuest) {
            val from = (startAt - 50).coerceAtLeast(0)
            partyControl("play_songs", kotlinx.serialization.json.buildJsonObject {
                put("songs", jsonSongs(all.subList(from, (startAt + 250).coerceAtMost(all.size))))
                put("index", kotlinx.serialization.json.JsonPrimitive(startAt - from))
            })
            return
        }
        // Another device plays: start the songs there
        remote?.let { r ->
            val from = (startAt - 50).coerceAtLeast(0)
            app.live.sendCommand(r.deviceId, "play_songs", kotlinx.serialization.json.buildJsonObject {
                put("songs", jsonSongs(all.subList(from, (startAt + 250).coerceAtMost(all.size))))
                put("index", kotlinx.serialization.json.JsonPrimitive(startAt - from))
            })
            return
        }
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

    fun togglePlay() {
        if (routeRemote("toggle")) {
            remote?.let { r -> remote = r.copy(state = r.state.copy(isPlaying = !r.state.isPlaying, position = remotePositionMs(r) / 1000.0), receivedAt = System.currentTimeMillis()); publish() }
            return
        }
        togglePlayLocal()
    }

    private fun togglePlayLocal() = withController { c ->
        if (c.playerError != null) { c.prepare(); c.play(); return@withController }
        if (c.isPlaying) c.pause() else {
            if (c.playbackState == Player.STATE_ENDED) c.seekTo(0, 0)
            c.play()
        }
    }

    fun next() { if (!routeRemote("next")) withController { it.seekToNextMediaItem() } }
    fun previous() { if (!routeRemote("prev")) withController { it.seekToPrevious() } }
    fun seekTo(ms: Long) {
        val r = remote
        if (r != null && !isGuest) {
            app.live.sendCommand(r.deviceId, "seek", kotlinx.serialization.json.buildJsonObject { put("position", kotlinx.serialization.json.JsonPrimitive(ms / 1000.0)) })
            remote = r.copy(state = r.state.copy(position = ms / 1000.0), receivedAt = System.currentTimeMillis())
            publish()
            return
        }
        if (isGuest) {
            partyControl("seek", kotlinx.serialization.json.buildJsonObject { put("position", kotlinx.serialization.json.JsonPrimitive(ms / 1000.0)) })
            return
        }
        withController { it.seekTo(ms) }
    }
    fun skipTo(index: Int) = withController { it.seekTo(index, 0); it.play() }
    fun removeAt(index: Int) = withController { it.removeMediaItem(index) }
    fun move(from: Int, to: Int) = withController { it.moveMediaItem(from, to) }
    fun toggleShuffle() {
        remote?.let { r ->
            routeRemote("shuffle", kotlinx.serialization.json.buildJsonObject { put("value", kotlinx.serialization.json.JsonPrimitive(!r.state.shuffle)) })
            return
        }
        if (isGuest) { guestNotice(); return }
        withController { it.shuffleModeEnabled = !it.shuffleModeEnabled }
    }
    fun cycleRepeat() {
        remote?.let { r ->
            val next = when (r.state.repeat) { "none", null -> "all"; "all" -> "one"; else -> "none" }
            routeRemote("repeat", kotlinx.serialization.json.buildJsonObject { put("value", kotlinx.serialization.json.JsonPrimitive(next)) })
            return
        }
        if (isGuest) { guestNotice(); return }
        cycleRepeatLocal()
    }
    private fun cycleRepeatLocal() = withController {
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
        /** Extras key of the Song JSON inside every MediaItem (also read by PlaybackService). */
        const val KEY_SONG = "cumu_song"
        private const val KEY_SPEED = "audiobook_speed"
        private const val FADE_MS = 15_000L
        private const val END_FADE_MS = 8_000L
    }
}
