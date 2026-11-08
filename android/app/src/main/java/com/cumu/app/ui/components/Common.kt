package com.cumu.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import com.cumu.app.CumuApplication
import com.cumu.app.data.ApiException
import java.io.IOException

/** Result of loading something from the server. */
sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Failed(val message: String) : Load<Nothing>
}

/** [refreshing]: reloading while the previous content stays visible. */
class Loader<T>(val state: Load<T>, val refreshing: Boolean, val reload: () -> Unit)

/** Loads [block] when shown and again on [Loader.reload]. */
@Composable
fun <T> rememberLoad(vararg keys: Any?, block: suspend () -> T): Loader<T> {
    var attempt by remember { mutableIntStateOf(0) }
    var state by remember(*keys) { mutableStateOf<Load<T>>(Load.Loading) }
    var refreshing by remember { mutableStateOf(false) }
    LaunchedEffect(*keys, attempt) {
        if (state is Load.Ok) refreshing = true else state = Load.Loading
        try {
            state = Load.Ok(block())
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // A failed refresh keeps the content that is already shown
            if (state !is Load.Ok) state = Load.Failed(errorText(e))
        } finally {
            refreshing = false
        }
    }
    // Reload (button or pull to refresh) asks the server again even when offline
    return Loader(state, refreshing) { CumuApplication.instance.api.retrySoon(); attempt++ }
}

fun errorText(e: Throwable): String = when (e) {
    is com.cumu.app.data.OfflineException -> "Offline nicht verfügbar. Sobald cumu den Server einmal erreicht hat, geht das auch offline."
    is ApiException -> e.message ?: "Serverfehler"
    is IOException -> "Keine Verbindung zum Server."
    else -> e.message ?: "Fehler"
}

/** Shows loading / error / content for a [Loader]. */
@Composable
fun <T> LoadContent(loader: Loader<T>, content: @Composable (T) -> Unit) {
    when (val s = loader.state) {
        is Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is Load.Failed -> ErrorBox(s.message, loader.reload)
        is Load.Ok -> content(s.value)
    }
}

@Composable
fun ErrorBox(message: String, retry: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Rounded.CloudOff, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(message, Modifier.padding(vertical = 16.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (retry != null) Button(onClick = retry) { Text("Erneut versuchen") }
    }
}

@Composable
fun EmptyBox(icon: ImageVector, message: String) {
    Column(
        Modifier.fillMaxWidth().padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(message, Modifier.padding(top = 12.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Album art from the server (or the offline copy), with a placeholder. */
@Composable
fun Cover(
    cover: String?,
    size: Dp,
    modifier: Modifier = Modifier,
    songId: String? = null,
    corner: Dp = 8.dp,
    seed: String? = null,
    icon: ImageVector = Icons.Rounded.MusicNote,
) {
    val app = CumuApplication.instance
    val model: Any? = songId?.let { app.downloads.localCover(it) } ?: app.api.coverUrl(cover)
    val shape = RoundedCornerShape(corner)
    // Without artwork: a gradient in one of cumu's accent colours, stable per item
    val gradients = com.cumu.app.ui.theme.LocalAccents.current.gradients
    val (c1, c2) = gradients[Math.floorMod((seed ?: songId ?: cover ?: "").hashCode(), gradients.size)]
    val placeholder = @Composable {
        Box(
            Modifier.size(size).clip(shape).background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(c1, c2))),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, Modifier.size(size / 2.6f), tint = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.9f))
        }
    }
    if (model == null) {
        Box(modifier) { placeholder() }
        return
    }
    SubcomposeAsyncImage(
        model = model,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.size(size).clip(shape),
        loading = { placeholder() },
        error = { placeholder() },
    )
}

fun formatDuration(seconds: Double?): String {
    val s = (seconds ?: 0.0).toLong()
    return "%d:%02d".format(s / 60, s % 60)
}

fun formatMs(ms: Long): String = formatDuration(ms / 1000.0)

fun formatBytes(b: Long): String = when {
    b >= 1L shl 30 -> "%.1f GB".format(b / (1L shl 30).toDouble())
    b >= 1L shl 20 -> "%.0f MB".format(b / (1L shl 20).toDouble())
    else -> "%.0f KB".format(b / 1024.0)
}
