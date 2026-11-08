package com.cumu.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Clickable that springs down a little while pressed. */
fun Modifier.bounceClick(scaleDown: Float = 0.95f, onClick: () -> Unit): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed) scaleDown else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "bounce",
    )
    this
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(interactionSource = interaction, indication = ripple(), onClick = onClick)
}

/** Three bouncing bars, shown next to the song that is playing. */
@Composable
fun EqualizerBars(playing: Boolean, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary, height: Dp = 14.dp) {
    val t = rememberInfiniteTransition(label = "eq")
    val durations = listOf(420, 560, 340)
    val bars = durations.mapIndexed { i, d ->
        t.animateFloat(
            initialValue = 0.25f, targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(d, delayMillis = i * 60, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "bar$i",
        )
    }
    Row(modifier.size(width = 14.dp, height = height), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
        bars.forEach { anim ->
            val f = if (playing) anim.value else 0.3f
            androidx.compose.foundation.layout.Box(
                Modifier
                    .width(3.dp)
                    .fillMaxHeight(f)
                    .clip(RoundedCornerShape(1.5.dp))
                    .background(color),
            )
        }
    }
}

/** Moving highlight for loading placeholders. */
fun Modifier.shimmer(shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(12.dp)): Modifier = composed {
    val base = MaterialTheme.colorScheme.surfaceContainerHigh
    val highlight = MaterialTheme.colorScheme.surfaceContainerHighest
    val t = rememberInfiniteTransition(label = "shimmer")
    val x by t.animateFloat(
        initialValue = -400f, targetValue = 1200f,
        animationSpec = infiniteRepeatable(tween(1200, easing = LinearEasing)),
        label = "x",
    )
    this.clip(shape).background(
        Brush.linearGradient(listOf(base, highlight, base), start = Offset(x, 0f), end = Offset(x + 400f, 200f)),
    )
}
