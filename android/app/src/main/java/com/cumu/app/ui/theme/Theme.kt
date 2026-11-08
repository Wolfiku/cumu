package com.cumu.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Colours of the cumu web app ("Standard" theme, public/css/theme-standard.css)
object CumuColors {
    val Blue = Color(0xFF0969DA)
    val BlueDark = Color(0xFF2F81F7)   // brighter blue for dark backgrounds
    val Green = Color(0xFF1A7F37)
    val GreenDark = Color(0xFF3FB950)
    val Purple = Color(0xFF8250DF)
    val Red = Color(0xFFCF222E)
    val Amber = Color(0xFF9A6700)

    val Ink = Color(0xFF1F2328)
    val InkMuted = Color(0xFF636C76)
    val Canvas = Color(0xFFFFFFFF)
    val Surface1 = Color(0xFFF6F8FA)
    val Surface2 = Color(0xFFEAEEF2)
    val Border = Color(0xFFD0D7DE)

    val InkDark = Color(0xFFE6EDF3)
    val InkMutedDark = Color(0xFF8B949E)
    val CanvasDark = Color(0xFF0D1117)
    val Surface1Dark = Color(0xFF161B22)
    val Surface2Dark = Color(0xFF21262D)
    val BorderDark = Color(0xFF30363D)
}

private val Light = lightColorScheme(
    // Black on white: every accent is the ink colour, highlights are light grey
    primary = CumuColors.Ink,
    onPrimary = Color.White,
    primaryContainer = CumuColors.Surface2,
    onPrimaryContainer = CumuColors.Ink,
    secondary = CumuColors.Ink,
    onSecondary = Color.White,
    secondaryContainer = CumuColors.Surface2,
    onSecondaryContainer = CumuColors.Ink,
    tertiary = CumuColors.InkMuted,
    tertiaryContainer = CumuColors.Surface2,
    error = CumuColors.Red,
    background = CumuColors.Canvas,
    onBackground = CumuColors.Ink,
    surface = CumuColors.Canvas,
    onSurface = CumuColors.Ink,
    onSurfaceVariant = CumuColors.InkMuted,
    surfaceVariant = CumuColors.Surface2,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = CumuColors.Surface1,
    surfaceContainer = CumuColors.Surface1,
    surfaceContainerHigh = CumuColors.Surface2,
    surfaceContainerHighest = Color(0xFFDDE3E9),
    outline = CumuColors.Border,
    outlineVariant = Color(0xFFE4E8EC),
)


/** Gradient pairs for mix cards and placeholders, in cumu's accent colours. */
@Immutable
data class Accents(val gradients: List<Pair<Color, Color>>)

val LocalAccents = staticCompositionLocalOf {
    Accents(
        listOf(
            // Shades of black and grey, so cards stay in the black-and-white look
            Color(0xFF111111) to Color(0xFF4A4F56),
            Color(0xFF24292F) to Color(0xFF6E7781),
            Color(0xFF32383F) to Color(0xFF8C959F),
            Color(0xFF0D1117) to Color(0xFF57606A),
            Color(0xFF1F2328) to Color(0xFF3D444D),
            Color(0xFF2D333B) to Color(0xFF768390),
        ),
    )
}

private val base = Typography()
private val CumuType = base.copy(
    displaySmall = base.displaySmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
    headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
    headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.25).sp),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.25).sp),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.SemiBold),
)

/** cumu in black and white. */
@Composable
fun CumuTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        // Always black on white, also when the phone is in dark mode
        colorScheme = Light,
        typography = CumuType,
        content = content,
    )
}

