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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Album
import com.cumu.app.data.Artist
import com.cumu.app.data.Playlist
import com.cumu.app.data.Song
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.LocalSnackbar
import com.cumu.app.ui.components.Cover
import com.cumu.app.ui.components.DownloadBadge
import com.cumu.app.ui.components.EmptyBox
import com.cumu.app.ui.components.LoadContent
import com.cumu.app.ui.components.SongRow
import com.cumu.app.ui.components.errorText
import com.cumu.app.ui.components.formatBytes
import com.cumu.app.ui.components.rememberAlbumDownloadState
import com.cumu.app.ui.components.rememberDownloadStateOfIds
import com.cumu.app.ui.components.rememberLoad
import com.cumu.app.ui.theme.LocalAccents
import kotlinx.coroutines.launch

private enum class LibFilter(val label: String) { All("Alle"), Playlists("Playlists"), Albums("Alben"), Artists("Künstler") }


@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun LibraryScreen() {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    var filter by rememberSaveable { mutableStateOf(LibFilter.All) }
    var create by remember { mutableStateOf(false) }
    // One light request; the list of the last visit shows while it loads
    val loader = rememberLoad(cached = { app.repo.cachedLibraryOverview() }) { app.repo.libraryOverview() }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Bibliothek", Modifier.weight(1f), style = MaterialTheme.typography.headlineMedium)
            IconButton(onClick = { create = true }) { Icon(Icons.Rounded.Add, "Neue Playlist") }
        }
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(LibFilter.entries.toList()) { f ->
                FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(f.label) }, shape = CircleShape, colors = cumuChipColors())
            }
        }

        PullToRefreshBox(loader.refreshing, loader.reload, Modifier.fillMaxSize()) {
            LoadContent(loader) { data ->
                val pinned = data.pinned.toSet()
                // Playlists pinned in the web app come first, like there
                val playlists = remember(data) { data.playlists.sortedBy { "playlist:${it.id}" !in pinned } }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                    if (filter == LibFilter.All || filter == LibFilter.Playlists) {
                        if (data.showFavorites || data.favorites.isNotEmpty()) {
                            item(key = "pin-favorites") { FavoritesEntry(Modifier.animateItem()) }
                        }
                    }
                    if (filter == LibFilter.All) {
                        item(key = "pin-downloads") { DownloadsEntry(Modifier.animateItem()) }
                        item(key = "pin-songs") {
                            PinnedEntry(
                                "Alle Songs", "Deine ganze Musik", Icons.Rounded.MusicNote,
                                LocalAccents.current.gradients[1], Modifier.animateItem(),
                            ) { nav.songs() }
                        }
                    }
                    if (filter == LibFilter.All || filter == LibFilter.Playlists) {
                        items(playlists, key = { "p-" + it.id }) { p -> PlaylistEntry(p, "playlist:${p.id}" in pinned, Modifier.animateItem()) }
                    }
                    if (filter == LibFilter.Albums && data.albums.isNotEmpty()) {
                        item(key = "albums-hint") {
                            Text(
                                "Alben, die du in den letzten 3 Monaten gehört hast",
                                Modifier.padding(horizontal = 20.dp, vertical = 4.dp).animateItem(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (filter == LibFilter.All || filter == LibFilter.Albums) {
                        items(data.albums, key = { "a-" + it.id }) { a -> AlbumEntry(a, Modifier.animateItem()) }
                    }
                    if (filter == LibFilter.All || filter == LibFilter.Artists) {
                        items(data.artists, key = { "ar-" + it.id }) { a -> ArtistEntry(a, Modifier.animateItem()) }
                    }
                    val empty = when (filter) {
                        LibFilter.Playlists -> data.playlists.isEmpty()
                        LibFilter.Albums -> data.albums.isEmpty()
                        LibFilter.Artists -> data.artists.isEmpty()
                        LibFilter.All -> false
                    }
                    if (empty) item {
                        EmptyBox(
                            if (filter == LibFilter.Albums) Icons.Rounded.Album else Icons.AutoMirrored.Rounded.QueueMusic,
                            if (filter == LibFilter.Albums) "In den letzten 3 Monaten noch kein Album gehört" else "Hier ist noch nichts",
                        )
                    }
                }
            }
        }
    }

    if (create) NewPlaylistDialog(onDismiss = { create = false }) { name ->
        create = false
        scope.launch {
            try { val id = app.repo.createPlaylist(name); loader.reload(); nav.playlist(id) }
            catch (e: Exception) { snackbar(errorText(e)) }
        }
    }
}

/** One row of the library: artwork, title, subtitle and something on the right. */
@Composable
private fun LibraryRow(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    leading: @Composable () -> Unit,
    trailing: @Composable () -> Unit = {},
    onClick: () -> Unit,
) {
    Row(
        modifier.fillMaxWidth().clickable(onClick = onClick).padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading()
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing()
    }
}

@Composable
private fun PinnedEntry(title: String, subtitle: String, icon: ImageVector, colors: Pair<Color, Color>, modifier: Modifier = Modifier, onClick: () -> Unit) {
    LibraryRow(
        title, subtitle, modifier,
        leading = {
            Box(
                Modifier.size(60.dp).clip(RoundedCornerShape(10.dp)).background(Brush.linearGradient(listOf(colors.first, colors.second))),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(28.dp)) }
        },
        trailing = { Icon(Icons.Rounded.ChevronRight, null, Modifier.padding(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        onClick = onClick,
    )
}

@Composable
private fun DownloadsEntry(modifier: Modifier) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val downloaded by app.downloads.songs.collectAsState()
    val running by app.downloads.progress.collectAsState()
    val sub = buildString {
        append(if (downloaded.size == 1) "1 Titel" else "${downloaded.size} Titel")
        if (downloaded.isNotEmpty()) append(" · ").append(formatBytes(downloaded.values.sumOf { it.bytes }))
        if (running.isNotEmpty()) append(" · ${running.size} laden")
        else if (downloaded.isNotEmpty()) append(" · auch offline")
    }
    PinnedEntry("Heruntergeladen", sub, Icons.Rounded.DownloadDone, LocalAccents.current.gradients[2], modifier) { nav.downloads() }
}

@Composable
private fun FavoritesEntry(modifier: Modifier) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val favorites by app.repo.favorites.collectAsState()
    PinnedEntry(
        "Lieblingssongs",
        if (favorites.size == 1) "1 Titel" else "${favorites.size} Titel",
        Icons.Rounded.Favorite, LocalAccents.current.gradients[3], modifier,
    ) { nav.favorites() }
}

@Composable
private fun PlaylistEntry(p: Playlist, pinned: Boolean, modifier: Modifier) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val state = rememberDownloadStateOfIds(p.ids)
    LibraryRow(
        p.name,
        (if (pinned) "Angeheftet · " else "") +
            (if (p.readOnly) "Von cumu · " else "Playlist · ") + if (p.size == 1) "1 Titel" else "${p.size} Titel",
        modifier,
        leading = {
            Box {
                Cover(p.coverOrFirst, 60.dp, corner = 10.dp, seed = p.name, icon = Icons.AutoMirrored.Rounded.QueueMusic)
                if (p.readOnly) Icon(
                    Icons.Rounded.AutoAwesome, null,
                    Modifier.align(Alignment.BottomEnd).padding(3.dp).size(16.dp).clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary).padding(2.dp),
                    tint = MaterialTheme.colorScheme.onPrimary,
                )
            }
        },
        trailing = {
            DownloadBadge(state, onDownload = if (p.size == 0) null else ({
                scope.launch {
                    // Summaries carry only the song ids: load the songs first
                    try { app.downloads.download(p.songs.ifEmpty { app.repo.playlist(p.id).songs }) }
                    catch (e: Exception) { snackbar(errorText(e)) }
                }
            }))
        },
        onClick = { nav.playlist(p.id) },
    )
}

@Composable
private fun AlbumEntry(a: Album, modifier: Modifier) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val state = rememberAlbumDownloadState(a.id, a.songCount ?: 0)
    LibraryRow(
        a.title,
        listOfNotNull("Album", a.artistName, a.year?.toString()).joinToString(" · "),
        modifier,
        leading = { Cover(a.cover, 60.dp, corner = 10.dp, seed = a.title, icon = Icons.Rounded.Album) },
        trailing = {
            DownloadBadge(state, onDownload = {
                scope.launch {
                    try {
                        val full = app.repo.album(a.id)
                        app.downloads.download(full.songs.map {
                            it.copy(albumId = it.albumId ?: full.id, albumTitle = it.albumTitle ?: full.title, cover = it.cover ?: full.cover)
                        })
                    } catch (e: Exception) { snackbar(errorText(e)) }
                }
            })
        },
        onClick = { nav.album(a.id) },
    )
}

@Composable
private fun ArtistEntry(a: Artist, modifier: Modifier) {
    val nav = LocalNav.current
    LibraryRow(
        a.name,
        listOfNotNull(
            "Künstler",
            a.albumCount?.takeIf { it > 0 }?.let { if (it == 1) "1 Album" else "$it Alben" },
            a.songCount?.let { if (it == 1) "1 Titel" else "$it Titel" },
        ).joinToString(" · "),
        modifier,
        leading = {
            com.cumu.app.ui.components.ArtistAvatar(a.name, a.image, 60.dp)
        },
        onClick = { nav.artist(a.id) },
    )
}

@Composable
private fun NewPlaylistDialog(onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Neue Playlist") },
        text = { OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true) },
        confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { onCreate(name.trim()) }) { Text("Erstellen") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
    )
}

/** Favourite songs, the same list as in the web app. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen() {
    val app = CumuApplication.instance
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val loader = rememberLoad(cached = { app.repo.cachedFavoriteSongs() }) { app.repo.favoriteSongs() }
    // Hearts removed here disappear from the list at once
    var removed by remember { mutableStateOf(setOf<String>()) }
    Scaffold(topBar = { TopAppBar(title = { Text("Lieblingssongs") }, navigationIcon = { BackButton() }) }) { padding ->
        PullToRefreshBox(loader.refreshing, loader.reload, Modifier.fillMaxSize().padding(padding)) {
            LoadContent(loader) { all ->
                // Newest favourites first
                val songs = all.filter { it.id !in removed }.asReversed()
                if (songs.isEmpty()) EmptyBox(Icons.Rounded.FavoriteBorder, "Noch keine Lieblingssongs. Tippe im Player auf das Herz.")
                else LazyColumn(Modifier.fillMaxSize()) {
                    item { PlayShuffleRow(songs, Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) }
                    itemsIndexed(songs, key = { _, s -> s.id }) { i, s ->
                        SongRow(s, songs, i, onRemove = {
                            scope.launch {
                                try { app.repo.setFavorite(s.id, false); removed = removed + s.id }
                                catch (e: Exception) { snackbar(errorText(e)) }
                            }
                        }, removeLabel = "Aus Lieblingssongs entfernen")
                    }
                }
            }
        }
    }
}

/** All songs of the server, A–Z. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AllSongsScreen() {
    val app = CumuApplication.instance
    val loader = rememberLoad { app.repo.songs().sortedBy { it.title.lowercase() } }
    Scaffold(topBar = { TopAppBar(title = { Text("Alle Songs") }, navigationIcon = { BackButton() }) }) { padding ->
        PullToRefreshBox(loader.refreshing, loader.reload, Modifier.fillMaxSize().padding(padding)) {
            LoadContent(loader) { songs ->
                if (songs.isEmpty()) EmptyBox(Icons.AutoMirrored.Rounded.QueueMusic, "Keine Songs")
                else LazyColumn(Modifier.fillMaxSize()) {
                    item { PlayShuffleRow(songs, Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) }
                    itemsIndexed(songs, key = { _, s -> s.id }) { i, s -> SongRow(s, songs, i) }
                }
            }
        }
    }
}

/** "Abspielen" and "Zufällig" buttons above a song list. */
@Composable
fun PlayShuffleRow(songs: List<Song>, modifier: Modifier = Modifier, extra: (@Composable () -> Unit)? = null) {
    val app = CumuApplication.instance
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Button(onClick = { app.player.play(songs) }, enabled = songs.isNotEmpty()) {
            Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(6.dp)); Text("Abspielen")
        }
        OutlinedButton(onClick = { app.player.play(songs, shuffle = true) }, enabled = songs.isNotEmpty()) {
            Icon(Icons.Rounded.Shuffle, null); Spacer(Modifier.width(6.dp)); Text("Zufällig")
        }
        Spacer(Modifier.weight(1f))
        extra?.invoke()
    }
}

@Composable
internal fun BackButton() {
    val nav = LocalNav.current
    IconButton(onClick = { nav.back() }) {
        Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Zurück")
    }
}


/** Filter chips in cumu blue (Material's default would be the green secondary colour). */
@Composable
internal fun cumuChipColors() = androidx.compose.material3.FilterChipDefaults.filterChipColors(
    selectedContainerColor = MaterialTheme.colorScheme.primary,
    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
)
