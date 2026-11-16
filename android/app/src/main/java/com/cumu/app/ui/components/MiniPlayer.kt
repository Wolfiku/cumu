package com.cumu.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.launch
import kotlin.math.abs
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication

/**
 * Floating bar above the navigation with the current song.
 * Swipe left: next title · swipe right: previous title · swipe down: stop and close.
 */
@Composable
fun MiniPlayer(onOpen: () -> Unit) {
    val app = CumuApplication.instance
    val s by app.player.state.collectAsState()
    val scope = rememberCoroutineScope()
    val dx = remember { Animatable(0f) }
    val dy = remember { Animatable(0f) }
    val song = s.current ?: return
    val partyNow by app.live.party.collectAsState()
    val me = app.sessions.session.value?.username
    val progress by animateFloatAsState(
        if (s.durationMs > 0) s.positionMs.toFloat() / s.durationMs else 0f,
        tween(500), label = "progress",
    )

    Surface(
        modifier = Modifier
            .padding(horizontal = 8.dp, vertical = 6.dp)
            .fillMaxWidth()
            .graphicsLayer {
                translationX = dx.value
                translationY = dy.value
                val w = size.width.coerceAtLeast(1f)
                alpha = (1f - abs(dx.value) / w * 0.7f - dy.value / (size.height.coerceAtLeast(1f) * 3f)).coerceIn(0.2f, 1f)
            }
            .pointerInput(Unit) {
                // 0 = not decided yet, 1 = sideways, 2 = down
                var axis = 0
                detectDragGestures(
                    onDragStart = { axis = 0 },
                    onDragEnd = {
                        val w = size.width.toFloat()
                        val h = size.height.toFloat()
                        scope.launch {
                            when {
                                axis == 1 && dx.value < -w * 0.25f -> {
                                    dx.animateTo(-w, tween(160))
                                    app.player.next()
                                    dx.snapTo(w * 0.5f)
                                    dx.animateTo(0f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
                                }
                                axis == 1 && dx.value > w * 0.25f -> {
                                    dx.animateTo(w, tween(160))
                                    app.player.previous()
                                    dx.snapTo(-w * 0.5f)
                                    dx.animateTo(0f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
                                }
                                axis == 2 && dy.value > h * 0.6f -> {
                                    dy.animateTo(h * 2f, tween(180))
                                    app.player.stop()
                                    dy.snapTo(0f)
                                }
                                else -> {
                                    launch { dx.animateTo(0f, spring()) }
                                    dy.animateTo(0f, spring())
                                }
                            }
                        }
                    },
                    onDragCancel = {
                        scope.launch {
                            launch { dx.animateTo(0f) }
                            dy.animateTo(0f)
                        }
                    },
                ) { change, amount ->
                    if (axis == 0) axis = if (abs(amount.x) >= abs(amount.y)) 1 else 2
                    change.consume()
                    scope.launch {
                        if (axis == 1) dx.snapTo(dx.value + amount.x)
                        else dy.snapTo((dy.value + amount.y).coerceAtLeast(0f))
                    }
                }
            },
        shape = RoundedCornerShape(16.dp),
        // In a listening party the mini player turns pink
        color = if (partyNow != null) PartyPink else MaterialTheme.colorScheme.surfaceContainerHighest,
        contentColor = if (partyNow != null) Color.White else MaterialTheme.colorScheme.onSurface,
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
                            val party = partyNow
                            val sub = s.error ?: when {
                                party != null -> partyWith(party, me)
                                s.remoteDevice != null -> "Auf ${s.remoteDevice}"
                                else -> sg.artistName
                            }
                            if (!sub.isNullOrBlank()) Text(
                                sub,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = if (s.remoteDevice != null || party != null) FontWeight.SemiBold else FontWeight.Normal,
                                color = when {
                                    s.error != null -> MaterialTheme.colorScheme.error
                                    party != null -> Color.White.copy(alpha = 0.9f)
                                    s.remoteDevice != null -> LiveGreen
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                },
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
                Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(3.dp).background(if (partyNow != null) Color.White else MaterialTheme.colorScheme.primary))
            }
            Spacer(Modifier.height(6.dp))
        }
    }
}
