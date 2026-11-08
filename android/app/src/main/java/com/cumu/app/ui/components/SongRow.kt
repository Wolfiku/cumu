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
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.Download
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
                listOfNotNull(song.artistName, song.albumTitle).joinToString(" · ").ifEmpty { "Unbekannt" },
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

@Composable
fun SongMenu(song: Song, onRemove: (() -> Unit)? = null, removeLabel: String = "Entfernen") {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val downloaded by app.downloads.songs.collectAsState()
    var open by remember { mutableStateOf(false) }
    var pickPlaylist by remember { mutableStateOf(false) }

    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Rounded.MoreVert, "Mehr") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
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
            if (song.albumId != null) DropdownMenuItem(
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
}

