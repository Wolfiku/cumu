package com.cumu.app.data

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Recent search terms, newest first, kept on the phone only. */
class SearchHistory(context: Context) {
    private val prefs = context.getSharedPreferences("cumu_search", Context.MODE_PRIVATE)
    private val _items = MutableStateFlow(load())
    val items: StateFlow<List<String>> = _items.asStateFlow()

    private fun load(): List<String> =
        prefs.getString("history", null)?.split('\n')?.filter { it.isNotBlank() } ?: emptyList()

    fun add(query: String) {
        val q = query.trim()
        if (q.length < 2) return
        val updated = (listOf(q) + _items.value.filterNot { it.equals(q, ignoreCase = true) }).take(MAX)
        save(updated)
    }

    fun remove(query: String) = save(_items.value - query)
    fun clear() = save(emptyList())

    private fun save(list: List<String>) {
        _items.value = list
        prefs.edit { putString("history", list.joinToString("\n")) }
    }

    private companion object { const val MAX = 15 }
}
