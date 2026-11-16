package com.cumu.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication

/** Floating bar above the navigation with the current song. */
@Composable
fun MiniPlayer(onOpen: () -> Unit) {
    val app = CumuApplication.instance
    val s by app.player.state.collectAsState()
    val song = s.current ?: return
    val progress by animateFloatAsState(
        if (s.durationMs > 0) s.positionMs.toFloat() / s.durationMs else 0f,
        tween(500), label = "progress",
    )

    Surface(
        modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp).fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHighest,
        shadowElevation = 6.dp,
    ) {
        Column(Modifier.clickable(onClick = onOpen)) {
            Row(Modifier.fillMaxWidth().padding(start = 8.dp, top = 8.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                AnimatedContent(
                    targetState = song,
                    contentKey = { it.id },
                    transitionSpec = { (slideInVertically { it } + fadeIn()) togetherWith (slideOutVertically { -it } + fadeOut()) },
                    label = "mini",
                    modifier = Modifier.weight(1f),
                ) { sg ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Cover(sg.cover, 44.dp, songId = sg.id, corner = 8.dp, seed = sg.title)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(sg.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            val sub = s.error ?: sg.artistName
                            if (!sub.isNullOrBlank()) Text(
                                sub,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (s.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                IconButton(onClick = app.player::togglePlay) {
                    AnimatedContent(s.isPlaying, transitionSpec = { scaleIn() + fadeIn() togetherWith scaleOut() + fadeOut() }, label = "pp") { playing ->
                        Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (playing) "Pause" else "Abspielen")
                    }
                }
                IconButton(onClick = app.player::next) { Icon(Icons.Rounded.SkipNext, "Nächster Titel") }
            }
            // Thin progress line along the bottom edge
            Box(Modifier.padding(horizontal = 12.dp).fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)).background(MaterialTheme.colorScheme.outlineVariant)) {
                Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(3.dp).background(MaterialTheme.colorScheme.primary))
            }
            Spacer(Modifier.height(6.dp))
        }
    }
}
