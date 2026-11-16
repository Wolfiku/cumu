package com.cumu.app.data

import android.content.Context
import android.os.Build
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Playback state another device reports (same fields as the web app). */
@Serializable
data class LiveState(
    val song: Song? = null,
    val isPlaying: Boolean = false,
    /** Seconds. */
    val position: Double = 0.0,
    val duration: Double = 0.0,
    val volume: Double? = null,
    val shuffle: Boolean = false,
    val repeat: String? = null,
    val hasNext: Boolean = true,
    val hasPrev: Boolean = true,
    val queueLength: Int = 0,
)

@Serializable
data class LiveDevice(
    val id: String,
    val name: String = "",
    /** web | android | mobile-web */
    val kind: String = "web",
    val active: Boolean = false,
    val state: LiveState? = null,
    val stateAt: Long? = null,
)

@Serializable
data class PartyHost(val userId: String = "", val username: String = "", val deviceName: String = "")

@Serializable
data class PartyGuest(val userId: String = "", val username: String = "", val deviceName: String = "")

@Serializable
data class Party(
    val id: String,
    val host: PartyHost = PartyHost(),
    val guests: List<PartyGuest> = emptyList(),
    val state: LiveState? = null,
    val stateAt: Long? = null,
)

/** Party this device is in, and whether it hosts it. */
data class PartyMembership(val party: Party, val isHost: Boolean)

/** A message the player has to act on. */
sealed interface LiveEvent {
    data class Command(val command: String, val args: JsonObject, val fromName: String) : LiveEvent
    /** Guest: the host's playback; [ageMs] = how old the state is. */
    data class PartySync(val state: LiveState, val ageMs: Long) : LiveEvent
    data class PartySuggestion(val song: Song, val by: String) : LiveEvent
    data class DeviceState(val deviceId: String, val state: LiveState) : LiveEvent
}

/**
 * The WebSocket to the server for live playback: this phone is a device of
 * the account (other devices can see and control it, and it can control
 * them), and it can host or join listening parties. See src/services/live.js.
 */
class LiveClient(
    context: Context,
    private val api: ApiClient,
    private val scope: CoroutineScope,
    /** Something was shared with the user: refresh the inbox badge. */
    private val onShareReceived: suspend () -> Unit = {},
) {

    private val prefs = context.getSharedPreferences("cumu_live", Context.MODE_PRIVATE)

    /** Stable id of this installation. */
    val deviceId: String = prefs.getString("device_id", null) ?: ("android-" + UUID.randomUUID().toString().take(8)).also {
        prefs.edit().putString("device_id", it).apply()
    }
    val deviceName: String = listOfNotNull(Build.MANUFACTURER?.replaceFirstChar { it.uppercase() }, Build.MODEL)
        .distinct().joinToString(" ").let { name ->
            // "Google Pixel 8" -> keep; "samsung SM-S911B" -> "Samsung SM-S911B"
            if (name.isBlank()) "Android-Handy" else name
        }

    private val _devices = MutableStateFlow<List<LiveDevice>>(emptyList())
    val devices: StateFlow<List<LiveDevice>> = _devices.asStateFlow()
    private val _activeDeviceId = MutableStateFlow<String?>(null)
    val activeDeviceId: StateFlow<String?> = _activeDeviceId.asStateFlow()
    private val _party = MutableStateFlow<PartyMembership?>(null)
    val party: StateFlow<PartyMembership?> = _party.asStateFlow()
    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    private val _events = MutableSharedFlow<LiveEvent>(extraBufferCapacity = 32)
    val events: SharedFlow<LiveEvent> = _events.asSharedFlow()
    private val _notices = MutableSharedFlow<String>(extraBufferCapacity = 8)
    /** Short texts for a snackbar ("anna eingeladen", "Die Party ist vorbei"). */
    val notices: SharedFlow<String> = _notices.asSharedFlow()

    private var socket: WebSocket? = null
    private var job: Job? = null
    private var pendingJoin: String? = null
    private val wsHttp by lazy { api.baseHttp.newBuilder().pingInterval(25, TimeUnit.SECONDS).build() }

    /** Connects (and keeps reconnecting) while a session exists. */
    fun start() {
        if (job?.isActive == true) return
        job = scope.launch(Dispatchers.IO) {
            var backoff = 2_000L
            while (true) {
                val url = runCatching { api.url("/ws") }.getOrNull()
                val token = runCatching { api.freshAccessToken() }.getOrNull()
                if (url != null && token != null) {
                    val wsUrl = url.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") + "?token=" + java.net.URLEncoder.encode(token, "UTF-8")
                    val closed = kotlinx.coroutines.CompletableDeferred<Unit>()
                    socket = wsHttp.newWebSocket(Request.Builder().url(wsUrl).build(), object : WebSocketListener() {
                        override fun onMessage(webSocket: WebSocket, text: String) = handle(text)
                        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { closed.complete(Unit) }
                        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { closed.complete(Unit) }
                    })
                    closed.await()
                    _connected.value = false
                    _devices.value = emptyList()
                    _activeDeviceId.value = null
                    backoff = 2_000L
                }
                delay(backoff)
                backoff = (backoff * 2).coerceAtMost(30_000L)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
        socket?.close(1000, "bye")
        socket = null
        _connected.value = false
        _party.value = null
    }

    fun send(type: String, extra: JsonObject = JsonObject(emptyMap())) {
        val o = JsonObject(extra + ("type" to kotlinx.serialization.json.JsonPrimitive(type)))
        socket?.send(o.toString())
    }

    fun sendCommand(target: String, command: String, args: JsonObject = JsonObject(emptyMap())) {
        send("device_command", buildJsonObject { put("target", target); put("command", command); put("args", args) })
    }

    fun reportState(state: LiveState) {
        send("device_state", buildJsonObject { put("state", api.json.encodeToJsonElement(LiveState.serializer(), state)) })
    }

    // ── Parties ──────────────────────────────────────────────────────────────

    fun startParty() = send("party_create")

    fun joinParty(partyId: String) {
        if (!_connected.value) { pendingJoin = partyId; start(); return }
        send("party_join", buildJsonObject { put("partyId", partyId) })
    }

    fun leaveParty() = send("party_leave")

    fun inviteToParty(username: String) = send("party_invite", buildJsonObject { put("username", username.trim()) })

    fun suggestToParty(song: Song) =
        send("party_queue_add", buildJsonObject { put("song", api.json.encodeToJsonElement(Song.serializer(), song)) })

    // ── Incoming ─────────────────────────────────────────────────────────────

    private fun str(o: JsonObject, k: String) = (o[k] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull

    private fun handle(text: String) {
        val o = runCatching { api.json.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return
        val json = api.json
        when (str(o, "type")) {
            "connected" -> send("hello", buildJsonObject { put("deviceId", deviceId); put("name", deviceName); put("kind", "android") })
            "hello_ok" -> {
                _connected.value = true
                pendingJoin?.let { id -> pendingJoin = null; joinParty(id) }
            }
            "devices" -> {
                _devices.value = runCatching { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(LiveDevice.serializer()), o["devices"]!!) }.getOrDefault(emptyList())
                _activeDeviceId.value = str(o, "activeDeviceId")
            }
            "device_state" -> {
                val id = str(o, "deviceId") ?: return
                val st = o["state"]?.let { runCatching { json.decodeFromJsonElement(LiveState.serializer(), it) }.getOrNull() } ?: return
                _devices.value = _devices.value.map { if (it.id == id) it.copy(state = st) else it }
                _events.tryEmit(LiveEvent.DeviceState(id, st))
            }
            "device_command" -> _events.tryEmit(
                LiveEvent.Command(str(o, "command") ?: return, (o["args"] as? JsonObject) ?: JsonObject(emptyMap()), str(o, "fromName") ?: ""),
            )
            "device_error", "party_error", "party_notice" -> str(o, "message")?.let { _notices.tryEmit(it) }
            "party_state" -> {
                val p = o["party"]?.let { runCatching { json.decodeFromJsonElement(Party.serializer(), it) }.getOrNull() } ?: return
                val first = _party.value == null
                val isHost = str(o, "role") == "host"
                _party.value = PartyMembership(p, isHost)
                if (first) _notices.tryEmit(if (isHost) "Party gestartet" else "Du bist in der Party von ${p.host.username}")
            }
            "party_sync" -> {
                val st = o["state"]?.let { runCatching { json.decodeFromJsonElement(LiveState.serializer(), it) }.getOrNull() } ?: return
                val at = str(o, "at")?.toLongOrNull() ?: 0L
                val now = str(o, "serverNow")?.toLongOrNull() ?: at
                _events.tryEmit(LiveEvent.PartySync(st, (now - at).coerceAtLeast(0)))
            }
            "party_queue_add" -> {
                val song = o["song"]?.let { runCatching { json.decodeFromJsonElement(Song.serializer(), it) }.getOrNull() } ?: return
                _events.tryEmit(LiveEvent.PartySuggestion(song, str(o, "by") ?: ""))
            }
            "party_ended" -> { _party.value = null; _notices.tryEmit(str(o, "reason") ?: "Die Party ist vorbei") }
            "party_left" -> { _party.value = null; _notices.tryEmit("Party verlassen") }
            "share_received" -> scope.launch { runCatching { onShareReceived() } }
            // A playlist someone sent is in the library now (no inbox entry)
            "playlist_received" -> {
                val sh = o["share"] as? JsonObject
                val from = sh?.let { str(it, "from_username") } ?: "Jemand"
                val title = sh?.let { str(it, "title") } ?: ""
                _notices.tryEmit("$from hat dir die Playlist „$title“ geschickt – sie ist jetzt in deiner Bibliothek")
            }
        }
    }

    /** Link for inviting people (opens in the web app, or in the app's inbox). */
    fun partyLink(partyId: String): String = runCatching { api.url("/#/party/$partyId") }.getOrDefault("")
}
