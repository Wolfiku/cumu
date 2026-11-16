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
import androidx.compose.material.icons.rounded.Celebration
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material3.LocalContentColor
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.material.icons.rounded.DragHandle
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.zIndex
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.FormatListNumbered
import androidx.compose.material.icons.rounded.Forward30
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Speed
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
import com.cumu.app.ui.components.SleepTimerChip
import com.cumu.app.ui.components.SleepTimerSheet
import com.cumu.app.ui.components.SongMenu
import com.cumu.app.playback.AUDIOBOOK_SPEEDS
import com.cumu.app.ui.components.formatMs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerScreen() {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val s by app.player.state.collectAsState()
    var showQueue by remember { mutableStateOf(false) }
    var showSleep by remember { mutableStateOf(false) }
    var showDevices by remember { mutableStateOf(false) }
    var showParty by remember { mutableStateOf(false) }
    val devices by app.live.devices.collectAsState()
    val party by app.live.party.collectAsState()
    // Position while the user drags the slider
    var dragPos by remember { mutableStateOf<Float?>(null) }

    val song = s.current
    LaunchedEffect(song == null) { if (song == null) nav.back() }
    if (song == null) return
    // Audiobook chapters get podcast-style controls instead of shuffle/repeat
    val isBook = song.isAudiobook

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
                    if (isBook) (song.bookTitle ?: song.albumTitle ?: "Hörbuch") else (song.albumTitle ?: ""),
                    Modifier.weight(1f).then(
                        when {
                            isBook -> Modifier.clickable { nav.audiobook(song.audiobookId) }
                            song.albumId != null -> Modifier.clickable { nav.album(song.albumId) }
                            else -> Modifier
                        },
                    ),
                    textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SongMenu(song, onSleepTimer = { showSleep = true })
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
            // "Wiedergabe auf …" / party: only when it applies
            com.cumu.app.ui.components.LivePill(s.remoteDevice, party, onDevices = { showDevices = true }, onParty = { showParty = true })
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

            if (isBook) AudiobookControls(s) else Row(
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
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (isBook) SpeedButton(s.speed)
                Spacer(Modifier.width(4.dp))
                SleepTimerChip(isBook) { showSleep = true }
                Spacer(Modifier.weight(1f))
                // Devices: only when more than one device is online (left of the queue)
                if (devices.size > 1 || s.remoteDevice != null) IconButton(onClick = { showDevices = true }) {
                    Icon(Icons.Rounded.Devices, "Geräte", tint = if (s.remoteDevice != null) com.cumu.app.ui.components.LiveGreen else LocalContentColor.current)
                }
                IconButton(onClick = { showParty = true }) {
                    Icon(Icons.Rounded.Celebration, "Listening Party", tint = if (party != null) com.cumu.app.ui.components.PartyGradient[0] else LocalContentColor.current)
                }
                if (isBook) IconButton(onClick = { showQueue = true }) { Icon(Icons.Rounded.FormatListNumbered, "Kapitel") }
                else IconButton(onClick = { showQueue = true }) { Icon(Icons.AutoMirrored.Rounded.QueueMusic, "Warteschlange") }
            }
        }
    }

    if (showQueue) ModalBottomSheet(onDismissRequest = { showQueue = false }) {
        QueueList(if (isBook) "Kapitel" else "Warteschlange")
    }
    if (showSleep) SleepTimerSheet(isBook) { showSleep = false }
    if (showDevices) com.cumu.app.ui.components.DevicePickerSheet { showDevices = false }
    if (showParty) com.cumu.app.ui.components.PartySheet { showParty = false }
}

/** Audiobook controls: previous/next chapter, 15 s back, 30 s forward. */
@Composable
private fun AudiobookControls(s: com.cumu.app.playback.PlayerState) {
    val app = CumuApplication.instance
    Row(
        Modifier.fillMaxWidth().padding(vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = app.player::previous) { Icon(Icons.Rounded.SkipPrevious, "Vorheriges Kapitel", Modifier.size(30.dp)) }
        IconButton(onClick = { app.player.seekBy(-15_000) }, Modifier.size(56.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.Replay, "15 Sekunden zurück", Modifier.size(40.dp))
                Text("15", Modifier.padding(top = 3.dp), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            }
        }
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
        IconButton(onClick = { app.player.seekBy(30_000) }, Modifier.size(56.dp)) {
            Icon(Icons.Rounded.Forward30, "30 Sekunden vor", Modifier.size(40.dp))
        }
        IconButton(onClick = app.player::next, enabled = s.index + 1 < s.queue.size) {
            Icon(Icons.Rounded.SkipNext, "Nächstes Kapitel", Modifier.size(30.dp))
        }
    }
}

/** Playback speed of audiobooks, e.g. "1,25×"; tap for the choices. */
@Composable
private fun SpeedButton(speed: Float) {
    val app = CumuApplication.instance
    var open by remember { mutableStateOf(false) }
    Box {
        androidx.compose.material3.AssistChip(
            onClick = { open = true },
            label = { Text(formatSpeed(speed)) },
            leadingIcon = { Icon(Icons.Rounded.Speed, null, Modifier.size(18.dp)) },
            shape = androidx.compose.foundation.shape.CircleShape,
        )
        androidx.compose.material3.DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            AUDIOBOOK_SPEEDS.forEach { v ->
                androidx.compose.material3.DropdownMenuItem(
                    text = {
                        Text(
                            formatSpeed(v),
                            fontWeight = if (v == speed) FontWeight.Bold else FontWeight.Normal,
                            color = if (v == speed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        )
                    },
                    onClick = { open = false; app.player.setAudiobookSpeed(v) },
                )
            }
        }
    }
}

private fun formatSpeed(v: Float): String {
    val text = if (v == v.toInt().toFloat()) v.toInt().toString() else v.toString().trimEnd('0')
    return text.replace('.', ',') + "×"
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

/** One queue entry; its key stays the same while it is dragged (the same song may be queued twice). */
private data class QueueEntry(val key: String, val song: com.cumu.app.data.Song)

private fun entriesOf(queue: List<com.cumu.app.data.Song>): List<QueueEntry> {
    val seen = HashMap<String, Int>()
    return queue.map { song ->
        val n = (seen[song.id] ?: 0) + 1
        seen[song.id] = n
        QueueEntry("${song.id}#$n", song)
    }
}

/** The queue: tap plays, ≡ drags to a new place, × removes. */
@Composable
private fun QueueList(title: String = "Warteschlange") {
    val app = CumuApplication.instance
    val s by app.player.state.collectAsState()
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = (s.index - 1).coerceAtLeast(0))
    val entries = remember { mutableStateListOf<QueueEntry>().apply { addAll(entriesOf(s.queue)) } }
    var dragKey by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    var dragFrom by remember { mutableIntStateOf(-1) }
    // Follow the player, except while the user drags
    LaunchedEffect(s.queue) {
        if (dragKey == null) {
            entries.clear()
            entries.addAll(entriesOf(s.queue))
        }
    }
    val currentKey = remember(s.queue, s.index) { entriesOf(s.queue).getOrNull(s.index)?.key }

    val finish: () -> Unit = {
        val to = entries.indexOfFirst { it.key == dragKey }
        val from = dragFrom
        dragKey = null
        dragOffset = 0f
        if (from >= 0 && to >= 0 && from != to) app.player.move(from, to)
    }

    Column(Modifier.fillMaxWidth()) {
        Text(
            "$title · ${s.queue.size} Titel",
            Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleMedium,
        )
        LazyColumn(state = listState, modifier = Modifier.fillMaxWidth().height(480.dp)) {
            itemsIndexed(entries, key = { _, e -> e.key }) { i, e ->
                val song = e.song
                val current = e.key == currentKey
                val dragging = e.key == dragKey
                Row(
                    Modifier
                        .then(
                            if (dragging) Modifier
                                .zIndex(1f)
                                .graphicsLayer { translationY = dragOffset; shadowElevation = 12f }
                                .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                            else Modifier.animateItem(),
                        )
                        .fillMaxWidth()
                        .clickable { app.player.skipTo(i) }
                        .padding(start = 4.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Drag handle
                    Icon(
                        Icons.Rounded.DragHandle, "Verschieben",
                        Modifier
                            .size(48.dp)
                            .padding(12.dp)
                            .pointerInput(e.key) {
                                detectDragGestures(
                                    onDragStart = {
                                        dragKey = e.key
                                        dragFrom = entries.indexOfFirst { it.key == e.key }
                                        dragOffset = 0f
                                    },
                                    onDragEnd = { finish() },
                                    onDragCancel = { finish() },
                                ) { change, amount ->
                                    change.consume()
                                    dragOffset += amount.y
                                    val from = entries.indexOfFirst { it.key == dragKey }
                                    val info = listState.layoutInfo.visibleItemsInfo
                                    val me = info.firstOrNull { it.index == from } ?: return@detectDragGestures
                                    val center = me.offset + dragOffset + me.size / 2f
                                    val target = info.firstOrNull { it.index != from && center >= it.offset && center <= it.offset + it.size }
                                    if (target != null) {
                                        entries.add(target.index, entries.removeAt(from))
                                        dragOffset -= (target.offset - me.offset).toFloat()
                                    }
                                    // Near the edges the list scrolls along
                                    val viewEnd = listState.layoutInfo.viewportEndOffset
                                    val step = when {
                                        center > viewEnd - 120 -> 24f
                                        center < listState.layoutInfo.viewportStartOffset + 120 -> -24f
                                        else -> 0f
                                    }
                                    if (step != 0f) scope.launch { dragOffset += listState.scrollBy(step) }
                                }
                            },
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Cover(song.cover, 40.dp, songId = song.id, corner = 4.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            song.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = if (current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal,
                        )
                        Text(
                            listOfNotNull(song.artistName, if (song.autoplay == 1) "Autoplay" else null).joinToString(" · "),
                            maxLines = 1, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!current) IconButton(onClick = { app.player.removeAt(i) }) { Icon(Icons.Rounded.Close, "Entfernen") }
                    else Box(Modifier.size(48.dp))
                }
            }
        }
    }
}
