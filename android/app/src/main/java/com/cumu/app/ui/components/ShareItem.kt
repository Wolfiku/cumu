package com.cumu.app.ui.components

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.UserSuggestion
import com.cumu.app.ui.LocalSnackbar
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val TYPE_LABELS = mapOf(
    "song" to "Song", "album" to "Album", "artist" to "Künstler", "playlist" to "Playlist", "audiobook" to "Hörbuch",
)

/** Link to an item in the web app of this server (opens it after login). */
fun shareLink(type: String, id: String): String {
    val server = CumuApplication.instance.sessions.session.value?.serverUrl?.trimEnd('/') ?: ""
    return "$server/#/$type/${android.net.Uri.encode(id)}"
}

/**
 * Share an item: send it to a user of this server (with a message), or share
 * / copy its link. For an own private playlist the person can be invited first.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareItemSheet(type: String, id: String, title: String, ownPlaylist: Boolean = false, onDismiss: () -> Unit) {
    val app = CumuApplication.instance
    val ctx = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<UserSuggestion>>(emptyList()) }
    var picked by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var canInvite by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val link = remember(type, id) { shareLink(type, id) }

    // Name suggestions while typing
    LaunchedEffect(username) {
        if (picked || username.isBlank()) { suggestions = emptyList(); return@LaunchedEffect }
        delay(200)
        suggestions = app.repo.suggestUsers(username)
    }

    fun send() {
        val name = username.trim()
        if (name.isEmpty() || busy) return
        scope.launch {
            busy = true
            try {
                app.repo.sendShare(name, type, id, message)
                snackbar("An $name gesendet")
                onDismiss()
            } catch (e: Exception) {
                error = errorText(e)
                // Own playlist the person cannot open yet: offer to invite them
                canInvite = ownPlaylist && type == "playlist" && (e as? com.cumu.app.data.ApiException)?.status == 400
            }
            busy = false
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 4.dp)) {
            Text("${TYPE_LABELS[type] ?: ""} teilen", style = MaterialTheme.typography.titleLarge)
            Text(title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            Spacer(Modifier.height(16.dp))

            Text("An eine Person auf diesem Server", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = username,
                onValueChange = { username = it; picked = false; error = null; canInvite = false },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("Benutzername") },
                leadingIcon = { Icon(Icons.Rounded.Person, null) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            suggestions.forEach { u ->
                Row(
                    Modifier.fillMaxWidth().clickable { username = u.username; picked = true; suggestions = emptyList() }.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.Person, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(10.dp))
                    Text(u.username)
                }
            }
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = message,
                onValueChange = { if (it.length <= 500) message = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Nachricht (optional)") },
                maxLines = 4,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
            )
            error?.let { Text(it, Modifier.padding(top = 6.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                if (canInvite) OutlinedButton(onClick = {
                    scope.launch {
                        busy = true
                        try {
                            app.repo.addPlaylistMember(id, username.trim(), canEdit = false)
                            busy = false
                            send()
                        } catch (e: Exception) { error = errorText(e); busy = false }
                    }
                }, enabled = !busy) { Text("Einladen und senden") }
                Spacer(Modifier.weight(1f))
                Button(onClick = { send() }, enabled = username.isNotBlank() && !busy) {
                    Icon(Icons.AutoMirrored.Rounded.Send, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Senden")
                }
            }

            Spacer(Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))
            Text("Link", style = MaterialTheme.typography.titleSmall)
            Text(
                "Für alle mit einem Konto auf diesem Server" + if (type == "playlist") ", die die Playlist sehen dürfen." else ".",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp)) {
                OutlinedButton(onClick = {
                    val intent = Intent(Intent.ACTION_SEND)
                        .setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, title)
                        .putExtra(Intent.EXTRA_TEXT, "$title – $link")
                    runCatching { ctx.startActivity(Intent.createChooser(intent, "Link teilen")) }
                }, Modifier.weight(1f)) {
                    Icon(Icons.Rounded.Link, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Link teilen")
                }
                Spacer(Modifier.width(8.dp))
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(link)); snackbar("Link kopiert") }, Modifier.weight(1f)) {
                    Icon(Icons.Rounded.ContentCopy, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Kopieren")
                }
            }
        }
    }
}

/** Share icon that opens [ShareItemSheet]. */
@Composable
fun ShareButton(type: String, id: String, title: String, ownPlaylist: Boolean = false) {
    var open by remember { mutableStateOf(false) }
    androidx.compose.material3.IconButton(onClick = { open = true }) {
        Icon(Icons.AutoMirrored.Rounded.Send, "Teilen")
    }
    if (open) ShareItemSheet(type, id, title, ownPlaylist) { open = false }
}
