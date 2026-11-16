package com.cumu.app.ui.components

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Celebration
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.LiveDevice
import com.cumu.app.data.PartyMembership

/** Green of "Wiedergabe auf …" and the colours of the party (same as the web app). */
val LiveGreen = Color(0xFF1F9D55)
val PartyGradient = listOf(Color(0xFF7C3AED), Color(0xFFDB2777))

fun deviceIcon(kind: String): ImageVector = if (kind == "android" || kind == "mobile-web") Icons.Rounded.PhoneAndroid else Icons.Rounded.Computer

/**
 * Pill under the title in the player: "Wiedergabe auf Chrome · Windows"
 * (another device plays) or "Party von anna · 2 Gäste". Nothing otherwise.
 */
@Composable
fun LivePill(remoteDevice: String?, party: PartyMembership?, onDevices: () -> Unit, onParty: () -> Unit) {
    when {
        party != null -> {
            val n = party.party.guests.size
            val label = (if (party.isHost) "Deine Listening Party" else "Party von ${party.party.host.username}") + " · $n ${if (n == 1) "Gast" else "Gäste"}"
            Pill(label, Icons.Rounded.Celebration, Modifier.background(Brush.horizontalGradient(PartyGradient)), onParty)
        }
        remoteDevice != null -> Pill("Wiedergabe auf $remoteDevice", Icons.Rounded.VolumeUp, Modifier.background(LiveGreen), onDevices)
    }
}

@Composable
private fun Pill(text: String, icon: ImageVector, bg: Modifier, onClick: () -> Unit) {
    Row(
        Modifier.padding(top = 10.dp).clip(CircleShape).then(bg).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(18.dp), tint = Color.White)
        Spacer(Modifier.width(6.dp))
        Text(text, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** List of the account's devices; tap one to play there. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicePickerSheet(onDismiss: () -> Unit) {
    val app = CumuApplication.instance
    val devices by app.live.devices.collectAsState()
    val player by app.player.state.collectAsState()
    val me = app.live.deviceId
    val playingId = devices.firstOrNull { it.name == player.remoteDevice && it.id != me }?.id
        ?: if (player.current != null) me else null
    val sorted = devices.sortedBy { if (it.id == me) 0 else 1 }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 16.dp)) {
            Text("Gerät auswählen", Modifier.padding(horizontal = 24.dp, vertical = 4.dp), style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))
            sorted.forEach { d -> DeviceRow(d, d.id == me, d.id == playingId) { onDismiss(); app.player.playOnDevice(d.id) } }
            Text(
                "Öffne cumu auf einem anderen Gerät mit deinem Konto, um dort weiterzuhören.",
                Modifier.padding(horizontal = 24.dp, vertical = 12.dp),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DeviceRow(d: LiveDevice, isMe: Boolean, playing: Boolean, onClick: () -> Unit) {
    val song = d.state?.song
    Row(
        Modifier.padding(horizontal = 12.dp, vertical = 2.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(if (playing) LiveGreen.copy(alpha = 0.12f) else Color.Transparent)
            .clickable(onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (playing) Icons.Rounded.VolumeUp else deviceIcon(d.kind), null, tint = if (playing) LiveGreen else MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(if (isMe) "Dieses Gerät" else d.name, fontWeight = FontWeight.SemiBold, color = if (playing) LiveGreen else MaterialTheme.colorScheme.onSurface, maxLines = 1)
            Text(
                when {
                    isMe -> d.name
                    song != null -> (if (d.state?.isPlaying == true) "Spielt: " else "Pausiert: ") + song.title
                    else -> "Bereit"
                },
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (playing) EqualizerBars(true, color = LiveGreen)
    }
}

/** Start a party, or see guests, invite, share the link and leave. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PartySheet(onDismiss: () -> Unit) {
    val app = CumuApplication.instance
    val ctx = LocalContext.current
    val membership by app.live.party.collectAsState()
    var username by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Celebration, null, tint = PartyGradient[0])
                Spacer(Modifier.width(10.dp))
                Text("Listening Party", style = MaterialTheme.typography.titleLarge)
            }
            val m = membership
            if (m == null) {
                Text(
                    "Hört gemeinsam: Alle Gäste hören synchron, was du spielst, und können Songs vorschlagen.",
                    Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = { app.player.startParty() }, Modifier.fillMaxWidth()) { Text("Party starten") }
                Spacer(Modifier.height(16.dp))
                return@Column
            }
            val p = m.party
            Spacer(Modifier.height(12.dp))
            PersonRow(p.host.username + if (m.isHost) " (du)" else "", "Gastgeber · ${p.host.deviceName}", host = true)
            p.guests.forEach { g -> PersonRow(g.username, g.deviceName, host = false) }
            if (p.guests.isEmpty()) Text("Noch keine Gäste. Lade jemanden ein oder teile den Link.", Modifier.padding(vertical = 6.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    username, { username = it }, Modifier.weight(1f), singleLine = true, placeholder = { Text("Benutzername einladen") },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { if (username.isNotBlank()) { app.live.inviteToParty(username); username = "" } }),
                )
                Spacer(Modifier.width(8.dp))
                Button(onClick = { app.live.inviteToParty(username); username = "" }, enabled = username.isNotBlank()) { Text("Einladen") }
            }
            OutlinedButton(onClick = {
                val link = app.live.partyLink(p.id)
                val intent = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "Komm in meine Listening Party: $link")
                runCatching { ctx.startActivity(Intent.createChooser(intent, "Party-Link teilen")) }
            }, Modifier.padding(top = 8.dp).fillMaxWidth()) {
                Icon(Icons.Rounded.Link, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Link teilen")
            }
            Text(
                if (m.isHost) "Gäste hören synchron mit. Vorgeschlagene Songs kommen direkt nach dem aktuellen Song."
                else "Du hörst synchron mit. Tippe auf einen Song oder nutze ⋮ → „Zur Party vorschlagen“, um ihn an den Gastgeber zu schicken.",
                Modifier.padding(vertical = 10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            HorizontalDivider()
            TextButton(onClick = { app.live.leaveParty(); onDismiss() }) {
                Text(if (m.isHost) "Party beenden" else "Party verlassen", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun PersonRow(name: String, sub: String, host: Boolean) {
    Row(
        Modifier.padding(vertical = 3.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(if (host) PartyGradient[0].copy(alpha = 0.1f) else MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(if (host) Brush.horizontalGradient(PartyGradient) else Brush.linearGradient(listOf(Color.Gray, Color.DarkGray))),
            contentAlignment = Alignment.Center,
        ) { Text((name.firstOrNull() ?: '?').uppercase(), color = Color.White, fontWeight = FontWeight.Bold) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(name, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        if (host) Icon(Icons.Rounded.GraphicEq, null, tint = PartyGradient[0])
    }
}
