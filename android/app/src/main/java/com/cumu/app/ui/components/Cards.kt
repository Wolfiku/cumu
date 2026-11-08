package com.cumu.app.ui.components

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.Album
import com.cumu.app.data.Song

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, subtitle: String? = null, action: (@Composable () -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 28.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            if (subtitle != null) Text(
                subtitle.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
            )
            Text(text, style = MaterialTheme.typography.titleLarge)
        }
        action?.invoke()
    }
}

@Composable
fun CoverCard(
    title: String,
    subtitle: String?,
    cover: String?,
    onClick: () -> Unit,
    size: Dp = 148.dp,
    songId: String? = null,
    playing: Boolean = false,
) {
    Column(Modifier.width(size).bounceClick(onClick = onClick)) {
        Box {
            Cover(cover, size, songId = songId, corner = 14.dp, seed = title)
            if (playing) Box(
                Modifier.align(Alignment.BottomEnd).padding(8.dp).size(28.dp).clip(RoundedCornerShape(50))
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center,
            ) { EqualizerBars(true, color = MaterialTheme.colorScheme.onPrimary, height = 12.dp) }
        }
        Spacer(Modifier.height(8.dp))
        Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        if (!subtitle.isNullOrBlank()) Text(
            subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Horizontal row of songs; tapping one plays the whole row from there. */
@Composable
fun SongCarousel(songs: List<Song>) {
    val app = CumuApplication.instance
    val player by app.player.state.collectAsState()
    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        itemsIndexed(songs, key = { i, s -> "$i-${s.id}" }) { i, s ->
            CoverCard(
                s.title, s.artistName, s.cover, onClick = { app.player.play(songs, i) }, songId = s.id,
                playing = player.isPlaying && player.current?.id == s.id,
            )
        }
    }
}

@Composable
fun AlbumCarousel(albums: List<Album>, onOpen: (Album) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        itemsIndexed(albums, key = { _, a -> a.id }) { _, a ->
            CoverCard(a.title, listOfNotNull(a.artistName, a.year?.toString()).joinToString(" · "), a.cover, onClick = { onOpen(a) })
        }
    }
}

/** Colourful square card for generated mixes. */
@Composable
fun MixCard(title: String, subtitle: String, icon: ImageVector, colors: Pair<Color, Color>, onClick: () -> Unit, size: Dp = 156.dp) {
    Box(
        Modifier
            .size(size)
            .bounceClick(onClick = onClick)
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(colors.first, colors.second))),
    ) {
        Icon(
            icon, null,
            Modifier.align(Alignment.TopEnd).padding(12.dp).size(30.dp),
            tint = Color.White.copy(alpha = 0.9f),
        )
        Column(Modifier.align(Alignment.BottomStart).padding(14.dp)) {
            Text(title, color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(subtitle, color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Compact tile for the "quick picks" grid on the home screen. */
@Composable
fun QuickTile(title: String, cover: String?, songId: String?, playing: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .height(56.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .bounceClick(0.97f, onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(cover, 56.dp, songId = songId, corner = 0.dp, seed = title)
        Text(
            title,
            Modifier.weight(1f).padding(horizontal = 10.dp),
            style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
            maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
        if (playing) EqualizerBars(true, Modifier.padding(end = 10.dp))
    }
}

/** Grey placeholder blocks while the home screen loads. */
@Composable
fun HomeSkeleton() {
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Box(Modifier.width(220.dp).height(34.dp).shimmer())
        Spacer(Modifier.height(20.dp))
        repeat(3) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.weight(1f).height(56.dp).shimmer(RoundedCornerShape(10.dp)))
                Box(Modifier.weight(1f).height(56.dp).shimmer(RoundedCornerShape(10.dp)))
            }
            Spacer(Modifier.height(10.dp))
        }
        Spacer(Modifier.height(20.dp))
        Box(Modifier.fillMaxWidth().height(180.dp).shimmer(RoundedCornerShape(22.dp)))
        Spacer(Modifier.height(28.dp))
        Box(Modifier.width(160.dp).height(24.dp).shimmer())
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            repeat(3) { Box(Modifier.size(148.dp).shimmer(RoundedCornerShape(14.dp))) }
        }
    }
}
