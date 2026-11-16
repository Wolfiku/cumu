package com.cumu.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.InboxItem
import com.cumu.app.data.Privacy
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.LocalSnackbar
import com.cumu.app.ui.components.Cover
import com.cumu.app.ui.components.EmptyBox
import com.cumu.app.ui.components.LoadContent
import com.cumu.app.ui.components.errorText
import com.cumu.app.ui.components.rememberLoad
import kotlinx.coroutines.launch

private fun timeAgo(sec: Long): String {
    val d = (System.currentTimeMillis() / 1000 - sec).coerceAtLeast(0)
    return when {
        d < 60 -> "gerade eben"
        d < 3600 -> "vor ${d / 60} Min."
        d < 86400 -> "vor ${d / 3600} Std."
        d < 7 * 86400 -> if (d / 86400 == 1L) "vor 1 Tag" else "vor ${d / 86400} Tagen"
        else -> java.text.DateFormat.getDateInstance().format(java.util.Date(sec * 1000))
    }
}

private fun kindText(type: String) = when (type) {
    "playlist" -> "eine Playlist"
    "album" -> "ein Album"
    "artist" -> "einen Künstler"
    "audiobook" -> "ein Hörbuch"
    else -> "einen Song"
}

/** "Mit dir geteilt": what other users sent. Opening it marks everything read. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen() {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val loader = rememberLoad { app.repo.inbox() }
    LaunchedEffect(loader.state) {
        val ok = loader.state as? com.cumu.app.ui.components.Load.Ok
        if (ok != null && ok.value.unread > 0) app.repo.markInboxRead()
    }

    fun open(it: InboxItem) {
        if (!it.available) return
        when (it.itemType) {
            "song" -> scope.launch {
                try { app.player.play(listOf(app.repo.song(it.itemId))) } catch (e: Exception) { snackbar(errorText(e)) }
            }
            "album" -> nav.album(it.itemId)
            "artist" -> nav.artist(it.itemId)
            "playlist" -> nav.playlist(it.itemId)
            "audiobook" -> nav.audiobook(it.itemId)
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Mit dir geteilt") }, navigationIcon = { BackButton() }) }) { padding ->
        PullToRefreshBox(loader.refreshing, loader.reload, Modifier.fillMaxSize().padding(padding)) {
            LoadContent(loader) { inbox ->
                if (inbox.items.isEmpty()) {
                    EmptyBox(Icons.Rounded.Inbox, "Noch nichts. Wenn dir jemand einen Song, ein Album oder eine Playlist schickt, erscheint es hier.")
                    return@LoadContent
                }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
                    items(inbox.items, key = { it.id }) { item ->
                        Row(
                            Modifier.fillMaxWidth()
                                .clickable(enabled = item.available) { open(item) }
                                .background(if (!item.read) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else androidx.compose.ui.graphics.Color.Transparent)
                                .padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Cover(
                                item.cover, 56.dp, corner = if (item.itemType == "artist") 28.dp else 10.dp, seed = item.title,
                                icon = when (item.itemType) {
                                    "album" -> Icons.Rounded.Album
                                    "artist" -> Icons.Rounded.Person
                                    "playlist" -> Icons.AutoMirrored.Rounded.QueueMusic
                                    "audiobook" -> Icons.Rounded.AutoStories
                                    else -> Icons.Rounded.MusicNote
                                },
                            )
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${item.fromUsername} hat dir ${kindText(item.itemType)} geschickt · ${timeAgo(item.createdAt)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                                Text(item.title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (item.subtitle.isNotBlank()) Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                item.message?.let {
                                    Text(
                                        "„$it“",
                                        Modifier.padding(top = 4.dp).clip(RoundedCornerShape(8.dp))
                                            .background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 8.dp, vertical = 4.dp),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                }
                            }
                            IconButton(onClick = {
                                scope.launch {
                                    try { app.repo.deleteShare(item.id); loader.reload() } catch (e: Exception) { snackbar(errorText(e)) }
                                }
                            }) { Icon(Icons.Rounded.Delete, "Entfernen", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                    }
                }
            }
        }
    }
}

private data class PrivacyOption(val key: String, val title: String, val text: String, val get: (Privacy) -> Boolean)

private val PRIVACY_OPTIONS = listOf(
    PrivacyOption("allow_invites", "Einladungen zu Playlists", "Andere dürfen dich zu ihren Playlists einladen.") { it.allowInvites },
    PrivacyOption("allow_shares", "Geteilte Inhalte empfangen", "Andere dürfen dir Songs, Alben und Playlists schicken.") { it.allowShares },
    PrivacyOption("discoverable", "In Namensvorschlägen erscheinen", "Dein Name wird vorgeschlagen, wenn jemand beim Teilen tippt. Aus: man muss deinen Namen genau kennen.") { it.discoverable },
    PrivacyOption("show_name_public", "Name bei öffentlichen Playlists zeigen", "Aus: deine öffentlichen Playlists erscheinen ohne deinen Namen.") { it.showNamePublic },
    PrivacyOption("count_in_stats", "In Server-Statistiken mitzählen", "Deine Wiedergaben zählen für „Am meisten gehört“ und Autoplay. Dein eigener Verlauf bleibt.") { it.countInStats },
)

/** What other users may see of me and send me; blocked users; delete history. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacyScreen() {
    val app = CumuApplication.instance
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val loader = rememberLoad { app.repo.privacy() }
    var local by remember { mutableStateOf<Privacy?>(null) }
    var blockName by remember { mutableStateOf("") }
    var confirmBlock by remember { mutableStateOf<String?>(null) }
    var confirmHistory by remember { mutableStateOf(false) }

    Scaffold(topBar = { TopAppBar(title = { Text("Privatsphäre") }, navigationIcon = { BackButton() }) }) { padding ->
        LoadContent(loader) { loaded ->
            val p = local ?: loaded
            Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
                Text(
                    "Was andere Nutzer auf diesem Server von dir sehen und dir schicken dürfen.",
                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                PRIVACY_OPTIONS.forEach { o ->
                    val on = o.get(p)
                    ListItem(
                        headlineContent = { Text(o.title) },
                        supportingContent = { Text(o.text) },
                        trailingContent = {
                            Switch(checked = on, onCheckedChange = { v ->
                                scope.launch {
                                    try { local = app.repo.setPrivacy(o.key, v) } catch (e: Exception) { snackbar(errorText(e)) }
                                }
                            })
                        },
                    )
                }
                HorizontalDivider()
                Text("Blockierte Nutzer", Modifier.padding(start = 16.dp, top = 16.dp), style = MaterialTheme.typography.titleMedium)
                Text(
                    "Können dich nicht einladen, dir nichts schicken und sehen deine öffentlichen Playlists nicht, du ihre auch nicht. Sie erfahren nicht, dass du sie blockiert hast.",
                    Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(blockName, { blockName = it }, Modifier.weight(1f), singleLine = true, placeholder = { Text("Benutzername") })
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { confirmBlock = blockName.trim() }, enabled = blockName.isNotBlank()) {
                        Icon(Icons.Rounded.Block, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Blockieren")
                    }
                }
                if (p.blocked.isEmpty()) Text("Niemand blockiert.", Modifier.padding(horizontal = 16.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                p.blocked.forEach { b ->
                    ListItem(
                        headlineContent = { Text(b.username) },
                        leadingContent = { Icon(Icons.Rounded.Person, null) },
                        trailingContent = {
                            TextButton(onClick = {
                                scope.launch {
                                    try { local = p.copy(blocked = app.repo.unblockUser(b.userId)) } catch (e: Exception) { snackbar(errorText(e)) }
                                }
                            }) { Text("Freigeben") }
                        },
                    )
                }
                HorizontalDivider(Modifier.padding(top = 8.dp))
                ListItem(
                    headlineContent = { Text("Hörverlauf löschen", color = MaterialTheme.colorScheme.error) },
                    supportingContent = { Text("Löscht „Zuletzt gehört“ und deine persönlichen Top-Listen. Kann nicht rückgängig gemacht werden.") },
                    leadingContent = { Icon(Icons.Rounded.DeleteForever, null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable { confirmHistory = true },
                )
            }

            confirmBlock?.let { name ->
                AlertDialog(
                    onDismissRequest = { confirmBlock = null },
                    title = { Text("$name blockieren?") },
                    text = { Text("Einladungen zwischen euch werden entfernt, und was $name dir geschickt hat, verschwindet.") },
                    confirmButton = {
                        TextButton(onClick = {
                            confirmBlock = null
                            scope.launch {
                                try { local = p.copy(blocked = app.repo.blockUser(name)); blockName = ""; snackbar("$name blockiert") }
                                catch (e: Exception) { snackbar(errorText(e)) }
                            }
                        }) { Text("Blockieren") }
                    },
                    dismissButton = { TextButton(onClick = { confirmBlock = null }) { Text("Abbrechen") } },
                )
            }
        }
    }

    if (confirmHistory) AlertDialog(
        onDismissRequest = { confirmHistory = false },
        title = { Text("Hörverlauf löschen?") },
        text = { Text("Dein ganzer Hörverlauf wird gelöscht.") },
        confirmButton = {
            TextButton(onClick = {
                confirmHistory = false
                scope.launch {
                    try { val n = app.repo.deleteHistory(); snackbar("Hörverlauf gelöscht ($n Einträge)") } catch (e: Exception) { snackbar(errorText(e)) }
                }
            }) { Text("Löschen") }
        },
        dismissButton = { TextButton(onClick = { confirmHistory = false }) { Text("Abbrechen") } },
    )
}
