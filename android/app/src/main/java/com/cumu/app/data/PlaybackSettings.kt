package com.cumu.app.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Playback options of the app (kept on the phone):
 * crossfade length, skipping silence ("void skipping"), loudness
 * normalization and autoplay of similar music after the queue.
 */
class PlaybackSettings(context: Context) {

    data class Values(
        /** 0 = off, 1..12 seconds. */
        val crossfadeSec: Int = 0,
        val voidSkip: Boolean = true,
        val normalize: Boolean = true,
        val autoplay: Boolean = true,
    )

    private val prefs = context.getSharedPreferences("cumu_playback", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(read())
    val state: StateFlow<Values> = _state.asStateFlow()

    private fun read() = Values(
        crossfadeSec = prefs.getInt("crossfade", 0).coerceIn(0, 12),
        voidSkip = prefs.getBoolean("void_skip", true),
        normalize = prefs.getBoolean("normalize", true),
        autoplay = prefs.getBoolean("autoplay", true),
    )

    fun update(change: (Values) -> Values) {
        val v = change(_state.value).let { it.copy(crossfadeSec = it.crossfadeSec.coerceIn(0, 12)) }
        prefs.edit()
            .putInt("crossfade", v.crossfadeSec)
            .putBoolean("void_skip", v.voidSkip)
            .putBoolean("normalize", v.normalize)
            .putBoolean("autoplay", v.autoplay)
            .apply()
        _state.value = v
    }
}
