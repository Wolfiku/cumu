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
import androidx.compose.material.icons.rounded.Celebration
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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PersonRemove
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import com.cumu.app.ui.components.PartyGradient
import com.cumu.app.ui.components.PartyPink
import com.cumu.app.ui.components.PartySheet
import com.cumu.app.ui.components.partyWith
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
    "party" -> "eine Einladung zur Listening Party"
    else -> "einen Song"
}

/** Opens something another user sent. */
private fun openShared(it: InboxItem, nav: com.cumu.app.ui.Nav, play: (String) -> Unit) {
    if (!it.available) return
    when (it.itemType) {
        "song" -> play(it.itemId)
        "album" -> nav.album(it.itemId)
        "artist" -> nav.artist(it.itemId)
        "playlist" -> nav.playlist(it.itemId)
        "audiobook" -> nav.audiobook(it.itemId)
    }
}

/**
 * Social: invitations (parties, shared playlists, friend requests), what
 * others sent me, the current party and public playlists to discover.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SocialScreen() {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val loader = rememberLoad { app.repo.social() to runCatching { app.repo.discoverPlaylists() }.getOrDefault(emptyList()) }
    val party by app.live.party.collectAsState()
    var showParty by remember { mutableStateOf(false) }
    var showFriends by remember { mutableStateOf(false) }
    LaunchedEffect(loader.state) {
        val ok = loader.state as? com.cumu.app.ui.components.Load.Ok
        if (ok != null && ok.value.first.shares.any { !it.read }) app.repo.markInboxRead()
    }
    fun act(block: suspend () -> Unit) = scope.launch {
        try { block(); loader.reload() } catch (e: Exception) { snackbar(errorText(e)) }
    }
    val play: (String) -> Unit = { id -> scope.launch { try { app.player.play(listOf(app.repo.song(id))) } catch (e: Exception) { snackbar(errorText(e)) } } }

    Scaffold(topBar = { TopAppBar(title = { Text("Social") }, navigationIcon = { BackButton() }) }) { padding ->
        PullToRefreshBox(loader.refreshing, loader.reload, Modifier.fillMaxSize().padding(padding)) {
            LoadContent(loader) { (data, publicLists) ->
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                    item {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(
                                onClick = { showParty = true }, Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = PartyPink, contentColor = Color.White),
                            ) { Icon(Icons.Rounded.Celebration, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(if (party != null) "Party" else "Party erstellen", maxLines = 1) }
                            OutlinedButton(onClick = { showFriends = true }, Modifier.weight(1f)) {
                                Icon(Icons.Rounded.PersonAdd, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Freunde verwalten", maxLines = 1)
                            }
                        }
                    }
                    party?.let { m ->
                        item {
                            Row(
                                Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp))
                                    .background(Brush.horizontalGradient(PartyGradient)).clickable { showParty = true }.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Rounded.Celebration, null, tint = Color.White)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(if (m.isHost) "Deine Listening Party" else "Party von ${m.party.host.username}", color = Color.White, fontWeight = FontWeight.Bold)
                                    Text(partyWith(m, app.sessions.session.value?.username), color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.bodySmall, maxLines = 2)
                                }
                                TextButton(onClick = { app.live.leaveParty() }) { Text(if (m.isHost) "Beenden" else "Verlassen", color = Color.White, fontWeight = FontWeight.Bold) }
                            }
                        }
                    }

                    val inv = data.invitations
                    val reqs = data.friends.incoming
                    item { SectionHeader("Einladungen" + (inv.parties.size + inv.playlists.size + reqs.size).let { if (it > 0) " ($it)" else "" }) }
                    if (inv.parties.isEmpty() && inv.playlists.isEmpty() && reqs.isEmpty()) item {
                        Hint("Keine offenen Einladungen. Einladungen zu Partys, geteilten Playlists und Freundschaftsanfragen erscheinen hier.")
                    }
                    items(inv.parties, key = { "party-" + it.id }) { it ->
                        InviteRow(
                            icon = { Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(PartyPink), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Celebration, null, tint = Color.White) } },
                            line1 = "${it.fromUsername} lädt dich zur Listening Party ein · ${timeAgo(it.createdAt)}",
                            title = it.title, sub = it.message?.let { m -> "„$m“" },
                            accept = "Beitreten", acceptColor = PartyPink,
                            onAccept = { act { app.repo.deleteShare(it.id); app.live.joinParty(it.itemId) } },
                            onDecline = { act { app.repo.deleteShare(it.id) } },
                        )
                    }
                    items(inv.playlists, key = { "pli-" + it.id }) { pl ->
                        InviteRow(
                            icon = { Cover(pl.cover, 52.dp, corner = 10.dp, seed = pl.name, icon = Icons.AutoMirrored.Rounded.QueueMusic) },
                            line1 = "${pl.ownerUsername} lädt dich zu einer geteilten Playlist ein · ${timeAgo(pl.addedAt)}",
                            title = pl.name, sub = "${pl.songCount} Titel · " + if (pl.canEdit == 1) "du darfst bearbeiten" else "zum Anhören",
                            accept = "Annehmen", acceptColor = MaterialTheme.colorScheme.primary,
                            onAccept = { act { app.repo.acceptPlaylistInvitation(pl.id); snackbar("„${pl.name}“ ist jetzt in deiner Bibliothek") } },
                            onDecline = { act { app.repo.declinePlaylistInvitation(pl.id) } },
                        )
                    }
                    items(reqs, key = { "fr-" + it.userId }) { f ->
                        InviteRow(
                            icon = { Avatar(f.username, 52.dp) },
                            line1 = "Freundschaftsanfrage · ${timeAgo(f.since)}",
                            title = f.username, sub = "möchte mit dir befreundet sein",
                            accept = "Annehmen", acceptColor = MaterialTheme.colorScheme.primary,
                            onAccept = { act { app.repo.acceptFriend(f.userId) } },
                            onDecline = { act { app.repo.removeFriend(f.userId) } },
                        )
                    }

                    item { SectionHeader("Mit dir geteilt") }
                    if (data.shares.isEmpty()) item { Hint("Noch nichts. Wenn dir jemand einen Song, ein Album oder eine Playlist schickt, erscheint es hier.") }
                    items(data.shares, key = { "sh-" + it.id }) { item ->
                        ShareRow(item, onOpen = { openShared(item, nav, play) }, onDelete = { act { app.repo.deleteShare(item.id) } })
                    }

                    item { SectionHeader("Öffentliche Playlists entdecken") }
                    if (publicLists.isEmpty()) item { Hint("Noch keine öffentlichen Playlists auf diesem Server.") }
                    items(publicLists, key = { "pub-" + it.id }) { p ->
                        ListItem(
                            headlineContent = { Text(p.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            supportingContent = { Text(listOfNotNull(p.ownerUsername?.let { "von $it" }, "${p.size} Titel").joinToString(" · ")) },
                            leadingContent = { Cover(p.coverOrFirst, 52.dp, corner = 10.dp, seed = p.name, icon = Icons.AutoMirrored.Rounded.QueueMusic) },
                            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                            modifier = Modifier.clickable { nav.playlist(p.id) },
                        )
                    }
                }
            }
        }
    }
    if (showParty) PartySheet { showParty = false }
    if (showFriends) FriendsSheet(onChanged = { loader.reload() }) { showFriends = false }
}

@Composable
private fun SectionHeader(text: String) {
    Text(text, Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 6.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
}

@Composable
private fun Hint(text: String) {
    Text(
        text, Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow).padding(14.dp),
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun Avatar(name: String, size: androidx.compose.ui.unit.Dp) {
    Box(Modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
        Text((name.firstOrNull() ?: '?').uppercase(), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

@Composable
private fun InviteRow(
    icon: @Composable () -> Unit, line1: String, title: String, sub: String?,
    accept: String, acceptColor: Color, onAccept: () -> Unit, onDecline: () -> Unit,
) {
    Column(
        Modifier.padding(horizontal = 16.dp, vertical = 5.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            icon()
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(line1, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                Text(title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                sub?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onDecline) { Text("Ablehnen") }
            Spacer(Modifier.width(6.dp))
            Button(onClick = onAccept, colors = ButtonDefaults.buttonColors(containerColor = acceptColor, contentColor = Color.White)) { Text(accept) }
        }
    }
}

@Composable
private fun ShareRow(item: InboxItem, onOpen: () -> Unit, onDelete: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .clickable(enabled = item.available) { onOpen() }
            .background(if (!item.read) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else Color.Transparent)
            .padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(
            item.cover, 52.dp, corner = if (item.itemType == "artist") 26.dp else 10.dp, seed = item.title,
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
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
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
        IconButton(onClick = onDelete) { Icon(Icons.Rounded.Delete, "Entfernen", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

/** Friends: request by user name, answer requests, remove. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FriendsSheet(onChanged: () -> Unit, onDismiss: () -> Unit) {
    val app = CumuApplication.instance
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    var friends by remember { mutableStateOf<com.cumu.app.data.Friends?>(null) }
    var username by remember { mutableStateOf("") }
    suspend fun load() { friends = runCatching { app.repo.friends() }.getOrNull() }
    LaunchedEffect(Unit) { load() }
    fun act(block: suspend () -> Unit) = scope.launch {
        try { block() } catch (e: Exception) { snackbar(errorText(e)) }
        load(); onChanged()
    }
    fun request() {
        val name = username.trim()
        if (name.isEmpty()) return
        username = ""
        act { snackbar(if (app.repo.requestFriend(name)) "Du bist jetzt mit $name befreundet" else "Anfrage an $name gesendet") }
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 4.dp)) {
            Text("Freunde", style = MaterialTheme.typography.titleLarge)
            Row(Modifier.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    username, { username = it }, Modifier.weight(1f), singleLine = true, placeholder = { Text("Benutzername") },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { request() }),
                )
                Spacer(Modifier.width(8.dp))
                Button(onClick = { request() }, enabled = username.isNotBlank()) { Text("Anfragen") }
            }
            val f = friends
            if (f == null) { Text("Lade…", color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(24.dp)); return@Column }
            if (f.incoming.isNotEmpty()) {
                Text("Anfragen an dich", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                f.incoming.forEach { u ->
                    FriendRow(u.username, "möchte mit dir befreundet sein") {
                        TextButton(onClick = { act { app.repo.removeFriend(u.userId) } }) { Text("Ablehnen") }
                        Button(onClick = { act { app.repo.acceptFriend(u.userId) } }) { Text("Annehmen") }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }
            Text("Freunde (${f.friends.size})", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (f.friends.isEmpty()) Text("Noch keine Freunde. Frag jemanden über den Benutzernamen an.", Modifier.padding(vertical = 6.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            f.friends.forEach { u ->
                FriendRow(u.username, "Freund") {
                    IconButton(onClick = { act { app.repo.removeFriend(u.userId) } }) { Icon(Icons.Rounded.PersonRemove, "Entfernen", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            if (f.outgoing.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text("Angefragt", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                f.outgoing.forEach { u ->
                    FriendRow(u.username, "angefragt") { TextButton(onClick = { act { app.repo.removeFriend(u.userId) } }) { Text("Zurückziehen") } }
                }
            }
            Text(
                "Freunde erscheinen zuerst, wenn du Musik schickst oder zu Partys und Playlists einlädst. Einladen kannst du aber jeden über den Benutzernamen.",
                Modifier.padding(vertical = 14.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun FriendRow(name: String, sub: String, actions: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(name, 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(name, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        actions()
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
