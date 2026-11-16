package com.cumu.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Celebration
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlaylistPlay
import androidx.compose.material.icons.rounded.RemoveCircleOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Song
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.LocalSnackbar
import kotlinx.coroutines.launch

/**
 * One song in a list. Tap plays [list] from this song; the menu offers
 * queue, playlist, download and navigation actions.
 */
@Composable
fun SongRow(
    song: Song,
    list: List<Song>,
    index: Int,
    showCover: Boolean = true,
    leading: String? = null,
    onRemove: (() -> Unit)? = null,
    removeLabel: String = "Aus Playlist entfernen",
    onPlay: (() -> Unit)? = null,
    /** Extra text after artist · album, e.g. "hinzugefügt von anna". */
    extra: String? = null,
) {
    val app = CumuApplication.instance
    val player by app.player.state.collectAsState()
    val downloaded by app.downloads.songs.collectAsState()
    val progress by app.downloads.progress.collectAsState()
    val isCurrent = player.current?.id == song.id
    val offline by app.api.offline.collectAsState()
    // Offline only downloaded songs can play: the others are dimmed
    val unavailable = offline && !downloaded.containsKey(song.id)

    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .alpha(if (unavailable) 0.4f else 1f)
            .clickable { onPlay?.invoke(); app.player.play(list, index) }
            .padding(start = 20.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when {
            leading != null -> Box(Modifier.width(32.dp)) {
                if (isCurrent) EqualizerBars(player.isPlaying)
                else Text(leading, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            showCover -> {
                Box(contentAlignment = Alignment.Center) {
                    Cover(song.cover, 52.dp, songId = song.id, seed = song.title)
                    // Playing song: darkened cover with moving bars
                    androidx.compose.animation.AnimatedVisibility(isCurrent, enter = androidx.compose.animation.fadeIn(), exit = androidx.compose.animation.fadeOut()) {
                        Box(
                            Modifier.size(52.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                                .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.45f)),
                            contentAlignment = Alignment.Center,
                        ) { EqualizerBars(player.isPlaying, color = androidx.compose.ui.graphics.Color.White) }
                    }
                }
                Spacer(Modifier.width(14.dp))
            }
        }
        Column(Modifier.weight(1f)) {
            Text(
                song.title,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                color = if (isCurrent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
            Text(
                listOfNotNull(song.artistName, song.albumTitle, extra).joinToString(" · ").ifEmpty { "Unbekannt" },
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        val p = progress[song.id]
        when {
            p != null -> Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) {
                if (p < 0) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else CircularProgressIndicator(progress = { p }, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            }
            downloaded.containsKey(song.id) -> Icon(
                Icons.Rounded.DownloadDone, "Heruntergeladen", Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
        Text(
            formatDuration(song.duration),
            Modifier.padding(horizontal = 8.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SongMenu(song, onRemove, removeLabel)
    }
}

/**
 * The ⋮ menu of a song. In the player, [onSleepTimer] adds the sleep timer
 * as first entry.
 */
@Composable
fun SongMenu(song: Song, onRemove: (() -> Unit)? = null, removeLabel: String = "Entfernen", onSleepTimer: (() -> Unit)? = null) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val downloaded by app.downloads.songs.collectAsState()
    val favorites by app.repo.favorites.collectAsState()
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf(false) }
    var pickPlaylist by remember { mutableStateOf(false) }
    var share by remember { mutableStateOf(false) }

    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Rounded.MoreVert, "Mehr") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (onSleepTimer != null) {
                val sleep by app.player.sleep.collectAsState()
                DropdownMenuItem(
                    text = {
                        Column {
                            Text("Sleep-Timer")
                            sleep?.let { t ->
                                Text(
                                    sleepTimerLabel(t, song.isAudiobook),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    },
                    leadingIcon = { Icon(Icons.Rounded.Bedtime, null, tint = if (sleep != null) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Unspecified) },
                    onClick = { open = false; onSleepTimer() },
                )
                HorizontalDivider()
            }
            DropdownMenuItem(
                text = { Text("Als Nächstes spielen") },
                leadingIcon = { Icon(Icons.Rounded.PlaylistPlay, null) },
                onClick = { open = false; app.player.playNext(song); snackbar("Wird als Nächstes gespielt") },
            )
            DropdownMenuItem(
                text = { Text("Zur Warteschlange") },
                leadingIcon = { Icon(Icons.AutoMirrored.Rounded.QueueMusic, null) },
                onClick = { open = false; app.player.enqueue(listOf(song)); snackbar("Zur Warteschlange hinzugefügt") },
            )
            val favorite = song.id in favorites
            DropdownMenuItem(
                text = { Text(if (favorite) "Aus Lieblingssongs entfernen" else "Zu Lieblingssongs") },
                leadingIcon = { Icon(if (favorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, null) },
                onClick = {
                    open = false
                    scope.launch {
                        try {
                            app.repo.setFavorite(song.id, !favorite)
                            snackbar(if (favorite) "Aus Lieblingssongs entfernt" else "Zu Lieblingssongs hinzugefügt")
                        } catch (e: Exception) { snackbar(errorText(e)) }
                    }
                },
            )
            val party by app.live.party.collectAsState()
            if (party?.isHost == false) DropdownMenuItem(
                text = { Text("Zur Party vorschlagen") },
                leadingIcon = { Icon(Icons.Rounded.Celebration, null) },
                onClick = { open = false; app.player.suggestToParty(song) },
            )
            DropdownMenuItem(
                text = { Text("Teilen") },
                leadingIcon = { Icon(Icons.AutoMirrored.Rounded.Send, null) },
                onClick = { open = false; share = true },
            )
            DropdownMenuItem(
                text = { Text("Zu Playlist hinzufügen") },
                leadingIcon = { Icon(Icons.AutoMirrored.Rounded.PlaylistAdd, null) },
                onClick = { open = false; pickPlaylist = true },
            )
            if (downloaded.containsKey(song.id)) {
                DropdownMenuItem(
                    text = { Text("Download entfernen") },
                    leadingIcon = { Icon(Icons.Rounded.Delete, null) },
                    onClick = { open = false; app.downloads.delete(listOf(song.id)) },
                )
            } else {
                DropdownMenuItem(
                    text = { Text("Herunterladen") },
                    leadingIcon = { Icon(Icons.Rounded.Download, null) },
                    onClick = { open = false; app.downloads.download(listOf(song)) },
                )
            }
            if (song.isAudiobook) DropdownMenuItem(
                text = { Text("Zum Hörbuch") },
                leadingIcon = { Icon(Icons.Rounded.AutoStories, null) },
                onClick = { open = false; nav.audiobook(song.audiobookId) },
            ) else if (song.albumId != null) DropdownMenuItem(
                text = { Text("Zum Album") },
                leadingIcon = { Icon(Icons.Rounded.Album, null) },
                onClick = { open = false; nav.album(song.albumId) },
            )
            if (song.artistId != null) DropdownMenuItem(
                text = { Text("Zum Künstler") },
                leadingIcon = { Icon(Icons.Rounded.Person, null) },
                onClick = { open = false; nav.artist(song.artistId) },
            )
            if (onRemove != null) {
                HorizontalDivider()
                DropdownMenuItem(
                    text = { Text(removeLabel) },
                    leadingIcon = { Icon(Icons.Rounded.RemoveCircleOutline, null) },
                    onClick = { open = false; onRemove() },
                )
            }
        }
    }
    if (pickPlaylist) PlaylistPicker(listOf(song)) { pickPlaylist = false }
    if (share) ShareItemSheet(if (song.isAudiobook) "audiobook" else "song", if (song.isAudiobook) song.audiobookId else song.id, song.bookTitle ?: song.title) { share = false }
}


/**
 * Swipe a song to the right to add it to the queue (search results).
 * The row slides back; a queue icon shows behind it while swiping.
 */
@Composable
fun SwipeToQueue(song: Song, content: @Composable () -> Unit) {
    val app = CumuApplication.instance
    val snackbar = com.cumu.app.ui.LocalSnackbar.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val dx = androidx.compose.runtime.remember { androidx.compose.animation.core.Animatable(0f) }
    val density = androidx.compose.ui.platform.LocalDensity.current
    val threshold = with(density) { 96.dp.toPx() }
    androidx.compose.foundation.layout.Box(
        Modifier.fillMaxWidth().pointerInput(song.id) {
            detectHorizontalDragGestures(
                onDragEnd = {
                    val added = dx.value > threshold
                    if (added) {
                        app.player.enqueue(listOf(song))
                        snackbar("„${song.title}“ zur Warteschlange hinzugefügt")
                    }
                    scope.launch { dx.animateTo(0f, androidx.compose.animation.core.spring()) }
                },
                onDragCancel = { scope.launch { dx.animateTo(0f) } },
            ) { change, amount ->
                change.consume()
                scope.launch { dx.snapTo((dx.value + amount).coerceIn(0f, threshold * 1.6f)) }
            }
        },
    ) {
        if (dx.value > 1f) androidx.compose.foundation.layout.Row(
            Modifier.matchParentSize().background(
                if (dx.value > threshold) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer,
            ).padding(start = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.AutoMirrored.Rounded.QueueMusic, "Zur Warteschlange",
                tint = if (dx.value > threshold) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        androidx.compose.foundation.layout.Box(
            Modifier.graphicsLayer { translationX = dx.value }.background(MaterialTheme.colorScheme.surface),
        ) { content() }
    }
}
