package com.cumu.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.TimerOff
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.playback.SleepTimer
import kotlinx.coroutines.delay

/** Minutes offered by the sleep timer. */
private val SLEEP_MINUTES = listOf(5, 10, 15, 30, 45, 60, 90)

/** Current time, updated every second while shown (for the countdown). */
@Composable
fun rememberNow(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }
    return now
}

/** "Noch 12:34" or "Am Ende des Titels". */
fun sleepTimerLabel(t: SleepTimer, audiobook: Boolean, now: Long = System.currentTimeMillis()): String {
    if (t.endOfTrack) return if (audiobook) "Am Ende des Kapitels" else "Am Ende des Titels"
    val left = ((t.endsAt ?: now) - now).coerceAtLeast(0) / 1000
    val h = left / 3600
    val m = (left % 3600) / 60
    val s = left % 60
    return if (h > 0) "Noch %d:%02d:%02d".format(h, m, s) else "Noch %d:%02d".format(m, s)
}

/** Small chip in the player while a sleep timer runs; tap opens the timer sheet. */
@Composable
fun SleepTimerChip(audiobook: Boolean, onClick: () -> Unit) {
    val app = CumuApplication.instance
    val sleep by app.player.sleep.collectAsState()
    val t = sleep ?: return
    val now = rememberNow()
    AssistChip(
        onClick = onClick,
        label = { Text(sleepTimerLabel(t, audiobook, now).removePrefix("Noch ")) },
        leadingIcon = { Icon(Icons.Rounded.Bedtime, null, Modifier.size(18.dp)) },
        shape = CircleShape,
        colors = AssistChipDefaults.assistChipColors(
            labelColor = MaterialTheme.colorScheme.primary,
            leadingIconContentColor = MaterialTheme.colorScheme.primary,
        ),
    )
}

/**
 * Sleep timer: pause after a number of minutes (fading out at the end) or at
 * the end of the current title / audiobook chapter.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SleepTimerSheet(audiobook: Boolean, onDismiss: () -> Unit) {
    val app = CumuApplication.instance
    val sleep by app.player.sleep.collectAsState()
    val now = rememberNow()
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 16.dp)) {
            Row(Modifier.padding(horizontal = 24.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Bedtime, null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Sleep-Timer", style = MaterialTheme.typography.titleLarge)
                    Text(
                        sleep?.let { sleepTimerLabel(it, audiobook, now) + " pausiert die Wiedergabe" } ?: "Pausiert die Wiedergabe automatisch",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (sleep != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (sleep != null) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            FlowRow(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SLEEP_MINUTES.forEach { m ->
                    FilterChip(
                        selected = false,
                        onClick = { app.player.setSleepTimer(m); onDismiss() },
                        label = { Text(if (m >= 60 && m % 60 == 0) "${m / 60} Std." else "$m Min.") },
                        shape = CircleShape,
                        colors = FilterChipDefaults.filterChipColors(),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            ListItem(
                headlineContent = { Text(if (audiobook) "Am Ende des Kapitels" else "Am Ende des Titels") },
                leadingContent = { Icon(Icons.Rounded.SkipNext, null) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.clickable { app.player.sleepAtEndOfTrack(); onDismiss() },
            )
            if (sleep?.endsAt != null) ListItem(
                headlineContent = { Text("5 Minuten länger") },
                leadingContent = { Icon(Icons.Rounded.Add, null) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.clickable { app.player.extendSleepTimer(5); onDismiss() },
            )
            if (sleep != null) ListItem(
                headlineContent = { Text("Timer ausschalten", color = MaterialTheme.colorScheme.error) },
                leadingContent = { Icon(Icons.Rounded.TimerOff, null, tint = MaterialTheme.colorScheme.error) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.clickable { app.player.cancelSleepTimer(); onDismiss() },
            )
        }
    }
}
