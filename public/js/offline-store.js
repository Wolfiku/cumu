/**
 * public/js/offline-store.js
 * IndexedDB storage engine for offline playlist playback in Cumu Web.
 */

'use strict';

const CumuOfflineStore = (() => {
  const DB_NAME = 'cumu_offline_db';
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        return reject(new Error('IndexedDB is not supported in this browser.'));
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('songs')) {
          db.createObjectStore('songs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('covers')) {
          db.createObjectStore('covers', { keyPath: 'id' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function getStore(storeName, mode = 'readonly') {
    const db = await openDB();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // ── Playlist Operations ───────────────────────────────────────────────────

  async function isPlaylistOffline(playlistId) {
    try {
      const store = await getStore('playlists', 'readonly');
      return new Promise((resolve) => {
        const req = store.get(playlistId);
        req.onsuccess = () => resolve(!!req.result);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  async function getOfflinePlaylist(playlistId) {
    try {
      const store = await getStore('playlists', 'readonly');
      return new Promise((resolve) => {
        const req = store.get(playlistId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function getAllOfflinePlaylists() {
    try {
      const store = await getStore('playlists', 'readonly');
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Downloads and saves a playlist and all its songs for offline playback.
   * @param {Object} playlist - Playlist object { id, name, description, ... }
   * @param {Array} songs - Array of song objects in the playlist
   * @param {Function} progressCb - Callback for download progress (current, total, currentSongTitle)
   */
  async function savePlaylistOffline(playlist, songs, progressCb) {
    const db = await openDB();
    const token = window.CumuApi ? window.CumuApi.getAccessToken() : '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const songIds = [];
    const total = songs.length;

    for (let i = 0; i < total; i++) {
      const song = songs[i];
      songIds.push(song.id);

      if (progressCb) {
        progressCb(i + 1, total, song.title || 'Unbenannter Song');
      }

      // Check if song blob already exists in IndexedDB
      const existingSong = await getOfflineSong(song.id);
      if (!existingSong) {
        try {
          const streamUrl = window.CumuApi ? window.CumuApi.streamUrl(song.id) : `/stream/${song.id}`;
          const res = await fetch(streamUrl, { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const blob = await res.blob();

          const songRecord = {
            id: song.id,
            title: song.title || 'Unbenannter Song',
            artist: song.artist || 'Unbekannter Künstler',
            album: song.album || '',
            duration: song.duration || 0,
            cover_path: song.cover_path || song.coverPath || null,
            audioBlob: blob,
            mimeType: blob.type || 'audio/mpeg',
            size: blob.size,
            savedAt: Date.now(),
          };

          const tx = db.transaction('songs', 'readwrite');
          tx.objectStore('songs').put(songRecord);
          await new Promise((res, rej) => {
            tx.oncomplete = res;
            tx.onerror = rej;
          });
        } catch (err) {
          console.warn(`[OfflineStore] Failed to download song ${song.id}:`, err);
        }
      }

      // Download Cover image if present
      if (song.cover_path || song.coverPath) {
        const coverFile = song.cover_path || song.coverPath;
        try {
          const coverRes = await fetch(`/stream/cover/${encodeURIComponent(coverFile)}`);
          if (coverRes.ok) {
            const coverBlob = await coverRes.blob();
            const txC = db.transaction('covers', 'readwrite');
            txC.objectStore('covers').put({ id: coverFile, blob: coverBlob });
          }
        } catch {}
      }
    }

    // Save Playlist entry
    const playlistRecord = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || '',
      songIds: songIds,
      songCount: songIds.length,
      downloadedAt: Date.now(),
    };

    const txP = db.transaction('playlists', 'readwrite');
    txP.objectStore('playlists').put(playlistRecord);
    await new Promise((res, rej) => {
      txP.oncomplete = res;
      txP.onerror = rej;
    });

    return true;
  }

  /**
   * Remove a playlist from offline storage.
   * Also cleans up songs that are no longer part of any downloaded playlist.
   */
  async function removePlaylistOffline(playlistId) {
    const db = await openDB();

    // 1. Get playlist to delete
    const playlist = await getOfflinePlaylist(playlistId);
    if (!playlist) return;

    // 2. Delete playlist record
    const txP = db.transaction('playlists', 'readwrite');
    txP.objectStore('playlists').delete(playlistId);
    await new Promise(res => txP.oncomplete = res);

    // 3. Get remaining playlists to check referenced song IDs
    const remainingPlaylists = await getAllOfflinePlaylists();
    const referencedSongIds = new Set();
    remainingPlaylists.forEach(pl => {
      (pl.songIds || []).forEach(id => referencedSongIds.add(id));
    });

    // 4. Delete orphan songs
    const txS = db.transaction('songs', 'readwrite');
    const songStore = txS.objectStore('songs');
    for (const songId of (playlist.songIds || [])) {
      if (!referencedSongIds.has(songId)) {
        songStore.delete(songId);
      }
    }
    await new Promise(res => txS.oncomplete = res);
  }

  // ── Song & Blob Retrieval ─────────────────────────────────────────────────

  async function getOfflineSong(songId) {
    try {
      const store = await getStore('songs', 'readonly');
      return new Promise((resolve) => {
        const req = store.get(songId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function getOfflineCoverUrl(coverPath) {
    if (!coverPath) return null;
    try {
      const store = await getStore('covers', 'readonly');
      return new Promise((resolve) => {
        const req = store.get(coverPath);
        req.onsuccess = () => {
          if (req.result && req.result.blob) {
            resolve(URL.createObjectURL(req.result.blob));
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  // ── Statistics & Storage ──────────────────────────────────────────────────

  async function getStorageStats() {
    try {
      const db = await openDB();
      const tx = db.transaction(['playlists', 'songs'], 'readonly');

      const playlists = await new Promise(res => {
        const req = tx.objectStore('playlists').getAll();
        req.onsuccess = () => res(req.result || []);
      });

      const songs = await new Promise(res => {
        const req = tx.objectStore('songs').getAll();
        req.onsuccess = () => res(req.result || []);
      });

      let totalBytes = 0;
      songs.forEach(s => {
        if (s.size) totalBytes += s.size;
        else if (s.audioBlob) totalBytes += s.audioBlob.size;
      });

      return {
        playlistCount: playlists.length,
        songCount: songs.length,
        totalBytes: totalBytes,
        formattedSize: formatBytes(totalBytes),
      };
    } catch {
      return { playlistCount: 0, songCount: 0, totalBytes: 0, formattedSize: '0 B' };
    }
  }

  async function clearAllOffline() {
    try {
      const db = await openDB();
      const tx = db.transaction(['playlists', 'songs', 'covers'], 'readwrite');
      tx.objectStore('playlists').clear();
      tx.objectStore('songs').clear();
      tx.objectStore('covers').clear();
      await new Promise(res => tx.oncomplete = res);
      return true;
    } catch {
      return false;
    }
  }

  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  return {
    openDB,
    isPlaylistOffline,
    getOfflinePlaylist,
    getAllOfflinePlaylists,
    savePlaylistOffline,
    removePlaylistOffline,
    getOfflineSong,
    getOfflineCoverUrl,
    getStorageStats,
    clearAllOffline,
    formatBytes,
  };
})();

window.CumuOfflineStore = CumuOfflineStore;
