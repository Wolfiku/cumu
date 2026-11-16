package com.cumu.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Playlist
import com.cumu.app.data.Song
import com.cumu.app.ui.LocalSnackbar
import kotlinx.coroutines.launch

/**
 * Bottom sheet to add songs to a playlist: the song at the top, then
 * "new playlist" and the user's playlists. A check shows where the song
 * already is; adding animates the row before the sheet closes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistPicker(songs: List<Song>, onDone: () -> Unit) {
    val app = CumuApplication.instance
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val loader = rememberLoad { app.repo.playlists().filter { !it.readOnly } }
    var creating by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf<String?>(null) }   // playlist id being added to
    var added by remember { mutableStateOf<String?>(null) }  // playlist id just added to
    val song = songs.first()

    fun close() = scope.launch { sheet.hide() }.invokeOnCompletion { onDone() }

    fun addTo(id: String, name: String) {
        if (busy != null) return
        busy = id
        scope.launch {
            try {
                songs.forEach { app.repo.addToPlaylist(id, it.id) }
                added = id
                kotlinx.coroutines.delay(550) // let the check animation play
                snackbar("Zu „$name“ hinzugefügt")
                close()
            } catch (e: Exception) {
                snackbar(errorText(e))
            }
            busy = null
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDone,
        sheetState = sheet,
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = {
            Box(Modifier.padding(top = 10.dp, bottom = 6.dp).size(width = 36.dp, height = 4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.outline))
        },
    ) {
        Column(Modifier.navigationBarsPadding()) {
            // The song (or number of songs) being added
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Cover(song.cover, 52.dp, songId = song.id, corner = 10.dp, seed = song.title)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text("Zu Playlist hinzufügen", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (songs.size == 1) listOfNotNull(song.title, song.artistName).joinToString(" · ") else "${songs.size} Titel",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            HorizontalDivider(Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)

            // New playlist: a row that opens into a text field
            AnimatedContent(creating, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "new") { open ->
                if (!open) {
                    PickerRow(
                        title = "Neue Playlist",
                        subtitle = "Erstellen und Titel hinzufügen",
                        leading = {
                            Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.onSurface), contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.Add, null, tint = MaterialTheme.colorScheme.surface)
                            }
                        },
                        onClick = { creating = true },
                    )
                } else {
                    val focus = remember { FocusRequester() }
                    androidx.compose.runtime.LaunchedEffect(Unit) { focus.requestFocus() }
                    val create = {
                        val name = newName.trim()
                        if (name.isNotEmpty() && busy == null) scope.launch {
                            try { addTo(app.repo.createPlaylist(name), name) } catch (e: Exception) { snackbar(errorText(e)) }
                        }
                    }
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        TextField(
                            newName, { newName = it },
                            Modifier.weight(1f).focusRequester(focus),
                            placeholder = { Text("Name der Playlist") },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = TextFieldDefaults.colors(
                                focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
                                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                            ),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { create() }),
                        )
                        Spacer(Modifier.width(10.dp))
                        Button(onClick = { create() }, enabled = newName.isNotBlank() && busy == null) { Text("Erstellen") }
                    }
                }
            }

            when (val s = loader.state) {
                is Load.Loading -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                is Load.Failed -> Text(s.message, Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                is Load.Ok -> {
                    if (s.value.isEmpty()) Text(
                        "Du hast noch keine eigenen Playlists.",
                        Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    LazyColumn(Modifier.heightIn(max = 420.dp), contentPadding = PaddingValues(bottom = 16.dp)) {
                        items(s.value, key = { it.id }) { pl -> PlaylistOption(pl, songs, busy == pl.id, added == pl.id) { addTo(pl.id, pl.name) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistOption(pl: Playlist, songs: List<Song>, busy: Boolean, justAdded: Boolean, onClick: () -> Unit) {
    val already = songs.all { s -> pl.songs.any { it.id == s.id } }
    PickerRow(
        title = pl.name,
        subtitle = (if (pl.songs.size == 1) "1 Titel" else "${pl.songs.size} Titel") + if (already) " · schon enthalten" else "",
        leading = { Cover(pl.songs.firstOrNull { it.cover != null }?.cover, 52.dp, corner = 10.dp, seed = pl.name, icon = Icons.AutoMirrored.Rounded.QueueMusic) },
        trailing = {
            Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                AnimatedContent(
                    when { busy && !justAdded -> 1; justAdded || already -> 2; else -> 0 },
                    transitionSpec = { (scaleIn() + fadeIn()) togetherWith (scaleOut() + fadeOut()) },
                    label = "state",
                ) { st ->
                    when (st) {
                        1 -> CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp)
                        2 -> Box(Modifier.size(26.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface), contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.Check, "Enthalten", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.surface)
                        }
                        else -> Box(Modifier.size(26.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh), contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.Add, "Hinzufügen", Modifier.size(16.dp))
                        }
                    }
                }
            }
        },
        onClick = if (already && !justAdded) null else onClick,
    )
}

@Composable
private fun PickerRow(
    title: String,
    subtitle: String,
    leading: @Composable () -> Unit,
    trailing: @Composable () -> Unit = {},
    onClick: (() -> Unit)?,
) {
    Row(
        Modifier.fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Start,
    ) {
        leading()
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        trailing()
    }
}

