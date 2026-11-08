package com.cumu.app.ui.screens

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.DownloadForOffline
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.ui.components.EmptyBox
import com.cumu.app.ui.components.SongRow
import com.cumu.app.ui.components.formatBytes

/** Songs saved on the phone. Works without a connection to the server. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadsScreen() {
    val app = CumuApplication.instance
    val downloaded by app.downloads.songs.collectAsState()
    val running by app.downloads.progress.collectAsState()
    var confirm by remember { mutableStateOf(false) }

    val songs = downloaded.values.map { it.song }
        .sortedWith(compareBy({ it.artistName?.lowercase() ?: "" }, { it.albumTitle?.lowercase() ?: "" }, { it.trackNumber ?: 0 }, { it.title.lowercase() }))
    val bytes = downloaded.values.sumOf { it.bytes }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Heruntergeladen") },
                navigationIcon = { BackButton() },
                actions = {
                    if (songs.isNotEmpty()) IconButton(onClick = { confirm = true }) { Icon(Icons.Rounded.DeleteSweep, "Alle löschen") }
                },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Text(
                    buildString {
                        append(if (songs.size == 1) "1 Titel" else "${songs.size} Titel")
                        append(" · ").append(formatBytes(bytes))
                        if (running.isNotEmpty()) append(" · ${running.size} werden geladen")
                    },
                    Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (songs.isEmpty()) {
                item {
                    EmptyBox(
                        Icons.Rounded.DownloadForOffline,
                        "Noch nichts heruntergeladen. Über ⋮ bei einem Song oder den Download-Knopf bei Alben und Playlists kannst du Musik für unterwegs speichern.",
                    )
                }
            } else {
                item { PlayShuffleRow(songs, Modifier.padding(16.dp)) }
                itemsIndexed(songs, key = { _, s -> s.id }) { i, s -> SongRow(s, songs, i) }
            }
        }
    }

    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text("Alle Downloads löschen?") },
        text = { Text("${songs.size} Titel (${formatBytes(bytes)}) werden vom Handy gelöscht. Auf dem Server bleiben sie erhalten.") },
        confirmButton = { TextButton(onClick = { confirm = false; app.downloads.deleteAll() }) { Text("Löschen") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Abbrechen") } },
    )
}
