package com.cumu.app.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String, val errorCode: String? = null) : IOException(message)

/** The server is not reachable and nothing is saved for this request. */
class OfflineException : IOException("Offline")

sealed interface LoginResult {
    data object Success : LoginResult
    data class AdminCodeRequired(val invalid: Boolean) : LoginResult
    data class Error(val message: String) : LoginResult
}

/**
 * Talks to the cumu server. Logs in through the same OAuth flow as the web
 * app (client "cumu-web"), so it works with every server from v0.4.3 on
 * without server changes. Access tokens live one hour and are refreshed
 * automatically; when the refresh token is rejected the session ends.
 */
class ApiClient(private val context: Context, private val sessions: SessionStore) {

    private val cacheDir = File(context.filesDir, "api-cache").apply { mkdirs() }

    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
        explicitNulls = false
    }

    private val jsonType = "application/json".toMediaType()

    /** Plain client without auth, for login and token refresh. */
    val baseHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    /** Client that adds the bearer token and retries once after a refresh. */
    val http: OkHttpClient = baseHttp.newBuilder()
        .addInterceptor(AuthInterceptor())
        .build()

    // ── Login ────────────────────────────────────────────────────────────────

    suspend fun login(serverInput: String, username: String, password: String, adminCode: String?): LoginResult =
        withContext(Dispatchers.IO) {
            val server = normalizeServer(serverInput)
                ?: return@withContext LoginResult.Error("Bitte eine gültige Server-Adresse eingeben.")
            try {
                val authBody = buildJsonObject {
                    put("client_id", CLIENT_ID)
                    put("redirect_uri", server)
                    put("scope", "read write")
                    put("response_type", "code")
                    put("username", username.trim())
                    put("password", password)
                    if (!adminCode.isNullOrBlank()) put("admin_code", adminCode.trim())
                    else sessions.adminTrust(server, username.trim())?.let { put("admin_trust", it) }
                }
                val auth = baseHttp.newCall(postJson("$server/oauth/authorize", authBody)).execute().use { res ->
                    val body = res.body?.string().orEmpty()
                    if (!res.isSuccessful) {
                        val err = parseError(body)
                        return@withContext when (err.first) {
                            "admin_code_required" -> LoginResult.AdminCodeRequired(invalid = false)
                            "admin_code_invalid" -> LoginResult.AdminCodeRequired(invalid = true)
                            "access_denied" -> LoginResult.Error("Benutzername oder Passwort ist falsch.")
                            else -> LoginResult.Error(err.second ?: "Anmeldung fehlgeschlagen (HTTP ${res.code}).")
                        }
                    }
                    if (!body.trimStart().startsWith("{")) {
                        return@withContext LoginResult.Error("Unter dieser Adresse läuft kein cumu-Server.")
                    }
                    json.decodeFromString(AuthorizeResponse.serializer(), body)
                }
                auth.adminTrust?.let { sessions.setAdminTrust(server, username.trim(), it) }

                val tokenBody = buildJsonObject {
                    put("grant_type", "authorization_code")
                    put("code", auth.code)
                    put("redirect_uri", server)
                    put("client_id", CLIENT_ID)
                    put("client_secret", CLIENT_SECRET)
                }
                val token = baseHttp.newCall(postJson("$server/oauth/token", tokenBody)).execute().use { res ->
                    val body = res.body?.string().orEmpty()
                    if (!res.isSuccessful) {
                        return@withContext LoginResult.Error(parseError(body).second ?: "Token konnte nicht abgerufen werden.")
                    }
                    json.decodeFromString(TokenResponse.serializer(), body)
                }
                var session = Session(
                    serverUrl = server,
                    username = username.trim(),
                    accessToken = token.accessToken,
                    refreshToken = token.refreshToken,
                    accessExpiresAt = nowSec() + token.expiresIn,
                )
                // Role (for the profile screen); not critical if it fails
                runCatching {
                    val req = Request.Builder().url("$server/user/me")
                        .header("Authorization", "Bearer ${token.accessToken}").build()
                    baseHttp.newCall(req).execute().use { res ->
                        if (res.isSuccessful) {
                            val me = json.decodeFromString(Me.serializer(), res.body!!.string())
                            session = session.copy(role = me.role)
                        }
                    }
                }
                sessions.save(session)
                LoginResult.Success
            } catch (e: IOException) {
                LoginResult.Error("Server nicht erreichbar: ${e.message ?: e.javaClass.simpleName}")
            } catch (e: Exception) {
                LoginResult.Error("Unerwartete Antwort vom Server.")
            }
        }

    suspend fun logout() = withContext(Dispatchers.IO) {
        val s = sessions.current
        clearCache()
        sessions.clear()
        _offline.value = false
        if (s != null) runCatching {
            val body = buildJsonObject {
                put("token", s.refreshToken)
                put("client_id", CLIENT_ID)
                put("client_secret", CLIENT_SECRET)
            }
            baseHttp.newCall(postJson("${s.serverUrl}/oauth/revoke", body)).execute().close()
        }
    }

    // ── Tokens ───────────────────────────────────────────────────────────────

    private val refreshLock = Any()

    /**
     * Returns a usable access token, refreshing it first if it expires within
     * a minute. Blocking; call from a background thread. Null when logged out.
     */
    fun freshAccessToken(): String? {
        val s = sessions.current ?: return null
        if (s.accessExpiresAt - nowSec() > 60) return s.accessToken
        return refresh(s.accessToken)
    }

    /** Refreshes unless another thread already did since [staleToken] was used. */
    private fun refresh(staleToken: String): String? = synchronized(refreshLock) {
        val s = sessions.current ?: return null
        if (s.accessToken != staleToken && s.accessExpiresAt - nowSec() > 60) return s.accessToken
        val body = buildJsonObject {
            put("grant_type", "refresh_token")
            put("refresh_token", s.refreshToken)
            put("client_id", CLIENT_ID)
            put("client_secret", CLIENT_SECRET)
        }
        baseHttp.newCall(postJson("${s.serverUrl}/oauth/token", body)).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (res.code == 400 || res.code == 401) {
                // Refresh token expired, revoked, or admin code changed: log out
                sessions.clear()
                return null
            }
            if (!res.isSuccessful) throw ApiException(res.code, "Token-Erneuerung fehlgeschlagen")
            val t = json.decodeFromString(TokenResponse.serializer(), text)
            sessions.save(s.copy(accessToken = t.accessToken, refreshToken = t.refreshToken, accessExpiresAt = nowSec() + t.expiresIn))
            t.accessToken
        }
    }

    private inner class AuthInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val token = freshAccessToken() ?: throw ApiException(401, "Nicht angemeldet")
            val first = chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $token").build())
            if (first.code != 401) return first
            first.close()
            val renewed = refresh(token) ?: throw ApiException(401, "Sitzung abgelaufen, bitte neu anmelden")
            return chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $renewed").build())
        }
    }

    // ── Requests ─────────────────────────────────────────────────────────────

    fun url(path: String): String {
        val s = sessions.current ?: throw ApiException(401, "Nicht angemeldet")
        return s.serverUrl + path
    }

    fun streamUrl(songId: String) = url("/stream/$songId")

    /** Covers are public on the server; may also be absolute URLs from the metadata lookup. */
    fun coverUrl(cover: String?): String? {
        if (cover.isNullOrBlank()) return null
        if (cover.startsWith("http://") || cover.startsWith("https://")) return cover
        val server = sessions.current?.serverUrl ?: return null
        return "$server/stream/cover/${java.net.URLEncoder.encode(cover, "UTF-8").replace("+", "%20")}"
    }

    // ── Offline cache ────────────────────────────────────────────────────────
    //
    // Every successful GET is saved on the phone. Without a connection the
    // saved answer is returned instead, so the whole app keeps working
    // offline with the state of the last visit (playback: downloaded songs).

    private val _offline = MutableStateFlow(false)
    /** True while the server cannot be reached and cached data is shown. */
    val offline: StateFlow<Boolean> = _offline.asStateFlow()
    @Volatile private var lastFailure = 0L

    private fun cacheFile(path: String): File? {
        val s = sessions.current ?: return null
        val key = MessageDigest.getInstance("SHA-1")
            .digest("${s.serverUrl}|${s.username.lowercase()}|$path".toByteArray())
            .joinToString("") { "%02x".format(it) }
        return File(cacheDir, "$key.json")
    }

    fun clearCache() { cacheDir.listFiles()?.forEach { it.delete() } }

    /** No network at all on the phone (flight mode, no Wi-Fi or mobile data). */
    private fun noNetwork(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return true
        return !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** The server is reachable again (after an action that needed it). */
    fun markOnline() { _offline.value = false }

    /** Next request tries the server again instead of answering from the cache. */
    fun retrySoon() { lastFailure = 0 }

    init {
        // When the phone gets a network again, try the server on the next request
        runCatching {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: android.net.Network) = retrySoon()
            })
        }
    }

    suspend fun getText(path: String): String = withContext(Dispatchers.IO) {
        val cached = cacheFile(path)?.takeIf { it.exists() }
        // Known to be offline: answer from the cache right away instead of
        // waiting for a connection timeout on every screen
        val recentlyFailed = _offline.value && System.currentTimeMillis() - lastFailure < 20_000
        if (noNetwork() || recentlyFailed) {
            _offline.value = true
            return@withContext cached?.readText() ?: throw OfflineException()
        }
        try {
            val text = execute(Request.Builder().url(url(path)).get().build())
            _offline.value = false
            cacheFile(path)?.let { f -> runCatching { File(f.path + ".tmp").apply { writeText(text) }.renameTo(f) } }
            text
        } catch (e: ApiException) {
            throw e // the server answered with an error: not an offline case
        } catch (e: IOException) {
            _offline.value = true
            lastFailure = System.currentTimeMillis()
            cached?.readText() ?: throw OfflineException()
        }
    }

    /** Write actions need the server; mark offline on connection errors. */
    private inline fun <T> online(block: () -> T): T = try {
        block().also { _offline.value = false }
    } catch (e: ApiException) {
        throw e
    } catch (e: IOException) {
        _offline.value = true
        lastFailure = System.currentTimeMillis()
        throw OfflineException()
    }

    suspend inline fun <reified T> get(path: String): T = json.decodeFromString(getText(path))

    /** The answer saved from the last visit, without asking the server. */
    suspend fun cachedText(path: String): String? = withContext(Dispatchers.IO) {
        cacheFile(path)?.takeIf { it.exists() }?.let { runCatching { it.readText() }.getOrNull() }
    }

    /** Age of the saved answer in ms, or null when nothing is saved. */
    fun cacheAge(path: String): Long? =
        cacheFile(path)?.takeIf { it.exists() }?.let { System.currentTimeMillis() - it.lastModified() }

    suspend inline fun <reified T> cached(path: String): T? =
        cachedText(path)?.let { runCatching { json.decodeFromString<T>(it) }.getOrNull() }

    suspend fun put(path: String, body: JsonObject = JsonObject(emptyMap())): String = withContext(Dispatchers.IO) {
        online { execute(Request.Builder().url(url(path)).put(body.toString().toRequestBody(jsonType)).build()) }
    }

    suspend fun post(path: String, body: JsonObject = JsonObject(emptyMap())): String = withContext(Dispatchers.IO) {
        online { execute(postJson(url(path), body)) }
    }

    suspend fun delete(path: String): String = withContext(Dispatchers.IO) {
        online { execute(Request.Builder().url(url(path)).delete().build()) }
    }

    private fun execute(req: Request): String = http.newCall(req).execute().use { res ->
        val text = res.body?.string().orEmpty()
        if (!res.isSuccessful) {
            val (code, msg) = parseError(text)
            throw ApiException(res.code, msg ?: "Serverfehler (HTTP ${res.code})", code)
        }
        text
    }

    private fun postJson(url: String, body: JsonObject) =
        Request.Builder().url(url).post(body.toString().toRequestBody(jsonType)).build()

    /** (error code, readable message) from a cumu error body. */
    private fun parseError(text: String): Pair<String?, String?> = runCatching {
        val o = json.parseToJsonElement(text) as JsonObject
        val error = o["error"]?.jsonPrimitive?.contentOrNull
        val code = o["code"]?.jsonPrimitive?.contentOrNull
        val desc = o["error_description"]?.jsonPrimitive?.contentOrNull
        // OAuth style: error = code, error_description = text. Plain style: error = text, code = code.
        if (desc != null) (error to desc) else ((code ?: error) to error)
    }.getOrDefault(null to null)

    companion object {
        // Built-in client the server creates on first start (src/db.js)
        const val CLIENT_ID = "cumu-web"
        const val CLIENT_SECRET = "cumu-web-secret-internal"

        fun nowSec() = System.currentTimeMillis() / 1000

        /** "192.168.1.5:3000" → "http://192.168.1.5:3000", without trailing slash. */
        fun normalizeServer(input: String): String? {
            var s = input.trim().trimEnd('/')
            if (s.isEmpty()) return null
            if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
            return if (s.toHttpUrlOrNull() == null) null else s
        }
    }
}
