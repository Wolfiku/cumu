package com.cumu.app.ui

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LibraryMusic
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.cumu.app.CumuApplication
import com.cumu.app.ui.components.MiniPlayer
import com.cumu.app.ui.screens.AlbumScreen
import com.cumu.app.ui.screens.AllSongsScreen
import com.cumu.app.ui.screens.ArtistScreen
import com.cumu.app.ui.screens.DownloadsScreen
import com.cumu.app.ui.screens.HomeScreen
import com.cumu.app.ui.screens.LibraryScreen
import com.cumu.app.ui.screens.LoginScreen
import com.cumu.app.ui.screens.PlayerScreen
import com.cumu.app.ui.screens.PlaylistScreen
import com.cumu.app.ui.screens.SearchScreen
import com.cumu.app.ui.screens.SettingsScreen
import kotlinx.coroutines.launch

/** Navigation actions available to every screen. */
class Nav(private val c: NavHostController) {
    /** Last main tab (home, search, library), kept up to date by the scaffold. */
    var lastTab: String = "home"

    /** Straight back to the last main tab, skipping player and detail pages. */
    fun backToMain() {
        if (!c.popBackStack(lastTab, inclusive = false)) {
            c.navigate(lastTab) {
                popUpTo(c.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    fun album(id: String) = c.navigate("album/$id")
    fun artist(id: String) = c.navigate("artist/$id")
    fun playlist(id: String) = c.navigate("playlist/$id")
    fun player() = c.navigate("player") { launchSingleTop = true }
    fun settings() = c.navigate("settings") { launchSingleTop = true }
    fun downloads() = c.navigate("downloads") { launchSingleTop = true }
    fun songs() = c.navigate("songs") { launchSingleTop = true }
    fun favorites() = c.navigate("favorites") { launchSingleTop = true }
    fun audiobooks() = c.navigate("audiobooks") { launchSingleTop = true }
    fun social() = c.navigate("social") { launchSingleTop = true }
    fun privacy() = c.navigate("privacy") { launchSingleTop = true }
    fun audiobook(id: String) = c.navigate("audiobook/${android.net.Uri.encode(id)}")
    fun search() = c.navigate("search") {
        popUpTo(c.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
    fun back() = c.popBackStack()
}

val LocalNav = staticCompositionLocalOf<Nav> { error("no nav") }
val LocalSnackbar = staticCompositionLocalOf<(String) -> Unit> { {} }

private data class Tab(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector)

private val tabs = listOf(
    Tab("home", "Start", Icons.Outlined.Home, Icons.Rounded.Home),
    Tab("search", "Suche", Icons.Outlined.Search, Icons.Rounded.Search),
    Tab("library", "Bibliothek", Icons.Outlined.LibraryMusic, Icons.Rounded.LibraryMusic),
)
private val tabRoutes = tabs.map { it.route }.toSet()

// ── Transitions ──────────────────────────────────────────────────────────────

private const val DURATION = 320

private fun AnimatedContentTransitionScope<NavBackStackEntry>.isTabSwitch() =
    initialState.destination.route in tabRoutes && targetState.destination.route in tabRoutes

private fun AnimatedContentTransitionScope<NavBackStackEntry>.enter(): EnterTransition = when {
    targetState.destination.route == "player" -> slideInVertically(tween(DURATION)) { it } + fadeIn(tween(DURATION))
    isTabSwitch() -> fadeIn(tween(220)) + scaleIn(tween(220), initialScale = 0.98f)
    else -> slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Start, tween(DURATION), initialOffset = { it / 4 }) + fadeIn(tween(DURATION))
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.exit(): ExitTransition = when {
    targetState.destination.route == "player" -> fadeOut(tween(DURATION)) + scaleOut(tween(DURATION), targetScale = 0.96f)
    isTabSwitch() -> fadeOut(tween(150))
    else -> slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Start, tween(DURATION), targetOffset = { it / 8 }) + fadeOut(tween(DURATION))
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.popEnter(): EnterTransition = when {
    initialState.destination.route == "player" -> fadeIn(tween(DURATION)) + scaleIn(tween(DURATION), initialScale = 0.96f)
    else -> slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.End, tween(DURATION), initialOffset = { it / 8 }) + fadeIn(tween(DURATION))
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.popExit(): ExitTransition = when {
    initialState.destination.route == "player" -> slideOutVertically(tween(DURATION)) { it } + fadeOut(tween(DURATION))
    else -> slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.End, tween(DURATION), targetOffset = { it / 4 }) + fadeOut(tween(DURATION))
}

@Composable
fun CumuAppUi() {
    val app = CumuApplication.instance
    val session by app.sessions.session.collectAsState()
    if (session == null) {
        LoginScreen()
        return
    }

    val controller = rememberNavController()
    val nav = remember(controller) { Nav(controller) }
    val snackbarHost = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val showSnackbar: (String) -> Unit = { msg -> scope.launch { snackbarHost.showSnackbar(msg) } }

    val backStack by controller.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val onPlayer = route == "player"
    // Detail pages keep the tab they were opened from highlighted
    val lastTab = remember { mutableStateOf("home") }
    if (route != null && route in tabRoutes) lastTab.value = route
    nav.lastTab = lastTab.value
    val player by app.player.state.collectAsState()

    val downloadError by app.downloads.errors.collectAsState()
    LaunchedEffect(downloadError) {
        downloadError?.let { snackbarHost.showSnackbar(it); app.downloads.clearError() }
    }
    LaunchedEffect(Unit) { app.player.messages.collect { snackbarHost.showSnackbar(it) } }
    // Save the whole library for offline use (search, lists)
    LaunchedEffect(session?.serverUrl, session?.username) { app.appScope.launch { app.repo.prefetch() } }
    // Every start of the app: is the server there? (leaves or enters the offline mode)
    LaunchedEffect(Unit) { app.appScope.launch { app.api.ping() } }
    // "Mit dir geteilt" badge: check now and then while the app is open
    LaunchedEffect(session?.serverUrl, session?.username) {
        while (true) {
            if (!app.api.offline.value) app.repo.refreshInboxUnread()
            kotlinx.coroutines.delay(90_000)
        }
    }
    val offline by app.api.offline.collectAsState()

    CompositionLocalProvider(LocalNav provides nav, LocalSnackbar provides showSnackbar) {
        Scaffold(
            // Screens draw their own top bars (with status bar inset); the
            // navigation bar handles the bottom inset
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            snackbarHost = { SnackbarHost(snackbarHost) },
            bottomBar = {
                AnimatedVisibility(
                    !onPlayer,
                    enter = slideInVertically(tween(DURATION)) { it } + fadeIn(),
                    exit = slideOutVertically(tween(DURATION)) { it } + fadeOut(),
                ) {
                    Column {
                        AnimatedVisibility(offline, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                            OfflineBar()
                        }
                        AnimatedVisibility(
                            player.current != null,
                            enter = expandVertically() + fadeIn(),
                            exit = shrinkVertically() + fadeOut(),
                        ) { MiniPlayer(onOpen = nav::player) }
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                            tabs.forEach { tab ->
                                val selected = lastTab.value == tab.route
                                NavigationBarItem(
                                    selected = selected,
                                    onClick = {
                                        controller.navigate(tab.route) {
                                            popUpTo(controller.graph.findStartDestination().id) { saveState = true }
                                            launchSingleTop = true
                                            restoreState = true
                                        }
                                    },
                                    icon = { Icon(if (selected) tab.selectedIcon else tab.icon, null) },
                                    label = { Text(tab.label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                        selectedIconColor = MaterialTheme.colorScheme.primary,
                                        selectedTextColor = MaterialTheme.colorScheme.primary,
                                    ),
                                )
                            }
                        }
                    }
                }
            },
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(if (onPlayer) PaddingValues() else padding)) {
                NavHost(
                    controller, startDestination = "home",
                    enterTransition = { enter() },
                    exitTransition = { exit() },
                    popEnterTransition = { popEnter() },
                    popExitTransition = { popExit() },
                ) {
                    composable("home") { HomeScreen() }
                    composable("search") { SearchScreen() }
                    composable("library") { LibraryScreen() }
                    composable("downloads") { DownloadsScreen() }
                    composable("songs") { AllSongsScreen() }
                    composable("favorites") { com.cumu.app.ui.screens.FavoritesScreen() }
                    composable("settings") { SettingsScreen() }
                    composable("player") { PlayerScreen() }
                    composable("album/{id}") { AlbumScreen(it.arguments?.getString("id")!!) }
                    composable("artist/{id}") { ArtistScreen(it.arguments?.getString("id")!!) }
                    composable("playlist/{id}") { PlaylistScreen(it.arguments?.getString("id")!!) }
                    composable("audiobooks") { com.cumu.app.ui.screens.AudiobooksScreen() }
                    composable("social") { com.cumu.app.ui.screens.SocialScreen() }
                    composable("privacy") { com.cumu.app.ui.screens.PrivacyScreen() }
                    composable("audiobook/{id}") { com.cumu.app.ui.screens.AudiobookScreen(it.arguments?.getString("id")!!) }
                }
            }
        }
    }
}

/** Shown while the server is not reachable: the app keeps working with saved data. */
@Composable
private fun OfflineBar() {
    val app = CumuApplication.instance
    val reason by app.api.offlineReason.collectAsState()
    val scope = rememberCoroutineScope()
    androidx.compose.foundation.layout.Row(
        Modifier
            .fillMaxWidth()
            .background(androidx.compose.ui.graphics.Color(0xFFC62828))
            // Tap: ask the server again right now
            .clickable { app.api.retrySoon(); scope.launch { app.api.ping() } }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.CloudOff, null, Modifier.size(18.dp), tint = androidx.compose.ui.graphics.Color.White)
        androidx.compose.foundation.layout.Spacer(Modifier.width(10.dp))
        Text(
            "${reason ?: "Server nicht erreichbar"} · Offline-Modus, Downloads spielbar",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
            color = androidx.compose.ui.graphics.Color.White,
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        )
    }
}
