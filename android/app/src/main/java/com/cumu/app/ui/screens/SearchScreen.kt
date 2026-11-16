package com.cumu.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.SearchResult
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.components.AlbumCarousel
import com.cumu.app.ui.components.Cover
import com.cumu.app.ui.components.EmptyBox
import com.cumu.app.ui.components.ErrorBox
import com.cumu.app.ui.components.SectionTitle
import com.cumu.app.ui.components.SongRow
import com.cumu.app.ui.components.bounceClick
import com.cumu.app.ui.components.errorText
import kotlinx.coroutines.delay

private enum class Filter(val label: String) { All("Alle"), Songs("Songs"), Albums("Alben"), Artists("Künstler"), Playlists("Playlists") }

@Composable
fun SearchScreen() {
    val app = CumuApplication.instance
    val history by app.searchHistory.items.collectAsState()
    val focus = LocalFocusManager.current
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(Filter.All) }
    var result by remember { mutableStateOf<SearchResult?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) { result = null; error = null; loading = false; return@LaunchedEffect }
        delay(300) // debounce typing
        loading = true
        try {
            result = app.repo.search(q); error = null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            error = errorText(e)
        }
        loading = false
    }

    // A search counts for the history once the user acts on it
    val remember: () -> Unit = { app.searchHistory.add(query) }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Text("Suche", Modifier.padding(start = 20.dp, top = 16.dp, bottom = 12.dp), style = MaterialTheme.typography.headlineMedium)
        TextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            placeholder = { Text("Was möchtest du hören?") },
            leadingIcon = { Icon(Icons.Rounded.Search, null) },
            trailingIcon = {
                when {
                    loading -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    query.isNotEmpty() -> IconButton(onClick = { query = "" }) { Icon(Icons.Rounded.Close, "Leeren") }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(16.dp),
            colors = TextFieldDefaults.colors(
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            ),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { remember(); focus.clearFocus() }),
        )

        val r = result
        val mode = when {
            error != null -> 0
            r == null -> 1
            else -> 2
        }
        AnimatedContent(mode, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "search") { m ->
            when (m) {
                0 -> ErrorBox(error ?: "")
                1 -> SearchHistoryList(history, onPick = { query = it; app.searchHistory.add(it) })
                else -> if (r != null) Results(r, query.trim(), filter, { filter = it }, onAct = remember)
            }
        }
    }
}

@Composable
private fun SearchHistoryList(history: List<String>, onPick: (String) -> Unit) {
    val app = CumuApplication.instance
    if (history.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            EmptyBox(Icons.Rounded.Search, "Suche nach Songs, Alben, Künstlern und Playlists. Deine letzten Suchen erscheinen hier.")
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Zuletzt gesucht", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = { app.searchHistory.clear() }) { Text("Verlauf löschen") }
            }
        }
        items(history, key = { it }) { q ->
            ListItem(
                headlineContent = { Text(q, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                leadingContent = { Icon(Icons.Rounded.History, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                trailingContent = {
                    IconButton(onClick = { app.searchHistory.remove(q) }) {
                        Icon(Icons.Rounded.Close, "Aus Verlauf entfernen", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.animateItem().clickable { onPick(q) },
            )
        }
    }
}

@Composable
private fun Results(r: SearchResult, query: String, filter: Filter, setFilter: (Filter) -> Unit, onAct: () -> Unit) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    if (r.songs.isEmpty() && r.albums.isEmpty() && r.artists.isEmpty() && r.playlists.isEmpty()) {
        EmptyBox(Icons.Rounded.SearchOff, "Nichts gefunden für „$query“")
        return
    }
    val show = { f: Filter -> filter == Filter.All || filter == f }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(Filter.entries.toList()) { f ->
                    val count = when (f) {
                        Filter.All -> -1
                        Filter.Songs -> r.songs.size
                        Filter.Albums -> r.albums.size
                        Filter.Artists -> r.artists.size
                        Filter.Playlists -> r.playlists.size
                    }
                    if (count != 0) FilterChip(selected = filter == f, onClick = { setFilter(f) }, label = { Text(f.label) }, shape = CircleShape, colors = cumuChipColors())
                }
            }
        }

        // Top result: the best song match, big
        val top = r.songs.firstOrNull()
        if (filter == Filter.All && top != null) item {
            SectionTitle("Top-Ergebnis")
            Row(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .bounceClick(0.98f) { onAct(); app.player.play(r.songs, 0) }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Cover(top.cover, 84.dp, songId = top.id, corner = 12.dp, seed = top.title)
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(top.title, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("Song · ${top.artistName ?: "Unbekannt"}", color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
                FilledIconButton(onClick = { onAct(); app.player.play(r.songs, 0) }, Modifier.size(52.dp)) {
                    Icon(Icons.Rounded.PlayArrow, "Abspielen")
                }
            }
        }

        if (show(Filter.Songs) && r.songs.isNotEmpty()) {
            item { SectionTitle("Songs") }
            val list = if (filter == Filter.All) r.songs.take(5) else r.songs
            itemsIndexed(list, key = { _, s -> "s-" + s.id }) { i, s ->
                Box(Modifier.animateItem()) { SongRow(s, r.songs, i, onPlay = onAct) }
            }
        }
        if (show(Filter.Artists) && r.artists.isNotEmpty()) {
            item { SectionTitle("Künstler") }
            items(r.artists, key = { "ar-" + it.id }) { a ->
                ListItem(
                    headlineContent = { Text(a.name, fontWeight = FontWeight.SemiBold) },
                    supportingContent = { Text("Künstler") },
                    leadingContent = {
                        com.cumu.app.ui.components.ArtistAvatar(a.name, a.image, 52.dp)
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.animateItem().clickable { onAct(); nav.artist(a.id) },
                )
            }
        }
        if (show(Filter.Albums) && r.albums.isNotEmpty()) {
            item { SectionTitle("Alben") }
            item { AlbumCarousel(r.albums) { onAct(); nav.album(it.id) } }
        }
        if (show(Filter.Playlists) && r.playlists.isNotEmpty()) {
            item { SectionTitle("Playlists") }
            items(r.playlists, key = { "pl-" + it.id }) { p ->
                ListItem(
                    headlineContent = { Text(p.name, fontWeight = FontWeight.SemiBold) },
                    supportingContent = { Text("Playlist · ${p.songs.size} Titel") },
                    leadingContent = { Cover(p.songs.firstOrNull { it.cover != null }?.cover, 52.dp, seed = p.name, icon = Icons.AutoMirrored.Rounded.QueueMusic) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.animateItem().clickable { onAct(); nav.playlist(p.id) },
                )
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}
