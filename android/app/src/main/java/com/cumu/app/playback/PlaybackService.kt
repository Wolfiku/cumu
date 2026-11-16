package com.cumu.app.playback

import android.app.PendingIntent
import android.content.Intent
import android.media.AudioManager
import android.media.audiofx.LoudnessEnhancer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.cumu.app.CumuApplication
import com.cumu.app.MainActivity
import com.cumu.app.data.Song
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * Runs playback in a foreground service, so music keeps playing with the
 * screen off or in other apps. Media3 provides the media notification, lock
 * screen controls, Bluetooth/headset buttons and audio focus handling.
 *
 * Streams straight from /stream/:id with HTTP Range (instant start and
 * seeking). The bearer token is added per request, so a token refreshed
 * during a long queue is picked up. Downloaded songs play from local files.
 *
 * Transitions (music only, never audiobooks):
 *  - Void skipping: the silence at the start and end of a song (measured by
 *    the server) is skipped.
 *  - Crossfade: a second player keeps playing the end of the old song while
 *    the main player (the one the media session shows) starts the next song.
 *    With void skipping the silence counts towards the fade: 3 s of silence
 *    and a 5 s crossfade give a 2 s fade of real sound.
 *  - Normalization: every song is brought to the same loudness (quieter via
 *    the volume, louder via a LoudnessEnhancer on the audio session).
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {

    private var session: MediaSession? = null
    private lateinit var app: CumuApplication
    private lateinit var main: ExoPlayer
    private lateinit var fader: ExoPlayer
    private var mainEnhancer: LoudnessEnhancer? = null
    private var faderEnhancer: LoudnessEnhancer? = null
    private val handler = Handler(Looper.getMainLooper())

    // Volume of the main player = user volume (sleep timer) × fade × normalization
    private var userVolume = 1f
    private var mainFade = 1f
    private var mainNorm = 1f
    private var faderNorm = 1f

    private var fading = false
    private var faderKey: String? = null
    private var ownSeek = false

    override fun onCreate() {
        super.onCreate()
        app = application as CumuApplication

        main = buildPlayer(handleFocus = true)
        fader = buildPlayer(handleFocus = false)
        mainEnhancer = enhancerFor(main)
        faderEnhancer = enhancerFor(fader)

        main.addListener(object : Player.Listener {
            // Count plays on the server like the web app does
            // (once per item, when it actually starts playing)
            private var counted = false

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                counted = false
                if (main.isPlaying) countCurrent()
                mainNorm = applyNormalization(mainEnhancer, songOf(mediaItem))
                applyMainVolume()
                skipIntro(mediaItem)
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) countCurrent()
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (!playWhenReady) stopFade() // paused during a crossfade: end it
            }

            override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
                // The user seeks or skips during a crossfade: the old song stops at once
                if (reason == Player.DISCONTINUITY_REASON_SEEK && !ownSeek) stopFade()
            }

            override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) {
                if (reason == Player.TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED) faderKey = null
            }

            private fun countCurrent() {
                if (counted) return
                val id = main.currentMediaItem?.mediaId ?: return
                counted = true
                app.appScope.launch { app.repo.reportPlay(id) }
            }
        })

        // The session controls the main player; its volume is the user's part
        // (sleep timer fade), fades and normalization are applied on top
        val sessionPlayer = object : ForwardingPlayer(main) {
            override fun setVolume(volume: Float) {
                userVolume = volume.coerceIn(0f, 1f)
                applyMainVolume()
                if (fading) fader.volume = userVolume * faderNorm
            }

            override fun getVolume(): Float = userVolume
        }

        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, sessionPlayer)
            .setSessionActivity(openApp)
            .build()

        handler.post(tick)
    }

    private fun buildPlayer(handleFocus: Boolean): ExoPlayer {
        val httpFactory = OkHttpDataSource.Factory(app.api.baseHttp)
        // Offline copies replace the stream; otherwise add the current token
        val resolving = ResolvingDataSource.Factory(DefaultDataSource.Factory(this, httpFactory)) { spec: DataSpec ->
            val id = spec.uri.lastPathSegment
            val local = if (spec.uri.scheme?.startsWith("http") == true && id != null) app.downloads.localFile(id) else null
            when {
                local != null -> spec.withUri(Uri.fromFile(local))
                spec.uri.scheme?.startsWith("http") == true -> {
                    val token = runCatching { app.api.freshAccessToken() }.getOrNull()
                    if (token != null) spec.withAdditionalHeaders(mapOf("Authorization" to "Bearer $token")) else spec
                }
                else -> spec
            }
        }
        return ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(resolving))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                // Only the main player takes the audio focus; the fader just plays out the old song
                handleFocus,
            )
            .setHandleAudioBecomingNoisy(handleFocus) // pause when headphones are unplugged
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
    }

    /** Own audio session per player, with a LoudnessEnhancer for boosting quiet songs. */
    private fun enhancerFor(p: ExoPlayer): LoudnessEnhancer? = runCatching {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        val id = am.generateAudioSessionId()
        p.setAudioSessionId(id)
        LoudnessEnhancer(id).also {
            it.setTargetGain(0)
            it.setEnabled(true)
        }
    }.getOrNull()

    private fun songOf(item: MediaItem?): Song? {
        val raw = item?.mediaMetadata?.extras?.getString(PlayerConnection.KEY_SONG) ?: return null
        return runCatching { app.api.json.decodeFromString(Song.serializer(), raw) }.getOrNull()
    }

    private val settings: com.cumu.app.data.PlaybackSettings.Values get() = app.playback.state.value

    private fun isMusic(s: Song?) = s != null && !s.isAudiobook

    private fun introMs(s: Song?): Long {
        if (!settings.voidSkip || !isMusic(s)) return 0L
        return (s?.introSilenceMs ?: 0L).takeIf { it > 250L } ?: 0L
    }

    private fun outroMs(s: Song?): Long {
        if (!settings.voidSkip || !isMusic(s)) return 0L
        return (s?.outroSilenceMs ?: 0L).takeIf { it > 250L } ?: 0L
    }

    // ── Normalization ────────────────────────────────────────────────────────

    /** Sets the boost of [enhancer] for [song] and returns the volume factor (≤ 1) for the cut. */
    private fun applyNormalization(enhancer: LoudnessEnhancer?, song: Song?): Float {
        val db = if (settings.normalize && isMusic(song)) song?.loudnessGainDb ?: 0.0 else 0.0
        val boostDb = if (db > 0 && enhancer != null) db else 0.0
        runCatching { enhancer?.setTargetGain((boostDb * 100).toInt()) }
        val cutDb = if (db < 0) db else 0.0
        return 10.0.pow(cutDb / 20.0).toFloat()
    }

    private fun applyMainVolume() {
        main.volume = (userVolume * mainFade * mainNorm).coerceIn(0f, 1f)
    }

    // ── Transitions ──────────────────────────────────────────────────────────

    private val tick = object : Runnable {
        override fun run() {
            runCatching { checkTransition() }
            handler.postDelayed(this, if (main.isPlaying) 50L else 500L)
        }
    }

    /** Starts the next song at its sound after the silence, when playback reached it naturally. */
    private fun skipIntro(item: MediaItem?) {
        if (fading) return // the crossfade already started the next song at its sound
        val intro = introMs(songOf(item))
        if (intro > 0 && main.currentPosition < 500) {
            ownSeek = true
            main.seekTo(intro)
            ownSeek = false
        }
    }

    private fun checkTransition() {
        if (!main.isPlaying || fading) return
        val item = main.currentMediaItem ?: return
        val cur = songOf(item)
        if (!isMusic(cur)) return
        val dur = main.duration
        if (dur == C.TIME_UNSET || dur <= 0) return
        val nextIndex = main.nextMediaItemIndex
        if (nextIndex == C.INDEX_UNSET || nextIndex == main.currentMediaItemIndex) return
        val next = songOf(main.getMediaItemAt(nextIndex))
        if (!isMusic(next)) return

        val pos = main.currentPosition
        val outro = min(outroMs(cur), max(0L, dur - 2000))
        val endPoint = dur - outro
        val crossfade = settings.crossfadeSec * 1000L
        val fadeMs = if (crossfade > 0) max(0L, crossfade - outro) else 0L
        val startAt = endPoint - fadeMs
        if (pos < 1000) return

        if (fadeMs > 0) {
            // Buffer the end of the old song in the fader a few seconds ahead
            if (startAt - pos in 0L..7000L) prepareFader(item, startAt)
            if (pos >= startAt) startCrossfade(item, cur, nextIndex, next, min(fadeMs, max(300L, endPoint - pos)))
        } else if (outro > 0 && pos >= endPoint - 80) {
            // Void skipping without crossfade: cut straight to the next sound
            ownSeek = true
            main.seekTo(nextIndex, introMs(next))
            ownSeek = false
        }
    }

    private fun keyOf(item: MediaItem) = "${item.mediaId}@${main.currentMediaItemIndex}"

    private fun prepareFader(item: MediaItem, startMs: Long) {
        if (faderKey == keyOf(item)) return
        faderKey = keyOf(item)
        fader.volume = 0f
        fader.playWhenReady = false
        fader.setMediaItem(item, startMs)
        fader.prepare()
    }

    private fun startCrossfade(item: MediaItem, cur: Song?, nextIndex: Int, next: Song?, fadeMs: Long) {
        fading = true
        val pos = main.currentPosition
        if (faderKey != keyOf(item)) {
            fader.setMediaItem(item, pos)
            fader.prepare()
        } else if (abs(fader.currentPosition - pos) > 400) {
            fader.seekTo(pos)
        }
        faderKey = null
        // The fader plays the old song at the old song's loudness
        faderNorm = applyNormalization(faderEnhancer, cur)
        fader.volume = userVolume * faderNorm
        fader.play()

        // The main player starts the next song (at its sound) from silence
        mainFade = 0f
        applyMainVolume()
        ownSeek = true
        main.seekTo(nextIndex, introMs(next))
        ownSeek = false

        val start = SystemClock.elapsedRealtime()
        handler.post(object : Runnable {
            override fun run() {
                if (!fading) return
                val t = ((SystemClock.elapsedRealtime() - start).toFloat() / fadeMs).coerceIn(0f, 1f)
                // Equal-power curves: no dip in loudness in the middle of the fade
                mainFade = sin(t * PI / 2).toFloat()
                applyMainVolume()
                fader.volume = userVolume * faderNorm * cos(t * PI / 2).toFloat()
                if (t < 1f) handler.postDelayed(this, 40) else stopFade()
            }
        })
    }

    /** Ends a running crossfade: the old song stops, the new one plays at full volume. */
    private fun stopFade() {
        if (!fading && faderKey == null) return
        fading = false
        faderKey = null
        fader.stop()
        fader.clearMediaItems()
        mainFade = 1f
        applyMainVolume()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /** Swiping the app away stops the service only when nothing is playing. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        runCatching { mainEnhancer?.release() }
        runCatching { faderEnhancer?.release() }
        fader.release()
        session?.run {
            main.release()
            release()
        }
        session = null
        super.onDestroy()
    }
}
