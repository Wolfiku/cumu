package com.cumu.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PersonRemove
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Playlist
import com.cumu.app.data.PlaylistMember
import kotlinx.coroutines.launch

private data class VisibilityOption(val key: String, val label: String, val text: String, val icon: ImageVector)

private val VISIBILITY_OPTIONS = listOf(
    VisibilityOption("private", "Privat", "Nur du siehst diese Playlist.", Icons.Rounded.Lock),
    VisibilityOption("public", "Öffentlich", "Jeder auf diesem Server kann sie finden, speichern, herunterladen und hören.", Icons.Rounded.Public),
    VisibilityOption("shared", "Geteilt", "Nur Personen, die du per Benutzername einlädst.", Icons.Rounded.Group),
)

/**
 * Owner's share sheet: visibility (private / public / shared) and the people
 * invited by user name, each as listener or editor.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistShareSheet(playlistId: String, onDismiss: () -> Unit) {
    val app = CumuApplication.instance
    val scope = rememberCoroutineScope()
    var playlist by remember { mutableStateOf<Playlist?>(null) }
    var members by remember { mutableStateOf<List<PlaylistMember>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var username by remember { mutableStateOf("") }
    var canEdit by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(playlistId) {
        try {
            val p = app.repo.playlist(playlistId)
            playlist = p
            members = p.members
            canEdit = p.visibility == "public"
        } catch (e: Exception) { error = errorText(e) }
    }

    fun act(block: suspend () -> Unit) {
        scope.launch {
            busy = true
            try { block(); error = null } catch (e: Exception) { error = errorText(e) }
            busy = false
        }
    }

    fun invite() {
        val name = username.trim()
        if (name.isEmpty() || busy) return
        act {
            val r = app.repo.addPlaylistMember(playlistId, name, canEdit)
            members = r.members
            r.visibility?.let { v -> playlist = playlist?.copy(visibility = v) }
            username = ""
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(bottom = 16.dp),
        ) {
            Text(
                "Teilen" + (playlist?.name?.let { " · „$it“" } ?: ""),
                Modifier.padding(horizontal = 24.dp),
                style = MaterialTheme.typography.titleLarge,
            )
            Spacer(Modifier.height(12.dp))
            val p = playlist
            if (p == null) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    if (error != null) Text(error ?: "", color = MaterialTheme.colorScheme.error) else CircularProgressIndicator()
                }
                return@Column
            }
            val vis = p.visibility ?: "private"
            VISIBILITY_OPTIONS.forEach { o ->
                val selected = vis == o.key
                Row(
                    Modifier
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh)
                        .clickable(enabled = !busy && !selected) {
                            act { playlist = app.repo.setPlaylistVisibility(playlistId, o.key) ?: p.copy(visibility = o.key) }
                        }
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(o.icon, null, tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(o.label, fontWeight = FontWeight.SemiBold)
                        Text(o.text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (selected) Icon(Icons.Rounded.CheckCircle, null, tint = MaterialTheme.colorScheme.primary)
                }
            }

            if (vis != "private") {
                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Text(
                    if (vis == "shared") "Personen mit Zugriff" else "Personen, die mitbearbeiten",
                    Modifier.padding(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 8.dp),
                    style = MaterialTheme.typography.titleMedium,
                )
                Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        placeholder = { Text("Benutzername") },
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { invite() }),
                    )
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { invite() }, enabled = username.isNotBlank() && !busy) {
                        Icon(Icons.Rounded.PersonAdd, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Einladen")
                    }
                }
                Row(Modifier.padding(horizontal = 8.dp).clickable { canEdit = !canEdit }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = canEdit, onCheckedChange = { canEdit = it })
                    Text("darf Songs hinzufügen und entfernen", style = MaterialTheme.typography.bodyMedium)
                }
                error?.let { Text(it, Modifier.padding(horizontal = 24.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                if (members.isEmpty()) Text(
                    if (vis == "shared") "Noch niemand eingeladen." else "Jeder kann zuhören. Lade Leute ein, die auch Songs hinzufügen dürfen.",
                    Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Column(Modifier.heightIn(max = 400.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    members.forEach { m ->
                        Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 8.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier.size(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
                                contentAlignment = Alignment.Center,
                            ) { Text((m.username.firstOrNull() ?: '?').uppercase(), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary) }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(m.username, fontWeight = FontWeight.SemiBold)
                                Text(if (m.canEdit == 1) "kann bearbeiten" else "hört zu", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Switch(
                                checked = m.canEdit == 1,
                                onCheckedChange = { on -> act { members = app.repo.setPlaylistMemberEdit(playlistId, m.userId, on).members } },
                                enabled = !busy,
                            )
                            IconButton(onClick = { act { members = app.repo.removePlaylistMember(playlistId, m.userId).members } }, enabled = !busy) {
                                Icon(Icons.Rounded.PersonRemove, "Entfernen", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            }
        }
    }
}
