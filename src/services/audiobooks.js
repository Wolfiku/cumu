/**
 * src/services/audiobooks.js
 * Audiobooks: songs in a speech genre (or marked by hand) are audiobook
 * chapters. An album of chapters is one book; a chapter without an album is
 * a book of its own (id "s-<songId>").
 *
 * Audiobooks never show up between music: not in mixes, recommendations,
 * genre lists, "recently added" or the music search results. They only play
 * when the user starts or queues them explicitly.
 *
 * Listening progress is stored per user and book, so every device continues
 * where the user stopped.
 */

'use strict';

// Genres (lower case) that turn a song into an audiobook chapter
const SPEECH_GENRES = [
  'speech', 'spoken word', 'spoken', 'spokenword',
  'audiobook', 'audiobooks', 'audio book', 'audio books',
  'hörbuch', 'hörbücher', 'hoerbuch', 'hoerbuecher',
];

const SPEECH_SQL_LIST = SPEECH_GENRES.map(g => `'${g.replace(/'/g, "''")}'`).join(', ');
const isSpeechSql = (col) => `LOWER(TRIM(COALESCE(${col}, ''))) IN (${SPEECH_SQL_LIST})`;

/** SQL condition: the song aliased as `alias` is music, not an audiobook chapter. */
const musicOnly = (alias = 's') => `COALESCE(${alias}.is_audiobook, 0) = 0`;

function isSpeechGenre(genre) {
  return SPEECH_GENRES.includes(String(genre || '').trim().toLowerCase());
}

/**
 * Database setup: progress table, triggers that mark speech songs as
 * audiobooks whenever a song is added or its genre / album changes (scan,
 * upload, metadata lookup, edits), and a one-time sync of existing songs.
 */
function initAudiobooks(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audiobook_progress (
      user_id    TEXT NOT NULL,
      book_id    TEXT NOT NULL,
      song_id    TEXT NOT NULL,
      position   REAL NOT NULL DEFAULT 0,
      finished   INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, book_id)
    );
    CREATE INDEX IF NOT EXISTS idx_abprogress_user ON audiobook_progress(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_songs_audiobook ON songs(is_audiobook);

    DROP TRIGGER IF EXISTS trg_songs_speech_insert;
    CREATE TRIGGER trg_songs_speech_insert AFTER INSERT ON songs
    WHEN ${isSpeechSql('NEW.genre')} OR NEW.is_audiobook = 1
    BEGIN
      UPDATE songs SET is_audiobook = 1 WHERE id = NEW.id AND COALESCE(is_audiobook, 0) = 0;
      UPDATE albums SET is_audiobook = 1 WHERE id = NEW.album_id AND COALESCE(is_audiobook, 0) = 0;
    END;

    DROP TRIGGER IF EXISTS trg_songs_speech_update;
    CREATE TRIGGER trg_songs_speech_update AFTER UPDATE OF genre, album_id, is_audiobook ON songs
    WHEN ${isSpeechSql('NEW.genre')} OR NEW.is_audiobook = 1
    BEGIN
      UPDATE songs SET is_audiobook = 1 WHERE id = NEW.id AND COALESCE(is_audiobook, 0) = 0;
      UPDATE albums SET is_audiobook = 1 WHERE id = NEW.album_id AND COALESCE(is_audiobook, 0) = 0;
    END;
  `);
  syncAudiobookFlags(db);
}

/** Marks every speech song as audiobook and keeps the album flags in line. */
function syncAudiobookFlags(db) {
  const marked = db.prepare(`UPDATE songs SET is_audiobook = 1 WHERE COALESCE(is_audiobook, 0) = 0 AND ${isSpeechSql('genre')}`).run().changes;
  db.prepare(`UPDATE albums SET is_audiobook = 1 WHERE COALESCE(is_audiobook, 0) = 0
    AND EXISTS (SELECT 1 FROM songs s WHERE s.album_id = albums.id AND s.is_audiobook = 1)`).run();
  // An album is a book only while it has chapters
  db.prepare(`UPDATE albums SET is_audiobook = 0 WHERE is_audiobook = 1
    AND NOT EXISTS (SELECT 1 FROM songs s WHERE s.album_id = albums.id AND s.is_audiobook = 1)`).run();
  if (marked) console.log(`[cumu] Audiobooks: marked ${marked} speech track(s) as audiobook chapters.`);
  return marked;
}

// ── Books ───────────────────────────────────────────────────────────────────

const CHAPTER_ORDER = 'COALESCE(s.track_number, 999999) ASC, s.filename ASC, s.title ASC';

const bookIdOf = (song) => (song.album_id ? song.album_id : `s-${song.id}`);

function chaptersOf(db, bookId) {
  const base = `
    SELECT s.*, al.title as album_title, COALESCE(al.cover, s.cover) as cover, ar.name as artist_name
    FROM songs s
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = s.artist_id`;
  if (bookId.startsWith('s-')) {
    return db.prepare(`${base} WHERE s.id = ? AND s.is_audiobook = 1`).all(bookId.slice(2));
  }
  return db.prepare(`${base} WHERE s.album_id = ? AND s.is_audiobook = 1 ORDER BY ${CHAPTER_ORDER}`).all(bookId);
}

function progressRow(db, userId, bookId) {
  return db.prepare('SELECT * FROM audiobook_progress WHERE user_id = ? AND book_id = ?').get(userId, bookId) || null;
}

/** Book summary (no chapter rows) with the user's progress. */
function summarize(book, chapters, progress) {
  const total = chapters.reduce((sum, c) => sum + (c.duration || 0), 0);
  let p = null;
  if (progress) {
    const idx = chapters.findIndex(c => c.id === progress.song_id);
    const before = idx > 0 ? chapters.slice(0, idx).reduce((sum, c) => sum + (c.duration || 0), 0) : 0;
    const listened = progress.finished ? total : before + (progress.position || 0);
    p = {
      songId: progress.song_id,
      chapterIndex: Math.max(idx, 0),
      position: progress.position || 0,
      finished: !!progress.finished,
      updatedAt: progress.updated_at,
      percent: total > 0 ? Math.min(100, Math.round((listened / total) * 100)) : 0,
      remaining: Math.max(0, Math.round(total - listened)),
    };
  }
  return {
    ...book,
    is_audiobook: 1,
    chapter_count: chapters.length,
    duration: Math.round(total),
    progress: p,
  };
}

/** Every book, newest first, with the user's progress. */
function listBooks(db, userId) {
  const albums = db.prepare(`
    SELECT al.id, al.title, al.cover, al.year, al.genre, al.created_at, al.artist_id, ar.name as artist_name
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id
    WHERE EXISTS (SELECT 1 FROM songs s WHERE s.album_id = al.id AND s.is_audiobook = 1)
  `).all();
  const loose = db.prepare(`
    SELECT s.*, ar.name as artist_name
    FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE s.is_audiobook = 1 AND s.album_id IS NULL
  `).all();
  const chapterStmt = db.prepare(`SELECT s.id, s.duration, s.cover FROM songs s WHERE s.album_id = ? AND s.is_audiobook = 1 ORDER BY ${CHAPTER_ORDER}`);
  const progress = new Map(
    db.prepare('SELECT * FROM audiobook_progress WHERE user_id = ?').all(userId).map(r => [r.book_id, r]),
  );

  const books = albums.map(al => {
    const chapters = chapterStmt.all(al.id);
    const cover = al.cover || chapters.find(c => c.cover)?.cover || null;
    return summarize({ ...al, cover }, chapters, progress.get(al.id));
  });
  for (const s of loose) {
    const id = `s-${s.id}`;
    books.push(summarize({
      id, title: s.title, cover: s.cover, year: s.year, genre: s.genre, created_at: s.created_at,
      artist_id: s.artist_id, artist_name: s.artist_name,
    }, [s], progress.get(id)));
  }
  books.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  return books;
}

/** Books the user started and has not finished, last heard first. */
function continueListening(books) {
  return books
    .filter(b => b.progress && !b.progress.finished)
    .sort((a, b) => (b.progress.updatedAt || 0) - (a.progress.updatedAt || 0));
}

function getBook(db, bookId, userId) {
  const chapters = chaptersOf(db, bookId);
  if (!chapters.length) return null;
  let book;
  if (bookId.startsWith('s-')) {
    const s = chapters[0];
    book = { id: bookId, title: s.title, cover: s.cover, year: s.year, genre: s.genre, created_at: s.created_at, artist_id: s.artist_id, artist_name: s.artist_name };
  } else {
    book = db.prepare(`SELECT al.*, ar.name as artist_name FROM albums al LEFT JOIN artists ar ON ar.id = al.artist_id WHERE al.id = ?`).get(bookId);
    if (!book) return null;
    book.cover = book.cover || chapters.find(c => c.cover)?.cover || null;
  }
  return { ...summarize(book, chapters, progressRow(db, userId, bookId)), chapters };
}

/**
 * Saves where the user is in a book. The book is finished once the last
 * chapter is (almost) over.
 */
function saveProgress(db, userId, bookId, songId, position, finishedHint) {
  const chapters = chaptersOf(db, bookId);
  const idx = chapters.findIndex(c => c.id === songId);
  if (idx === -1) return null;
  const pos = Math.max(0, Number(position) || 0);
  const last = idx === chapters.length - 1;
  const dur = chapters[idx].duration || 0;
  const finished = finishedHint === true || (last && dur > 0 && pos >= dur - 15) ? 1 : 0;
  db.prepare(`
    INSERT INTO audiobook_progress (user_id, book_id, song_id, position, finished, updated_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(user_id, book_id) DO UPDATE SET
      song_id = excluded.song_id, position = excluded.position,
      finished = excluded.finished, updated_at = excluded.updated_at
  `).run(userId, bookId, songId, pos, finished);
  return summarize({ id: bookId }, chapters, progressRow(db, userId, bookId)).progress;
}

function clearProgress(db, userId, bookId) {
  db.prepare('DELETE FROM audiobook_progress WHERE user_id = ? AND book_id = ?').run(userId, bookId);
}

/** Audiobooks for the search: books whose title, author or chapter matches. */
function searchBooks(db, userId, scoreFn, limit = 10) {
  const books = listBooks(db, userId);
  const chapterTitles = new Map();
  for (const r of db.prepare('SELECT id, album_id, title FROM songs WHERE is_audiobook = 1').all()) {
    const id = r.album_id || `s-${r.id}`;
    if (!chapterTitles.has(id)) chapterTitles.set(id, []);
    chapterTitles.get(id).push(r.title);
  }
  return books
    .map(b => {
      const chapters = chapterTitles.get(b.id) || [];
      const score = Math.max(
        scoreFn(b.title),
        scoreFn(b.artist_name) * 0.8,
        ...chapters.slice(0, 200).map(t => scoreFn(t) * 0.7),
      );
      return { ...b, _score: score };
    })
    .filter(b => b._score >= 0.5)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

module.exports = {
  SPEECH_GENRES, isSpeechGenre, musicOnly, initAudiobooks, syncAudiobookFlags,
  listBooks, continueListening, getBook, saveProgress, clearProgress, searchBooks, bookIdOf,
};
