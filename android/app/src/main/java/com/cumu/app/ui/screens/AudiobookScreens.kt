package com.cumu.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Audiobook
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.LocalSnackbar
import com.cumu.app.ui.components.Cover
import com.cumu.app.ui.components.EmptyBox
import com.cumu.app.ui.components.EqualizerBars
import com.cumu.app.ui.components.LoadContent
import com.cumu.app.ui.components.SectionTitle
import com.cumu.app.ui.components.SongMenu
import com.cumu.app.ui.components.bounceClick
import com.cumu.app.ui.components.errorText
import com.cumu.app.ui.components.formatDuration
import com.cumu.app.ui.components.rememberLoad
import kotlinx.coroutines.launch

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "5 Std. 12 Min." / "45 Min." */
internal fun formatBookLength(seconds: Double): String {
    val min = Math.round(seconds / 60.0).toInt()
    return when {
        min >= 60 && min % 60 != 0 -> "${min / 60} Std. ${min % 60} Min."
        min >= 60 -> "${min / 60} Std."
        else -> "${min.coerceAtLeast(if (seconds > 0) 1 else 0)} Min."
    }
}

/** Progress or size of a book, e.g. "42 % · noch 3 Std. 5 Min." */
internal fun bookStatus(b: Audiobook): String {
    val p = b.progress
    return when {
        p != null && p.finished -> "Fertig gehört"
        p != null -> "${p.percent} % · noch ${formatBookLength(p.remaining)}"
        else -> "${if (b.chapterCount == 1) "1 Kapitel" else "${b.chapterCount} Kapitel"} · ${formatBookLength(b.duration)}"
    }
}

/** Starts a book: loads its chapters and continues at the saved position. */
internal fun playBook(bookId: String, snackbar: (String) -> Unit, chapterIndex: Int? = null, restart: Boolean = false) {
    val app = CumuApplication.instance
    app.appScope.launch {
        try {
            if (restart) runCatching { app.repo.clearAudiobookProgress(bookId) }
            val book = app.repo.audiobook(bookId)
            app.player.playAudiobook(if (restart) book.copy(progress = null) else book, chapterIndex, restart)
        } catch (e: Exception) {
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) { snackbar(errorText(e)) }
        }
    }
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** Book cover with a progress bar, title, author and status. */
@Composable
fun BookCard(book: Audiobook, size: Dp = 148.dp, onClick: () -> Unit) {
    val pct = book.progress?.let { if (it.finished) 100 else it.percent } ?: 0
    Column(Modifier.width(size).bounceClick(onClick = onClick)) {
        Box {
            Cover(book.cover, size, corner = 14.dp, seed = book.title, icon = Icons.Rounded.AutoStories)
            if (pct > 0) LinearProgressIndicator(
                progress = { pct / 100f },
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp).height(4.dp).clip(CircleShape),
                color = MaterialTheme.colorScheme.primary,
                trackColor = Color.Black.copy(alpha = 0.35f),
                drawStopIndicator = {},
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(book.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        Text(
            book.artistName ?: "Unbekannt", maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            bookStatus(book), maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.labelSmall,
            color = if (book.started) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun BookCarousel(books: List<Audiobook>) {
    val nav = LocalNav.current
    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        items(books, key = { "b-" + it.id }) { b -> BookCard(b) { nav.audiobook(b.id) } }
    }
}

/** One book in a list, with a play button that continues listening. */
@Composable
private fun BookRow(book: Audiobook) {
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    Row(
        Modifier.fillMaxWidth().clickable { nav.audiobook(book.id) }.padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(book.cover, 64.dp, corner = 10.dp, seed = book.title, icon = Icons.Rounded.AutoStories)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(book.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(book.artistName ?: "Unbekannt", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                bookStatus(book), style = MaterialTheme.typography.labelSmall, maxLines = 1,
                color = if (book.started) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            book.progress?.takeIf { !it.finished }?.let { p ->
                LinearProgressIndicator(
                    progress = { p.percent / 100f },
                    modifier = Modifier.padding(top = 6.dp).fillMaxWidth(0.7f).height(3.dp).clip(CircleShape),
                    drawStopIndicator = {},
                )
            }
        }
        IconButton(onClick = { playBook(book.id, snackbar) }) {
            Icon(Icons.Rounded.PlayArrow, if (book.started) "Weiterhören" else "Abspielen", tint = MaterialTheme.colorScheme.primary)
        }
    }
}

// ── Screens ──────────────────────────────────────────────────────────────────

private enum class BookSort(val label: String) { New("Neu"), Title("Titel"), Author("Autor") }

/** All audiobooks: the started ones first ("Weiterhören"), then every book. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AudiobooksScreen() {
    val app = CumuApplication.instance
    val loader = rememberLoad(cached = { app.repo.cachedAudiobooks() }) { app.repo.audiobooks() }
    var sort by rememberSaveable { mutableStateOf(BookSort.New) }
    // Back from the player: show the new position
    val player by app.player.state.collectAsState()
    LaunchedEffect(player.isPlaying) { if (!player.isPlaying && player.current?.isAudiobook == true) loader.reload() }

    Scaffold(topBar = { TopAppBar(title = { Text("Hörbücher") }, navigationIcon = { BackButton() }) }) { padding ->
        PullToRefreshBox(loader.refreshing, loader.reload, Modifier.fillMaxSize().padding(padding)) {
            LoadContent(loader) { data ->
                val sorted = remember(data, sort) {
                    when (sort) {
                        BookSort.New -> data.books.sortedByDescending { it.createdAt ?: 0 }
                        BookSort.Title -> data.books.sortedBy { it.title.lowercase() }
                        BookSort.Author -> data.books.sortedWith(compareBy({ (it.artistName ?: "").lowercase() }, { it.title.lowercase() }))
                    }
                }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                    if (data.books.isEmpty()) item {
                        EmptyBox(Icons.Rounded.AutoStories, "Noch keine Hörbücher. Titel im Genre „Speech“ erscheinen hier automatisch – nie zwischen deiner Musik.")
                    }
                    if (data.continueListening.isNotEmpty()) {
                        item { SectionTitle("Weiterhören", subtitle = "Da, wo du aufgehört hast", modifier = Modifier.padding(top = 0.dp)) }
                        item { BookCarousel(data.continueListening) }
                    }
                    if (data.books.isNotEmpty()) {
                        item { SectionTitle("Alle Hörbücher", subtitle = if (data.books.size == 1) "1 Buch" else "${data.books.size} Bücher") }
                        if (data.books.size > 1) item {
                            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(BookSort.entries.toList()) { f ->
                                    FilterChip(selected = sort == f, onClick = { sort = f }, label = { Text(f.label) }, shape = CircleShape, colors = cumuChipColors())
                                }
                            }
                        }
                        items(sorted, key = { "all-" + it.id }) { b -> BookRow(b) }
                    }
                }
            }
        }
    }
}

/** One book: cover, progress, continue / start over and the chapters. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AudiobookScreen(id: String) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val loader = rememberLoad(id) { app.repo.audiobook(id) }
    val player by app.player.state.collectAsState()
    val playingThis = player.current?.let { it.isAudiobook && it.audiobookId == id } == true
    // Paused in this book: reload, so progress and "continue" are up to date
    LaunchedEffect(playingThis && !player.isPlaying) { if (playingThis && !player.isPlaying) loader.reload() }

    Scaffold(topBar = { TopAppBar(title = { Text("Hörbuch", maxLines = 1) }, navigationIcon = { BackButton() }) }) { padding ->
        LoadContent(loader) { book ->
            val chapters = remember(book) {
                book.chapters.map {
                    it.copy(audiobookFlag = 1, bookId = book.id, bookTitle = book.title, cover = it.cover ?: book.cover, albumTitle = it.albumTitle ?: book.title)
                }
            }
            val p = book.progress
            LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Cover(book.cover, 220.dp, corner = 16.dp, seed = book.title, icon = Icons.Rounded.AutoStories)
                        Spacer(Modifier.height(16.dp))
                        Text(book.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                        Text(
                            book.artistName ?: "Unbekannt",
                            Modifier.then(if (book.artistId != null) Modifier.clickable { nav.artist(book.artistId) } else Modifier).padding(top = 4.dp),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            listOfNotNull(
                                if (book.chapterCount == 1) "1 Kapitel" else "${book.chapterCount} Kapitel",
                                formatBookLength(book.duration),
                                book.year?.toString(),
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (p != null) {
                            Spacer(Modifier.height(14.dp))
                            LinearProgressIndicator(
                                progress = { (if (p.finished) 100 else p.percent) / 100f },
                                modifier = Modifier.fillMaxWidth(0.8f).height(6.dp).clip(CircleShape),
                                drawStopIndicator = {},
                            )
                            Text(
                                if (p.finished) "Fertig gehört" else "${p.percent} % · noch ${formatBookLength(p.remaining)} · Kapitel ${p.chapterIndex + 1}",
                                Modifier.padding(top = 6.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Button(onClick = { app.player.playAudiobook(book) }, enabled = chapters.isNotEmpty()) {
                            Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(6.dp))
                            Text(
                                when {
                                    book.started -> "Weiterhören"
                                    p?.finished == true -> "Nochmal hören"
                                    else -> "Abspielen"
                                },
                            )
                        }
                        if (book.started) OutlinedButton(onClick = { playBook(book.id, snackbar, chapterIndex = 0, restart = true) }) {
                            Icon(Icons.Rounded.RestartAlt, null); Spacer(Modifier.width(6.dp)); Text("Von vorn")
                        }
                        Spacer(Modifier.weight(1f))
                        IconButton(onClick = { app.player.enqueueAudiobook(book); snackbar("Zur Warteschlange hinzugefügt") }) {
                            Icon(Icons.AutoMirrored.Rounded.QueueMusic, "Zur Warteschlange")
                        }
                        if (p?.finished != true) IconButton(onClick = {
                            val last = chapters.lastOrNull() ?: return@IconButton
                            scope.launch {
                                try {
                                    app.repo.saveAudiobookProgress(book.id, last.id, last.duration ?: 0.0, finished = true)
                                    snackbar("Als fertig gehört markiert")
                                    loader.reload()
                                } catch (e: Exception) { snackbar(errorText(e)) }
                            }
                        }) { Icon(Icons.Rounded.DoneAll, "Als fertig gehört markieren") }
                        DownloadAllButton(chapters)
                    }
                }
                item { SectionTitle("Kapitel", modifier = Modifier.padding(top = 0.dp)) }
                itemsIndexed(chapters, key = { _, c -> c.id }) { i, c ->
                    val current = if (playingThis) player.current?.id == c.id else (book.started && p?.songId == c.id)
                    val done = p != null && (p.finished || i < p.chapterIndex)
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 60.dp)
                            .clickable {
                                // The saved chapter continues where it stopped, others start at 0
                                if (book.started && p?.songId == c.id) app.player.playAudiobook(book)
                                else app.player.playAudiobook(book, i)
                            }
                            .padding(start = 20.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.width(36.dp), contentAlignment = Alignment.CenterStart) {
                            when {
                                current && playingThis -> EqualizerBars(player.isPlaying)
                                current -> Icon(Icons.Rounded.PlayArrow, null, tint = MaterialTheme.colorScheme.primary)
                                done -> Icon(Icons.Rounded.Check, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                else -> Text("${i + 1}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                c.title, maxLines = 2, overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = if (current) FontWeight.SemiBold else FontWeight.Normal,
                                color = when {
                                    current -> MaterialTheme.colorScheme.primary
                                    done -> MaterialTheme.colorScheme.onSurfaceVariant
                                    else -> MaterialTheme.colorScheme.onSurface
                                },
                            )
                            if (current && !playingThis && p != null) Text(
                                "Angehalten bei ${formatDuration(p.position)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            formatDuration(c.duration),
                            Modifier.padding(horizontal = 8.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        SongMenu(c)
                    }
                }
            }
        }
    }
}

/** Entry for the library list and the home screen header of the section. */
@Composable
internal fun AudiobookBadge(modifier: Modifier = Modifier) {
    Box(
        modifier.clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.tertiaryContainer).padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text("HÖRBUCH", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onTertiaryContainer, fontWeight = FontWeight.Bold)
    }
}

/** Large card for "continue listening" on the home screen. */
@Composable
internal fun ContinueBookCard(book: Audiobook, modifier: Modifier = Modifier) {
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val p = book.progress
    Row(
        modifier.width(300.dp).clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .bounceClick(0.98f) { nav.audiobook(book.id) }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(book.cover, 76.dp, corner = 12.dp, seed = book.title, icon = Icons.Rounded.AutoStories)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            AudiobookBadge()
            Text(book.title, Modifier.padding(top = 4.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(book.artistName ?: "Unbekannt", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (p != null) {
                LinearProgressIndicator(
                    progress = { p.percent / 100f },
                    modifier = Modifier.padding(top = 6.dp).fillMaxWidth().height(4.dp).clip(CircleShape),
                    drawStopIndicator = {},
                )
                Text("noch ${formatBookLength(p.remaining)}", Modifier.padding(top = 2.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        FilledIconButton(onClick = { playBook(book.id, snackbar) }, Modifier.size(44.dp)) {
            Icon(Icons.Rounded.PlayArrow, "Weiterhören")
        }
    }
}
