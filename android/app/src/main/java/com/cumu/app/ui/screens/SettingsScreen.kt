package com.cumu.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.SdStorage
import androidx.compose.material.icons.rounded.AllInclusive
import androidx.compose.material.icons.rounded.FastForward
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.PrivacyTip
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.cumu.app.CumuApplication
import com.cumu.app.ui.components.formatBytes
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val app = CumuApplication.instance
    val nav = com.cumu.app.ui.LocalNav.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val session by app.sessions.session.collectAsState()
    val downloads by app.downloads.songs.collectAsState()
    var confirmLogout by remember { mutableStateOf(false) }
    val version = remember {
        runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "?"
    }
    val roleLabel = when (session?.role) { "admin" -> "Admin"; "creator" -> "Creator"; else -> "Benutzer" }

    Scaffold(topBar = { TopAppBar(title = { Text("Profil") }, navigationIcon = { BackButton() }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            ListItem(
                headlineContent = { Text(session?.username ?: "") },
                supportingContent = { Text(roleLabel) },
                leadingContent = { Icon(Icons.Rounded.AccountCircle, null) },
            )
            ListItem(
                headlineContent = { Text("Server") },
                supportingContent = { Text(session?.serverUrl ?: "") },
                leadingContent = { Icon(Icons.Rounded.Dns, null) },
            )
            ListItem(
                headlineContent = { Text("Downloads") },
                supportingContent = { Text("${downloads.size} Titel · ${formatBytes(downloads.values.sumOf { it.bytes })}") },
                leadingContent = { Icon(Icons.Rounded.SdStorage, null) },
            )
            ListItem(
                headlineContent = { Text("Privatsphäre") },
                supportingContent = { Text("Einladungen, Teilen, blockierte Nutzer, Hörverlauf") },
                leadingContent = { Icon(Icons.Rounded.PrivacyTip, null) },
                modifier = Modifier.clickable { nav.privacy() },
            )
            HorizontalDivider()
            PlaybackSection()
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("App-Version") },
                supportingContent = { Text(version) },
                leadingContent = { Icon(Icons.Rounded.Info, null) },
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Abmelden", color = MaterialTheme.colorScheme.error) },
                leadingContent = { Icon(Icons.AutoMirrored.Rounded.Logout, null, tint = MaterialTheme.colorScheme.error) },
                modifier = Modifier.clickable { confirmLogout = true },
            )
        }
    }

    if (confirmLogout) AlertDialog(
        onDismissRequest = { confirmLogout = false },
        title = { Text("Abmelden?") },
        text = {
            Text(
                if (downloads.isEmpty()) "Du kannst dich jederzeit wieder anmelden."
                else "Beim Abmelden werden auch die ${downloads.size} heruntergeladenen Titel vom Handy gelöscht."
            )
        },
        confirmButton = {
            TextButton(onClick = {
                confirmLogout = false
                app.player.stop()
                app.downloads.deleteAll()
                app.searchHistory.clear()
                scope.launch { app.api.logout() }
            }) { Text("Abmelden") }
        },
        dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Abbrechen") } },
    )
}


/** Crossfade, void skipping, normalization and autoplay. */
@Composable
private fun PlaybackSection() {
    val app = CumuApplication.instance
    val st by app.playback.state.collectAsState()
    Text(
        "Wiedergabe",
        Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
    )
    ListItem(
        headlineContent = { Text("Crossfade") },
        supportingContent = {
            Column {
                Text(if (st.crossfadeSec == 0) "Aus" else "${st.crossfadeSec} Sekunden")
                // Local value while dragging, saved when the finger lifts
                var drag by remember(st.crossfadeSec) { mutableFloatStateOf(st.crossfadeSec.toFloat()) }
                Slider(
                    value = drag,
                    onValueChange = { drag = it },
                    onValueChangeFinished = { app.playback.update { v -> v.copy(crossfadeSec = drag.roundToInt()) } },
                    valueRange = 0f..12f,
                    steps = 11,
                )
            }
        },
        leadingContent = { Icon(Icons.Rounded.Tune, null) },
    )
    SwitchRow(
        "Stille überspringen",
        "Überspringt leere Stellen am Anfang und Ende eines Songs. Mit Crossfade zählt die Stille zur Überblendung (3 s Stille + 5 s Crossfade = 2 s Überblendung).",
        Icons.Rounded.FastForward, st.voidSkip,
    ) { on -> app.playback.update { it.copy(voidSkip = on) } }
    SwitchRow(
        "Lautstärke angleichen",
        "Alle Songs gleich laut, kein Song ist viel lauter oder leiser als die anderen.",
        Icons.Rounded.GraphicEq, st.normalize,
    ) { on -> app.playback.update { it.copy(normalize = on) } }
    SwitchRow(
        "Autoplay",
        "Wenn die Warteschlange zu Ende ist, geht es mit ähnlicher Musik weiter. Nie mit Hörbüchern.",
        Icons.Rounded.AllInclusive, st.autoplay,
    ) { on -> app.playback.update { it.copy(autoplay = on) } }
}

@Composable
private fun SwitchRow(title: String, text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, checked: Boolean, onChange: (Boolean) -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(text) },
        leadingContent = { Icon(icon, null) },
        trailingContent = { Switch(checked = checked, onCheckedChange = onChange) },
        modifier = Modifier.clickable { onChange(!checked) },
    )
}
