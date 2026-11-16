package com.cumu.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Shapes of the cumu server's JSON (src/routes/api.js). Unknown fields are
// ignored, and almost everything is nullable because SQLite rows can be sparse.

@Serializable
data class Song(
    val id: String,
    val title: String = "",
    @SerialName("artist_id") val artistId: String? = null,
    @SerialName("album_id") val albumId: String? = null,
    @SerialName("artist_name") val artistName: String? = null,
    @SerialName("album_title") val albumTitle: String? = null,
    val cover: String? = null,
    val filename: String? = null,
    val duration: Double? = null,
    @SerialName("track_number") val trackNumber: Int? = null,
    val genre: String? = null,
    val year: Int? = null,
    @SerialName("file_size") val fileSize: Long? = null,
    @SerialName("play_count") val playCount: Int? = null,
    /** 1 for audiobook chapters (the server marks every speech track). */
    @SerialName("is_audiobook") val audiobookFlag: Int? = null,
    /** Book of an audiobook chapter, set by the app when it starts a book. */
    @SerialName("book_id") val bookId: String? = null,
    @SerialName("book_title") val bookTitle: String? = null,
    // Server audio analysis (v0.7.0): silence at start / end, loudness correction
    @SerialName("intro_silence_ms") val introSilenceMs: Long? = null,
    @SerialName("outro_silence_ms") val outroSilenceMs: Long? = null,
    @SerialName("loudness_gain_db") val loudnessGainDb: Double? = null,
    /** 1 for songs autoplay added after the queue. */
    val autoplay: Int? = null,
    /** Playlists several people edit: who added the song. */
    @SerialName("added_by_username") val addedByUsername: String? = null,
) {
    /** Audiobook chapters never play between music, only when started explicitly. */
    val isAudiobook: Boolean get() = audiobookFlag == 1 || genre?.trim()?.lowercase()?.let { it in SPEECH_GENRES } == true
    /** The book this chapter belongs to: its album, or the chapter alone. */
    val audiobookId: String get() = bookId ?: albumId ?: "s-$id"
}

/** Genres that make a track an audiobook chapter (same list as the server). */
val SPEECH_GENRES = setOf(
    "speech", "spoken word", "spoken", "spokenword",
    "audiobook", "audiobooks", "audio book", "audio books",
    "hörbuch", "hörbücher", "hoerbuch", "hoerbuecher",
)

@Serializable
data class AudiobookProgress(
    val songId: String = "",
    val chapterIndex: Int = 0,
    /** Seconds into the chapter. */
    val position: Double = 0.0,
    val finished: Boolean = false,
    val updatedAt: Long? = null,
    val percent: Int = 0,
    /** Seconds left in the whole book. */
    val remaining: Double = 0.0,
)

/** An audiobook: an album of chapters (or a single chapter without album). */
@Serializable
data class Audiobook(
    val id: String,
    val title: String = "",
    @SerialName("artist_id") val artistId: String? = null,
    @SerialName("artist_name") val artistName: String? = null,
    val cover: String? = null,
    val year: Int? = null,
    @SerialName("created_at") val createdAt: Long? = null,
    @SerialName("chapter_count") val chapterCount: Int = 0,
    /** Seconds, all chapters together. */
    val duration: Double = 0.0,
    val progress: AudiobookProgress? = null,
    /** Only on the book's own page. */
    val chapters: List<Song> = emptyList(),
) {
    val started: Boolean get() = progress != null && !progress.finished
}

@Serializable
data class RadioResult(val songs: List<Song> = emptyList())

@Serializable
data class AudiobookList(
    val books: List<Audiobook> = emptyList(),
    @SerialName("continue") val continueListening: List<Audiobook> = emptyList(),
)

@Serializable
data class HomeAudiobooks(
    @SerialName("continue") val continueListening: List<Audiobook> = emptyList(),
    val recent: List<Audiobook> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class Album(
    val id: String,
    val title: String = "",
    @SerialName("artist_id") val artistId: String? = null,
    @SerialName("artist_name") val artistName: String? = null,
    val cover: String? = null,
    val year: Int? = null,
    val genre: String? = null,
    @SerialName("song_count") val songCount: Int? = null,
    /** Last time the user heard a song of it (library overview only). */
    @SerialName("last_played") val lastPlayed: Long? = null,
    val songs: List<Song> = emptyList(),
)

@Serializable
data class Artist(
    val id: String,
    val name: String = "",
    val image: String? = null,
    @SerialName("song_count") val songCount: Int? = null,
    @SerialName("album_count") val albumCount: Int? = null,
    /** Last time the user heard a song of it (library overview only). */
    @SerialName("last_played") val lastPlayed: Long? = null,
    val albums: List<Album> = emptyList(),
    val songs: List<Song> = emptyList(),
    val audiobooks: List<Audiobook> = emptyList(),
)

@Serializable
data class Playlist(
    val id: String,
    val name: String = "",
    val description: String? = null,
    val cover: String? = null,
    @SerialName("is_generated") val isGenerated: Int = 0,
    val songs: List<Song> = emptyList(),
    // Summaries (library overview, home) carry only these instead of the songs
    @SerialName("song_count") val songCount: Int? = null,
    @SerialName("song_ids") val songIds: List<String>? = null,
    // Sharing (servers from v0.7.0; older servers: every playlist is the user's own)
    /** "private" | "public" | "shared" */
    val visibility: String? = null,
    @SerialName("owner_username") val ownerUsername: String? = null,
    /** "owner" | "editor" | "listener" | "public" */
    val access: String? = null,
    @SerialName("is_owner") val isOwnerFlag: Int? = null,
    @SerialName("can_edit") val canEditFlag: Int? = null,
    val saved: Int? = null,
    @SerialName("member_count") val memberCount: Int? = null,
    @SerialName("save_count") val saveCount: Int? = null,
    val members: List<PlaylistMember> = emptyList(),
) {
    /** Playlists cumu generates itself cannot be edited. */
    val readOnly: Boolean get() = isGenerated == 1
    val isOwn: Boolean get() = isOwnerFlag != 0
    /** Own playlists, and shared ones the owner lets the user edit. */
    val canEdit: Boolean get() = canEditFlag?.let { it == 1 } ?: !readOnly
    val isSaved: Boolean get() = saved == 1
    /** Invited by the owner (listener or editor). */
    val isMember: Boolean get() = access == "editor" || access == "listener"
    val size: Int get() = songCount ?: songs.size
    val ids: List<String> get() = songIds ?: songs.map { it.id }
    val coverOrFirst: String? get() = cover ?: songs.firstOrNull { it.cover != null }?.cover
}

@Serializable
data class PlaylistMember(
    @SerialName("user_id") val userId: String,
    val username: String = "",
    @SerialName("can_edit") val canEdit: Int = 0,
)

@Serializable
data class UserSuggestion(@SerialName("user_id") val userId: String, val username: String = "")

/** Something another user sent (inbox). */
@Serializable
data class InboxItem(
    val id: String,
    @SerialName("from_username") val fromUsername: String = "",
    /** song | album | artist | playlist | audiobook */
    @SerialName("item_type") val itemType: String = "",
    @SerialName("item_id") val itemId: String = "",
    val message: String? = null,
    @SerialName("created_at") val createdAt: Long = 0,
    val read: Boolean = false,
    val available: Boolean = true,
    val title: String = "",
    val subtitle: String = "",
    val cover: String? = null,
)

@Serializable
data class Inbox(val items: List<InboxItem> = emptyList(), val unread: Int = 0)

@Serializable
data class UnreadAnswer(val unread: Int = 0)

@Serializable
data class BlockedUser(@SerialName("user_id") val userId: String, val username: String = "")

@Serializable
data class Privacy(
    @SerialName("allow_invites") val allowInvites: Boolean = true,
    @SerialName("allow_shares") val allowShares: Boolean = true,
    val discoverable: Boolean = true,
    @SerialName("show_name_public") val showNamePublic: Boolean = true,
    @SerialName("count_in_stats") val countInStats: Boolean = true,
    val blocked: List<BlockedUser> = emptyList(),
)

@Serializable
data class BlocksAnswer(val blocked: List<BlockedUser> = emptyList())

@Serializable
data class PlaylistUpdate(val playlist: Playlist? = null)

@Serializable
data class MembersAnswer(val members: List<PlaylistMember> = emptyList(), val visibility: String? = null)

@Serializable
data class HomeData(
    val recentlyPlayed: List<Song> = emptyList(),
    val mostPlayed: List<Song> = emptyList(),
    val newSongs: List<Song> = emptyList(),
    val topAlbums: List<Album> = emptyList(),
    /** "mostPlayed" (albums heard most in 3 months) or "new" (not enough history). */
    val topAlbumsMode: String? = null,
    // Servers newer than v0.5.1 send the whole start page at once. Null on older
    // servers: the app then loads the lists itself.
    val newAlbums: List<Album>? = null,
    val artists: List<Artist>? = null,
    val cumuPlaylists: List<Playlist>? = null,
    val genres: GenreStats? = null,
    /** Unread items in "Mit dir geteilt" (servers from v0.7.0). */
    val inboxUnread: Int? = null,
    /** Public playlists of other users (servers from v0.7.0). */
    val publicPlaylists: List<Playlist>? = null,
    /** Servers from v0.7.0: started and new audiobooks. */
    val audiobooks: HomeAudiobooks? = null,
)

/** Library tab in one request (servers newer than v0.5.1). */
@Serializable
data class LibraryOverview(
    val playlists: List<Playlist> = emptyList(),
    /** Only albums heard in the last 3 months, most recent first. */
    val albums: List<Album> = emptyList(),
    /** Only artists heard in the last 3 months, most recent first. */
    val artists: List<Artist> = emptyList(),
    /** Favourite song ids, shared with the web app. */
    val favorites: List<String> = emptyList(),
    val showFavorites: Boolean = true,
    /** Items pinned in the web app: "playlist:<id>", "favorites", "podcasts". */
    val pinned: List<String> = emptyList(),
    val inboxUnread: Int? = null,
    /** Number of audiobooks (servers from v0.7.0, else null). */
    val audiobookCount: Int? = null,
)

@Serializable
data class Favorites(
    val ids: List<String> = emptyList(),
    val songs: List<Song> = emptyList(),
)

@Serializable
data class SearchResult(
    val songs: List<Song> = emptyList(),
    val albums: List<Album> = emptyList(),
    val artists: List<Artist> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
    val audiobooks: List<Audiobook> = emptyList(),
)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Long = 3600,
)

@Serializable
data class AuthorizeResponse(
    val code: String,
    @SerialName("admin_trust") val adminTrust: String? = null,
)

@Serializable
data class Me(
    val username: String = "",
    val role: String = "user",
)

@Serializable
data class GenreCount(
    val genre: String,
    val count: Int = 0,
    val topArtist: String? = null,
)

@Serializable
data class GenreStats(
    val topGenres: List<GenreCount> = emptyList(),
    val mostPlayedGenre: String? = null,
)

@Serializable
data class GenreDetail(
    val genre: String = "",
    val songs: List<Song> = emptyList(),
)
