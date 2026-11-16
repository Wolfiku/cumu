package com.cumu.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.cumu.app.CumuApplication
import com.cumu.app.data.Artist
import com.cumu.app.data.Song
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.components.AlbumCarousel
import com.cumu.app.ui.components.EmptyBox
import com.cumu.app.ui.components.LoadContent
import com.cumu.app.ui.components.SectionTitle
import com.cumu.app.ui.components.SongRow
import com.cumu.app.ui.components.rememberLoad
import com.cumu.app.ui.theme.LocalAccents

private val HeaderHeight = 340.dp

/**
 * Artist page: large photo (artist image, else album art) that fades into
 * the page, popular songs, albums and all songs. A small title bar appears
 * once the header has scrolled away.
 */
@Composable
fun ArtistScreen(id: String) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val loader = rememberLoad(id) { app.repo.artist(id) }
    val list = rememberLazyListState()
    val collapsed by remember { derivedStateOf { list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > 600 } }
    val name = (loader.state as? com.cumu.app.ui.components.Load.Ok)?.value?.name ?: ""

    Box(Modifier.fillMaxSize()) {
        LoadContent(loader) { artist ->
            val songs = artist.songs.map { it.copy(artistName = it.artistName ?: artist.name, artistId = it.artistId ?: artist.id) }
            val popular = songs.sortedByDescending { it.playCount ?: 0 }.take(5)
            LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    // Parallax: the photo moves slower than the list
                    val offset = if (list.firstVisibleItemIndex == 0) list.firstVisibleItemScrollOffset else 0
                    ArtistHeader(artist, songs, Modifier.graphicsLayer { translationY = offset * 0.45f; alpha = 1f - (offset / 900f).coerceIn(0f, 0.6f) })
                }
                item { ArtistActions(songs) }
                if (popular.isNotEmpty()) {
                    item { SectionTitle("Beliebt") }
                    itemsIndexed(popular, key = { _, s -> "pop-" + s.id }) { i, s -> SongRow(s, popular, i, leading = "${i + 1}") }
                }
                if (artist.albums.isNotEmpty()) {
                    item { SectionTitle("Alben", subtitle = if (artist.albums.size == 1) "1 Album" else "${artist.albums.size} Alben") }
                    item { AlbumCarousel(artist.albums.map { it.copy(artistName = null) }) { nav.album(it.id) } }
                }
                if (songs.size > popular.size) {
                    item { SectionTitle("Alle Titel", subtitle = totalLength(songs)) }
                    itemsIndexed(songs, key = { _, s -> "all-" + s.id }) { i, s -> SongRow(s, songs, i) }
                }
                if (songs.isEmpty()) item { EmptyBox(Icons.Rounded.Person, "Von diesem Künstler gibt es noch keine Titel.") }
            }
        }

        // Title bar that fades in when scrolled
        AnimatedVisibility(collapsed, enter = fadeIn(), exit = fadeOut()) {
            Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 2.dp) {
                Row(Modifier.fillMaxWidth().statusBarsPadding().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.width(56.dp))
                    Text(name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        // Back button, always on top
        Box(Modifier.statusBarsPadding().padding(4.dp)) {
            FilledIconButton(
                onClick = { nav.back() },
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = if (collapsed) Color.Transparent else Color.Black.copy(alpha = 0.35f),
                    contentColor = if (collapsed) MaterialTheme.colorScheme.onSurface else Color.White,
                ),
            ) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Zurück") }
        }
    }
}


@Composable
private fun ArtistHeader(artist: Artist, songs: List<Song>, modifier: Modifier) {
    val app = CumuApplication.instance
    val picture = artist.image ?: artist.albums.firstNotNullOfOrNull { it.cover } ?: songs.firstNotNullOfOrNull { it.cover }
    val url = app.api.coverUrl(picture)
    val gradients = LocalAccents.current.gradients
    val (c1, c2) = gradients[Math.floorMod(artist.name.hashCode(), gradients.size)]
    val surface = MaterialTheme.colorScheme.surface

    Box(modifier.fillMaxWidth().height(HeaderHeight)) {
        Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(c1, c2))))
        if (url != null) AsyncImage(url, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Icon(Icons.Rounded.Person, null, Modifier.align(Alignment.Center).size(120.dp), tint = Color.White.copy(alpha = 0.5f))
        // Dark fade for readable text, then into the page background
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = 0.25f),
                    0.45f to Color.Transparent,
                    0.8f to Color.Black.copy(alpha = 0.45f),
                    1f to surface,
                ),
            ),
        )
        Column(Modifier.align(Alignment.BottomStart).padding(start = 20.dp, end = 20.dp, bottom = 28.dp)) {
            Text("KÜNSTLER", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            Text(
                artist.name, color = Color.White,
                style = MaterialTheme.typography.displaySmall, maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(
                    artist.albums.size.takeIf { it > 0 }?.let { if (it == 1) "1 Album" else "$it Alben" },
                    if (songs.size == 1) "1 Titel" else "${songs.size} Titel",
                ).joinToString(" · "),
                color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun ArtistActions(songs: List<Song>) {
    val app = CumuApplication.instance
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedIconButton(onClick = { app.player.play(songs, shuffle = true) }, enabled = songs.isNotEmpty()) {
            Icon(Icons.Rounded.Shuffle, "Zufällig")
        }
        DownloadAllButton(songs)
        Spacer(Modifier.weight(1f))
        FilledIconButton(onClick = { app.player.play(songs) }, enabled = songs.isNotEmpty(), modifier = Modifier.size(60.dp)) {
            Icon(Icons.Rounded.PlayArrow, "Abspielen", Modifier.size(32.dp))
        }
    }
}

