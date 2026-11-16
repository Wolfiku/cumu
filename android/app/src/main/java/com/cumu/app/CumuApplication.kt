package com.cumu.app

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.cumu.app.data.ApiClient
import com.cumu.app.data.DownloadStore
import com.cumu.app.data.Repository
import com.cumu.app.data.SessionStore
import com.cumu.app.playback.PlayerConnection
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers

/** Holds the app-wide singletons (no DI framework needed at this size). */
class CumuApplication : Application(), SingletonImageLoader.Factory {

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    lateinit var sessions: SessionStore; private set
    lateinit var api: ApiClient; private set
    lateinit var repo: Repository; private set
    lateinit var downloads: DownloadStore; private set
    lateinit var player: PlayerConnection; private set
    lateinit var searchHistory: com.cumu.app.data.SearchHistory; private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        sessions = SessionStore(this)
        api = ApiClient(this, sessions)
        repo = Repository(api) { downloads.songs.value.values.map { it.song } }
        downloads = DownloadStore(this, api, appScope)
        player = PlayerConnection(this)
        searchHistory = com.cumu.app.data.SearchHistory(this)
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { api.baseHttp })) }
            .crossfade(true)
            .build()

    companion object {
        lateinit var instance: CumuApplication
            private set
    }
}
