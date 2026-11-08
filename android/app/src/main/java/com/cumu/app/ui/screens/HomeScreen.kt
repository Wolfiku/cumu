package com.cumu.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Album
import com.cumu.app.data.GenreStats
import com.cumu.app.data.HomeData
import com.cumu.app.data.Playlist
import com.cumu.app.data.Song
import com.cumu.app.ui.LocalNav
import com.cumu.app.ui.LocalSnackbar
import com.cumu.app.ui.components.AlbumCarousel
import com.cumu.app.ui.components.Cover
import com.cumu.app.ui.components.CoverCard
import com.cumu.app.ui.components.EmptyBox
import com.cumu.app.ui.components.ErrorBox
import com.cumu.app.ui.components.HomeSkeleton
import com.cumu.app.ui.components.Load
import com.cumu.app.ui.components.MixCard
import com.cumu.app.ui.components.QuickTile
import com.cumu.app.ui.components.SectionTitle
import com.cumu.app.ui.components.SongCarousel
import com.cumu.app.ui.components.SongRow
import com.cumu.app.ui.components.bounceClick
import com.cumu.app.ui.components.errorText
import com.cumu.app.ui.components.rememberLoad
import com.cumu.app.ui.theme.LocalAccents
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.util.Calendar

/** Everything the home screen shows, loaded in parallel. */
private data class HomeFeed(
    val home: HomeData,
    val albums: List<Album>,
    val playlists: List<Playlist>,
    val genres: GenreStats,
    val artists: List<com.cumu.app.data.Artist>,
)

private fun greeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
    in 5..10 -> "Guten Morgen"
    in 11..17 -> "Hallo"
    in 18..22 -> "Guten Abend"
    else -> "Gute Nacht"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen() {
    val app = CumuApplication.instance
    val loader = rememberLoad {
        coroutineScope {
            val home = async { app.repo.home() }
            // Extras are optional: an older server or an error only hides their section
            val albums = async { runCatching { app.repo.albums() }.getOrDefault(emptyList()) }
            val playlists = async { runCatching { app.repo.playlists() }.getOrDefault(emptyList()) }
            val genres = async { runCatching { app.repo.genreStats() }.getOrDefault(GenreStats()) }
            val artists = async { runCatching { app.repo.artists() }.getOrDefault(emptyList()).filter { (it.songCount ?: 0) > 0 } }
            HomeFeed(home.await(), albums.await(), playlists.await(), genres.await(), artists.await())
        }
    }

    PullToRefreshBox(loader.refreshing, loader.reload, Modifier.fillMaxSize()) {
        when (val s = loader.state) {
            is Load.Loading -> Column(Modifier.statusBarsPadding()) { HomeHeader(); HomeSkeleton() }
            is Load.Failed -> Column(Modifier.statusBarsPadding()) { HomeHeader(); ErrorBox(s.message, loader.reload) }
            is Load.Ok -> HomeContent(s.value)
        }
    }
}

@Composable
private fun HomeHeader() {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val session by app.sessions.session.collectAsState()
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(greeting(), style = MaterialTheme.typography.headlineMedium)
            Text(
                "Schön, dass du da bist, ${session?.username ?: ""}",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = { nav.search() }) { Icon(Icons.Rounded.Search, "Suche") }
        // Avatar with the first letter of the user name
        Box(
            Modifier.size(40.dp).clip(CircleShape)
                .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary)))
                .bounceClick { nav.settings() },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                (session?.username?.firstOrNull() ?: '?').uppercase(),
                color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium,
            )
        }
    }
}

@Composable
private fun HomeContent(feed: HomeFeed) {
    val app = CumuApplication.instance
    val nav = LocalNav.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val accents = LocalAccents.current.gradients
    val player by app.player.state.collectAsState()
    val home = feed.home

    // Sections appear one after another
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }

    if (home.recentlyPlayed.isEmpty() && home.newSongs.isEmpty() && feed.albums.isEmpty()) {
        Column(Modifier.statusBarsPadding()) {
            HomeHeader()
            EmptyBox(Icons.Rounded.LibraryMusic, "Noch keine Musik auf dem Server. Ein Admin kann im Web unter Admin → Bibliothek scannen Musik hinzufügen.")
        }
        return
    }

    val recentIds = home.recentlyPlayed.map { it.id }.toSet()
    // "Recommended new songs": new on the server and not heard yet
    val freshSongs = home.newSongs.filter { it.id !in recentIds }.ifEmpty { home.newSongs }
    val newestAlbum = feed.albums.firstOrNull()
    val cumuLists = feed.playlists.filter { it.readOnly && it.songs.isNotEmpty() }

    fun playMix(load: suspend () -> List<Song>, empty: String) {
        scope.launch {
            try {
                val songs = load()
                if (songs.isEmpty()) snackbar(empty) else app.player.play(songs.shuffled().take(200))
            } catch (e: Exception) { snackbar(errorText(e)) }
        }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item { Column(Modifier.statusBarsPadding()) { HomeHeader() } }

        // Quick picks: last heard songs in a two-column grid
        if (home.recentlyPlayed.isNotEmpty()) item {
            Reveal(shown, 0) {
                Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    home.recentlyPlayed.take(6).chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { s ->
                                val i = home.recentlyPlayed.indexOf(s)
                                QuickTile(
                                    s.title, s.cover, s.id,
                                    playing = player.isPlaying && player.current?.id == s.id,
                                    onClick = { app.player.play(home.recentlyPlayed, i) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        // Hero: newest album
        if (newestAlbum != null) item {
            Reveal(shown, 1) {
                HeroAlbum(newestAlbum, onOpen = { nav.album(newestAlbum.id) }, onPlay = {
                    scope.launch {
                        try {
                            val a = app.repo.album(newestAlbum.id)
                            app.player.play(a.songs.map { it.copy(albumTitle = it.albumTitle ?: a.title, cover = it.cover ?: a.cover) })
                        } catch (e: Exception) { snackbar(errorText(e)) }
                    }
                })
            }
        }

        if (freshSongs.isNotEmpty()) {
            item { Reveal(shown, 2) { SectionTitle("Neue Songs für dich", subtitle = "Empfohlen") } }
            item { Reveal(shown, 2) { SongCarousel(freshSongs) } }
        }

        // Generated mixes
        item { Reveal(shown, 3) { SectionTitle("Deine Mixe", subtitle = "Für dich gemischt") } }
        item {
            Reveal(shown, 3) {
                LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    item {
                        MixCard("Zufallsmix", "Alles durcheinander", Icons.Rounded.Shuffle, accents[0], onClick = {
                            playMix({ app.repo.songs() }, "Die Bibliothek ist leer")
                        })
                    }
                    if (home.mostPlayed.isNotEmpty()) item {
                        MixCard("Top-Hits", "Am meisten gehört", Icons.Rounded.LocalFireDepartment, accents[3], onClick = {
                            app.player.play(home.mostPlayed)
                        })
                    }
                    items(feed.genres.topGenres, key = { "g-" + it.genre }) { g ->
                        val idx = 1 + Math.floorMod(g.genre.hashCode(), accents.size - 1)
                        MixCard(g.genre, g.topArtist?.let { "Mit $it" } ?: "${g.count} Titel", Icons.Rounded.Tag, accents[idx], onClick = {
                            playMix({ app.repo.genre(g.genre).songs }, "Keine Songs in ${g.genre}")
                        })
                    }
                }
            }
        }

        if (feed.artists.isNotEmpty()) {
            // Artists with pictures first, then the ones with the most songs
            val artists = feed.artists.sortedWith(compareBy({ it.image == null }, { -(it.songCount ?: 0) })).take(12)
            item { Reveal(shown, 4) { SectionTitle("Deine Künstler") } }
            item { Reveal(shown, 4) { com.cumu.app.ui.components.ArtistCarousel(artists) { nav.artist(it.id) } } }
        }

        if (feed.albums.size > 1) {
            item { Reveal(shown, 4) { SectionTitle("Neue Alben") } }
            item { Reveal(shown, 4) { AlbumCarousel(feed.albums.drop(1).take(12)) { nav.album(it.id) } } }
        }

        if (cumuLists.isNotEmpty()) {
            item { Reveal(shown, 5) { SectionTitle("Von cumu für dich", subtitle = "Automatisch erstellt") } }
            item {
                Reveal(shown, 5) {
                    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        items(cumuLists, key = { it.id }) { p ->
                            CoverCard(p.name, "${p.songs.size} Titel", p.songs.firstOrNull { it.cover != null }?.cover, onClick = { nav.playlist(p.id) })
                        }
                    }
                }
            }
        }

        if (home.mostPlayed.isNotEmpty()) {
            item { Reveal(shown, 6) { SectionTitle("Am meisten gehört") } }
            itemsIndexed(home.mostPlayed.take(5), key = { _, s -> "mp-" + s.id }) { i, s ->
                Reveal(shown, 6) { SongRow(s, home.mostPlayed, i, leading = "${i + 1}") }
            }
        }

        if (home.recentlyPlayed.size > 6) {
            item { Reveal(shown, 7) { SectionTitle("Zuletzt gehört") } }
            item { Reveal(shown, 7) { SongCarousel(home.recentlyPlayed) } }
        }
    }
}

/** Fades and slides a section in, staggered by [order]. */
@Composable
private fun Reveal(shown: Boolean, order: Int, content: @Composable () -> Unit) {
    AnimatedVisibility(
        visible = shown,
        enter = fadeIn(tween(400, delayMillis = order * 70)) +
            slideInVertically(tween(450, delayMillis = order * 70)) { it / 5 },
    ) { content() }
}

@Composable
private fun HeroAlbum(album: Album, onOpen: () -> Unit, onPlay: () -> Unit) {
    val accents = LocalAccents.current.gradients
    val (c1, c2) = accents[Math.floorMod(album.title.hashCode(), accents.size)]
    Box(
        Modifier
            .padding(start = 20.dp, end = 20.dp, top = 24.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Brush.linearGradient(listOf(c1, c2)))
            .bounceClick(0.98f, onOpen),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Cover(album.cover, 116.dp, corner = 14.dp, seed = album.title)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(14.dp), tint = Color.White)
                    Spacer(Modifier.width(4.dp))
                    Text("NEU FÜR DICH", color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(6.dp))
                Text(album.title, color = Color.White, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(album.artistName, album.songCount?.let { "$it Titel" }).joinToString(" · "),
                    color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(10.dp))
                FilledIconButton(
                    onClick = onPlay,
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.White, contentColor = c1),
                ) { Icon(Icons.Rounded.PlayArrow, "Album abspielen") }
            }
        }
    }
}
