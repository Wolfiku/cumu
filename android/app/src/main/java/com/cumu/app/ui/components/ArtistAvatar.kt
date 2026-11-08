package com.cumu.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.SubcomposeAsyncImage
import com.cumu.app.CumuApplication
import com.cumu.app.data.Artist
import com.cumu.app.ui.theme.LocalAccents

/** Round artist picture; the first letter on a gradient when there is none. */
@Composable
fun ArtistAvatar(name: String, image: String?, size: Dp, modifier: Modifier = Modifier) {
    val gradients = LocalAccents.current.gradients
    val (c1, c2) = gradients[Math.floorMod(name.hashCode(), gradients.size)]
    val fallback = @Composable {
        Box(Modifier.size(size).clip(CircleShape).background(Brush.linearGradient(listOf(c1, c2))), contentAlignment = Alignment.Center) {
            Text(
                name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold,
                fontSize = (size.value * 0.4f).sp,
            )
        }
    }
    val url = CumuApplication.instance.api.coverUrl(image)
    if (url == null) {
        Box(modifier) { fallback() }
    } else {
        SubcomposeAsyncImage(
            url, name, modifier.size(size).clip(CircleShape), contentScale = ContentScale.Crop,
            loading = { fallback() }, error = { fallback() },
        )
    }
}

/** Horizontal row of round artist pictures with names. */
@Composable
fun ArtistCarousel(artists: List<Artist>, onOpen: (Artist) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        items(artists, key = { it.id }) { a ->
            Column(Modifier.width(112.dp).bounceClick { onOpen(a) }, horizontalAlignment = Alignment.CenterHorizontally) {
                ArtistAvatar(a.name, a.image, 112.dp)
                Spacer(Modifier.height(8.dp))
                Text(
                    a.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                )
                Text("Künstler", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
