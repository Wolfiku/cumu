package com.cumu.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.launch
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.media3.common.Player
import com.cumu.app.CumuApplication
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.components.Cover
import com.cumu.app.ui.components.SongMenu
import com.cumu.app.ui.components.formatMs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerScreen() {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val s by app.player.state.collectAsState()
    var showQueue by remember { mutableStateOf(false) }
    // Position while the user drags the slider
    var dragPos by remember { mutableStateOf<Float?>(null) }

    val song = s.current
    LaunchedEffect(song == null) { if (song == null) nav.back() }
    if (song == null) return

    val coverScale by animateFloatAsState(
        if (s.isPlaying) 1f else 0.86f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
        label = "cover",
    )
    val tint = MaterialTheme.colorScheme.primary
    Surface(Modifier.fillMaxSize()) {
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(listOf(tint.copy(alpha = 0.28f), tint.copy(alpha = 0.06f), Color.Transparent)),
            ),
        )
        Column(
            Modifier.fillMaxSize().systemBarsPadding().padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { nav.back() }) { Icon(Icons.Rounded.KeyboardArrowDown, "Schließen") }
                Text(
                    song.albumTitle ?: "",
                    Modifier.weight(1f).then(if (song.albumId != null) Modifier.clickable { nav.album(song.albumId) } else Modifier),
                    textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SongMenu(song)
            }

            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                val side = min(maxWidth, maxHeight)
                // Next/previous song slides in from the side it comes from
                AnimatedContent(
                    targetState = song,
                    contentKey = { it.id },
                    transitionSpec = {
                        val dir = if (s.index >= 0 && (s.queue.indexOfFirst { it.id == targetState.id } < s.queue.indexOfFirst { it.id == initialState.id })) -1 else 1
                        (slideInHorizontally(tween(350)) { it * dir / 2 } + fadeIn(tween(350)) + scaleIn(tween(350), initialScale = 0.9f)) togetherWith
                            (slideOutHorizontally(tween(350)) { -it * dir / 2 } + fadeOut(tween(250)))
                    },
                    label = "cover",
                ) { sg ->
                    Cover(
                        sg.cover, side,
                        Modifier.aspectRatio(1f).graphicsLayer { scaleX = coverScale; scaleY = coverScale; shadowElevation = 24f; shape = RoundedCornerShape(20.dp); clip = true },
                        songId = sg.id, corner = 20.dp, seed = sg.title,
                    )
                }
            }

            AnimatedContent(
                targetState = song,
                contentKey = { it.id },
                transitionSpec = { (fadeIn(tween(300)) + slideInVertically(tween(300)) { it / 3 }) togetherWith fadeOut(tween(200)) },
                label = "title",
            ) { song ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(song.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        song.artistName ?: "Unbekannt",
                        Modifier.then(if (song.artistId != null) Modifier.clickable { nav.artist(song.artistId) } else Modifier),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                FavoriteButton(song.id)
            }
            }
            s.error?.let { Text(it, Modifier.fillMaxWidth().padding(top = 8.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            Spacer(Modifier.height(12.dp))
            val duration = s.durationMs.coerceAtLeast(1)
            Slider(
                value = dragPos ?: (s.positionMs.toFloat() / duration).coerceIn(0f, 1f),
                onValueChange = { dragPos = it },
                onValueChangeFinished = { dragPos?.let { app.player.seekTo((it * duration).toLong()) }; dragPos = null },
                enabled = s.durationMs > 0,
                colors = androidx.compose.material3.SliderDefaults.colors(
                    inactiveTrackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                    inactiveTickColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
            Row(Modifier.fillMaxWidth()) {
                Text(formatMs(dragPos?.let { (it * duration).toLong() } ?: s.positionMs), style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.weight(1f))
                Text(formatMs(s.durationMs), style = MaterialTheme.typography.bodySmall)
            }

            Row(
                Modifier.fillMaxWidth().padding(vertical = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val active = MaterialTheme.colorScheme.primary
                val inactive = MaterialTheme.colorScheme.onSurfaceVariant
                IconButton(onClick = app.player::toggleShuffle) {
                    Icon(Icons.Rounded.Shuffle, "Zufällig", tint = if (s.shuffle) active else inactive)
                }
                IconButton(onClick = app.player::previous, Modifier.size(56.dp)) { Icon(Icons.Rounded.SkipPrevious, "Zurück", Modifier.size(36.dp)) }
                FilledIconButton(
                    onClick = app.player::togglePlay,
                    modifier = Modifier.size(76.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(),
                ) {
                    val mode = when { s.isBuffering && !s.isPlaying -> 0; s.isPlaying -> 1; else -> 2 }
                    AnimatedContent(mode, transitionSpec = { (scaleIn(initialScale = 0.6f) + fadeIn()) togetherWith (scaleOut(targetScale = 0.6f) + fadeOut()) }, label = "play") { m ->
                        when (m) {
                            0 -> CircularProgressIndicator(Modifier.size(32.dp), strokeWidth = 3.dp, color = MaterialTheme.colorScheme.onPrimary)
                            1 -> Icon(Icons.Rounded.Pause, "Pause", Modifier.size(40.dp))
                            else -> Icon(Icons.Rounded.PlayArrow, "Abspielen", Modifier.size(40.dp))
                        }
                    }
                }
                IconButton(onClick = app.player::next, Modifier.size(56.dp)) { Icon(Icons.Rounded.SkipNext, "Weiter", Modifier.size(36.dp)) }
                IconButton(onClick = app.player::cycleRepeat) {
                    Icon(
                        if (s.repeatMode == Player.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                        when (s.repeatMode) { Player.REPEAT_MODE_ONE -> "Titel wiederholen"; Player.REPEAT_MODE_ALL -> "Alle wiederholen"; else -> "Nicht wiederholen" },
                        tint = if (s.repeatMode != Player.REPEAT_MODE_OFF) active else inactive,
                    )
                }
            }
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.End) {
                IconButton(onClick = { showQueue = true }) { Icon(Icons.AutoMirrored.Rounded.QueueMusic, "Warteschlange") }
            }
        }
    }

    if (showQueue) ModalBottomSheet(onDismissRequest = { showQueue = false }) {
        QueueList()
    }
}

/** Heart next to the title: favourite songs, shared with the web app. */
@Composable
private fun FavoriteButton(songId: String) {
    val app = CumuApplication.instance
    val snackbar = com.cumu.app.ui.LocalSnackbar.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val favorites by app.repo.favorites.collectAsState()
    val favorite = songId in favorites
    val scale by animateFloatAsState(
        if (favorite) 1.15f else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "heart",
    )
    IconButton(onClick = {
        scope.launch {
            try { app.repo.setFavorite(songId, !favorite) }
            catch (e: Exception) { snackbar(com.cumu.app.ui.components.errorText(e)) }
        }
    }) {
        Icon(
            if (favorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
            if (favorite) "Aus Lieblingssongs entfernen" else "Zu Lieblingssongs",
            Modifier.size(28.dp).graphicsLayer { scaleX = scale; scaleY = scale },
            tint = if (favorite) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun QueueList() {
    val app = CumuApplication.instance
    val s by app.player.state.collectAsState()
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = (s.index - 1).coerceAtLeast(0))
    Column(Modifier.fillMaxWidth()) {
        Text(
            "Warteschlange · ${s.queue.size} Titel",
            Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleMedium,
        )
        LazyColumn(state = listState, modifier = Modifier.fillMaxWidth().height(480.dp)) {
            itemsIndexed(s.queue, key = { i, song -> "$i-${song.id}" }) { i, song ->
                val current = i == s.index
                Row(
                    Modifier.fillMaxWidth().clickable { app.player.skipTo(i) }.padding(start = 20.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Cover(song.cover, 40.dp, songId = song.id, corner = 4.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            song.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = if (current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal,
                        )
                        Text(song.artistName ?: "", maxLines = 1, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (!current) IconButton(onClick = { app.player.removeAt(i) }) { Icon(Icons.Rounded.Close, "Entfernen") }
                    else Box(Modifier.size(48.dp))
                }
            }
        }
    }
}
