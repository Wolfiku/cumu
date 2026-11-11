package com.cumu.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Song

/** How much of a list (album, playlist) is on the phone. */
data class DownloadState(val done: Int, val total: Int, val running: Int) {
    val complete get() = total > 0 && done >= total
    val partial get() = done in 1 until total
    val active get() = running > 0
}

/** Download state of a known song list. */
@Composable
fun rememberDownloadState(songs: List<Song>): DownloadState {
    val app = CumuApplication.instance
    val downloaded by app.downloads.songs.collectAsState()
    val running by app.downloads.progress.collectAsState()
    return DownloadState(
        done = songs.count { downloaded.containsKey(it.id) },
        total = songs.size,
        running = songs.count { running.containsKey(it.id) },
    )
}

/** Download state of a list known only by its song ids (playlist summaries). */
@Composable
fun rememberDownloadStateOfIds(ids: List<String>): DownloadState {
    val app = CumuApplication.instance
    val downloaded by app.downloads.songs.collectAsState()
    val running by app.downloads.progress.collectAsState()
    return DownloadState(
        done = ids.count { downloaded.containsKey(it) },
        total = ids.size,
        running = ids.count { running.containsKey(it) },
    )
}

/** Download state of an album, from its song count (the list endpoint has no song ids). */
@Composable
fun rememberAlbumDownloadState(albumId: String, songCount: Int): DownloadState {
    val app = CumuApplication.instance
    val downloaded by app.downloads.songs.collectAsState()
    val running by app.downloads.runningAlbums.collectAsState()
    val done = downloaded.values.count { it.song.albumId == albumId }
    return DownloadState(done = done, total = maxOf(songCount, done), running = running[albumId] ?: 0)
}

/**
 * Status icon on the right of a playlist or album:
 * a filled check when everything is on the phone, a ring while loading or
 * partly downloaded, and a download button otherwise.
 */
@Composable
fun DownloadBadge(state: DownloadState, onDownload: (() -> Unit)?, modifier: Modifier = Modifier) {
    val key = when {
        state.complete -> 2
        state.active || state.partial -> 1
        else -> 0
    }
    AnimatedContent(
        targetState = key,
        transitionSpec = { (scaleIn() + fadeIn()) togetherWith (scaleOut() + fadeOut()) },
        label = "download",
        modifier = modifier,
    ) { k ->
        when (k) {
            2 -> Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                Box(
                    Modifier.size(22.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondary),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.Check, "Heruntergeladen", Modifier.size(15.dp), tint = MaterialTheme.colorScheme.onSecondary)
                }
            }
            // Partly downloaded: tapping loads the rest
            1 -> Box(
                Modifier.size(48.dp).clip(CircleShape)
                    .then(if (!state.active && onDownload != null) Modifier.clickable(onClick = onDownload) else Modifier),
                contentAlignment = Alignment.Center,
            ) {
                val target = if (state.total > 0) state.done.toFloat() / state.total else 0f
                val p by animateFloatAsState(target, label = "dl")
                if (state.active && state.done == 0) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp)
                else CircularProgressIndicator(progress = { p }, modifier = Modifier.size(22.dp), strokeWidth = 2.5.dp, trackColor = MaterialTheme.colorScheme.surfaceContainerHighest)
                Icon(Icons.Rounded.ArrowDownward, null, Modifier.size(12.dp), tint = MaterialTheme.colorScheme.primary)
            }
            else -> if (onDownload != null) IconButton(onClick = onDownload) {
                Icon(Icons.Rounded.Download, "Herunterladen", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            } else Box(Modifier.size(48.dp))
        }
    }
}
