package com.cumu.app.data

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Login state. Only OAuth tokens are kept, never the password: the refresh
 * token is valid for 30 days and renewed on every refresh. The admin trust
 * token lets admins skip the admin code for 30 days, like in the web app.
 * Stored in the app's private preferences (not readable by other apps, and
 * excluded from backups via allowBackup=false).
 */
data class Session(
    val serverUrl: String,
    val username: String,
    val accessToken: String,
    val refreshToken: String,
    val accessExpiresAt: Long,
    val role: String = "user",
)

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("cumu_session", Context.MODE_PRIVATE)

    private val _session = MutableStateFlow(load())
    val session: StateFlow<Session?> = _session.asStateFlow()

    val current: Session? get() = _session.value

    /** Last server and user, prefilled on the login screen after logout. */
    val lastServer: String get() = prefs.getString("last_server", "") ?: ""
    val lastUsername: String get() = prefs.getString("last_user", "") ?: ""

    private fun load(): Session? {
        val url = prefs.getString("server", null) ?: return null
        val access = prefs.getString("access", null) ?: return null
        val refresh = prefs.getString("refresh", null) ?: return null
        return Session(
            serverUrl = url,
            username = prefs.getString("user", "") ?: "",
            accessToken = access,
            refreshToken = refresh,
            accessExpiresAt = prefs.getLong("access_exp", 0),
            role = prefs.getString("role", "user") ?: "user",
        )
    }

    @Synchronized
    fun save(s: Session) {
        prefs.edit {
            putString("server", s.serverUrl)
            putString("user", s.username)
            putString("access", s.accessToken)
            putString("refresh", s.refreshToken)
            putLong("access_exp", s.accessExpiresAt)
            putString("role", s.role)
            putString("last_server", s.serverUrl)
            putString("last_user", s.username)
        }
        _session.value = s
    }

    @Synchronized
    fun clear() {
        prefs.edit {
            remove("server"); remove("user"); remove("access"); remove("refresh"); remove("access_exp"); remove("role")
        }
        _session.value = null
    }

    fun adminTrust(server: String, user: String): String? =
        prefs.getString(trustKey(server, user), null)

    fun setAdminTrust(server: String, user: String, token: String) =
        prefs.edit { putString(trustKey(server, user), token) }

    private fun trustKey(server: String, user: String) = "trust|$server|${user.lowercase()}"
}
