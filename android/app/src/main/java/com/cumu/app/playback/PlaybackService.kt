package com.cumu.app.playback

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
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
import kotlinx.coroutines.launch

/**
 * Runs playback in a foreground service, so music keeps playing with the
 * screen off or in other apps. Media3 provides the media notification, lock
 * screen controls, Bluetooth/headset buttons and audio focus handling.
 *
 * Streams straight from /stream/:id with HTTP Range (instant start and
 * seeking). The bearer token is added per request, so a token refreshed
 * during a long queue is picked up. Downloaded songs play from local files.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {

    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val app = application as CumuApplication

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

        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(resolving))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true) // pause when headphones are unplugged
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        // Count plays on the server like the web app does
        // (once per item, when it actually starts playing)
        player.addListener(object : Player.Listener {
            private var counted = false
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                counted = false
                if (player.isPlaying) countCurrent()
            }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) countCurrent()
            }
            private fun countCurrent() {
                if (counted) return
                val id = player.currentMediaItem?.mediaId ?: return
                counted = true
                app.appScope.launch { app.repo.reportPlay(id) }
            }
        })

        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, player)
            .setSessionActivity(openApp)
            .build()
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
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }
}
