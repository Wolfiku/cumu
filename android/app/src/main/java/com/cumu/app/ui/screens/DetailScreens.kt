package com.cumu.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Song
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.LocalSnackbar
import com.cumu.app.ui.components.AlbumCarousel
import com.cumu.app.ui.components.Cover
import com.cumu.app.ui.components.EmptyBox
import com.cumu.app.ui.components.LoadContent
import com.cumu.app.ui.components.SectionTitle
import com.cumu.app.ui.components.SongRow
import com.cumu.app.ui.components.errorText
import com.cumu.app.ui.components.rememberLoad
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetailScaffold(title: String, actions: @Composable () -> Unit = {}, content: @Composable (PaddingValues) -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1) },
                navigationIcon = { BackButton() },
                actions = { actions() },
            )
        },
        content = content,
    )
}

@Composable
private fun Header(cover: String?, title: String, subtitle: String?, onSubtitle: (() -> Unit)? = null, info: String? = null) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Cover(cover, 220.dp, corner = 16.dp)
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        if (!subtitle.isNullOrBlank()) Text(
            subtitle,
            Modifier.then(if (onSubtitle != null) Modifier.clickable(onClick = onSubtitle) else Modifier).padding(top = 4.dp),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
        )
        if (!info.isNullOrBlank()) Text(info, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Download button for a whole list: downloads what is missing, or offers to remove all. */
@Composable
internal fun DownloadAllButton(songs: List<Song>) {
    val app = CumuApplication.instance
    val downloaded by app.downloads.songs.collectAsState()
    val all = songs.isNotEmpty() && songs.all { downloaded.containsKey(it.id) }
    var confirm by remember { mutableStateOf(false) }
    IconButton(onClick = { if (all) confirm = true else app.downloads.download(songs) }, enabled = songs.isNotEmpty()) {
        Icon(if (all) Icons.Rounded.DownloadDone else Icons.Rounded.Download, if (all) "Heruntergeladen" else "Alle herunterladen")
    }
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text("Downloads entfernen?") },
        text = { Text("${songs.size} Titel werden vom Handy gelöscht. Auf dem Server bleiben sie erhalten.") },
        confirmButton = { TextButton(onClick = { confirm = false; app.downloads.delete(songs.map { it.id }) }) { Text("Entfernen") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Abbrechen") } },
    )
}

internal fun totalLength(songs: List<Song>): String {
    val min = (songs.sumOf { it.duration ?: 0.0 } / 60).toInt()
    val titles = if (songs.size == 1) "1 Titel" else "${songs.size} Titel"
    return if (min >= 60) "$titles · ${min / 60} Std. ${min % 60} Min." else "$titles · $min Min."
}

@Composable
fun AlbumScreen(id: String) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val loader = rememberLoad(id) { app.repo.album(id) }
    DetailScaffold("Album") { padding ->
        LoadContent(loader) { album ->
            // Album track lists come without album fields; fill them in for the player
            val songs = album.songs.map {
                it.copy(albumTitle = it.albumTitle ?: album.title, cover = it.cover ?: album.cover, albumId = it.albumId ?: album.id)
            }
            LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    Header(
                        album.cover, album.title, album.artistName,
                        onSubtitle = album.artistId?.let { aid -> { nav.artist(aid) } },
                        info = listOfNotNull(album.year?.toString(), album.genre, totalLength(songs)).joinToString(" · "),
                    )
                }
                item { PlayShuffleRow(songs, Modifier.padding(16.dp)) { DownloadAllButton(songs) } }
                itemsIndexed(songs, key = { _, s -> s.id }) { i, s ->
                    SongRow(s, songs, i, leading = (s.trackNumber ?: (i + 1)).toString())
                }
            }
        }
    }
}

@Composable
fun PlaylistScreen(id: String) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val loader = rememberLoad(id) { app.repo.playlist(id) }
    var confirmDelete by remember { mutableStateOf(false) }

    val playlist = (loader.state as? com.cumu.app.ui.components.Load.Ok)?.value
    DetailScaffold(
        playlist?.name ?: "Playlist",
        actions = {
            if (playlist != null && !playlist.readOnly) IconButton(onClick = { confirmDelete = true }) {
                Icon(Icons.Rounded.Delete, "Playlist löschen")
            }
        },
    ) { padding ->
        LoadContent(loader) { pl ->
            LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    Header(
                        pl.songs.firstOrNull { it.cover != null }?.cover, pl.name,
                        if (pl.readOnly) "Von cumu erstellt" else null,
                        info = totalLength(pl.songs),
                    )
                }
                item { PlayShuffleRow(pl.songs, Modifier.padding(16.dp)) { DownloadAllButton(pl.songs) } }
                if (pl.songs.isEmpty()) item {
                    EmptyBox(Icons.Rounded.Download, "Leer. Füge Songs über das Menü ⋮ bei einem Titel hinzu.")
                }
                itemsIndexed(pl.songs, key = { _, s -> s.id }) { i, s ->
                    SongRow(
                        s, pl.songs, i,
                        onRemove = if (pl.readOnly) null else ({
                            scope.launch {
                                try { app.repo.removeFromPlaylist(pl.id, s.id); loader.reload() }
                                catch (e: Exception) { snackbar(errorText(e)) }
                            }
                        }),
                    )
                }
            }
        }
    }

    if (confirmDelete && playlist != null) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Playlist löschen?") },
        text = { Text("„${playlist.name}“ wird gelöscht. Die Songs bleiben in der Bibliothek.") },
        confirmButton = {
            TextButton(onClick = {
                confirmDelete = false
                scope.launch {
                    try { app.repo.deletePlaylist(playlist.id); nav.back(); snackbar("Playlist gelöscht") }
                    catch (e: Exception) { snackbar(errorText(e)) }
                }
            }) { Text("Löschen") }
        },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Abbrechen") } },
    )
}
