/**
 * src/routes/podcasts.js
 * Proxy for Podcast Index API / iTunes API and Custom RSS feeds.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const { getConfig, getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getPodcastIndexHeaders(apiKey, apiSecret) {
  const apiHeaderTime = Math.floor(Date.now() / 1000);
  const sha1Hash = crypto.createHash('sha1');
  sha1Hash.update(apiKey + apiSecret + apiHeaderTime);
  const hash4Header = sha1Hash.digest('hex');

  return {
    "User-Agent": "Cumu-Music-Server/1.0",
    "X-Auth-Date": "" + apiHeaderTime,
    "X-Auth-Key": apiKey,
    "Authorization": hash4Header
  };
}

// Helper to convert iTunes podcast object to a unified format
function mapItunesPodcast(p) {
  return {
    id: 'itunes:' + p.collectionId,
    title: p.collectionName,
    artist: p.artistName,
    cover: p.artworkUrl600 || p.artworkUrl100,
    feedUrl: p.feedUrl,
    source: 'itunes'
  };
}

// Helper to convert PodcastIndex podcast object to unified format
function mapPodcastIndex(p) {
  return {
    id: 'pi:' + p.id,
    title: p.title,
    artist: p.author,
    cover: p.image || p.artwork,
    feedUrl: p.url,
    description: p.description,
    source: 'podcastindex'
  };
}

router.get('/trending', requireAuth, async (req, res) => {
  const cfg = getConfig();
  let results = [];

  // 1. Add Custom Feeds
  if (cfg.customPodcastFeeds && cfg.customPodcastFeeds.length > 0) {
    results = cfg.customPodcastFeeds.map(feed => ({
      id: 'custom:' + Buffer.from(feed.url).toString('base64'),
      title: feed.title || 'Custom RSS',
      artist: 'Custom Feed',
      cover: feed.cover || '',
      feedUrl: feed.url,
      source: 'custom'
    }));
  }

  // 2. Add API Feeds if enabled
  if (cfg.enablePublicPodcasts !== false) {
    try {
      if (cfg.podcastApiSource === 'podcastindex' && cfg.podcastIndexKey && cfg.podcastIndexSecret) {
        const response = await fetch('https://api.podcastindex.org/api/1.0/podcasts/trending?max=20', {
          headers: getPodcastIndexHeaders(cfg.podcastIndexKey, cfg.podcastIndexSecret)
        });
        if (response.ok) {
          const data = await response.json();
          if (data.feeds) {
            results = results.concat(data.feeds.map(mapPodcastIndex));
          }
        }
      } else {
        // Fallback or explicit choice: iTunes API
        const response = await fetch('https://itunes.apple.com/search?media=podcast&term=podcast&limit=20');
        if (response.ok) {
          const data = await response.json();
          if (data.results) {
            results = results.concat(data.results.map(mapItunesPodcast));
          }
        }
      }
    } catch (err) {
      console.error('[cumu] Podcast API Error:', err);
    }
  }

  res.json({ success: true, podcasts: results });
});

router.get('/progress', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const row = db.prepare('SELECT extra_settings FROM user_state WHERE user_id = ?').get(req.user.id);
    let podcastProgress = null;
    if (row && row.extra_settings) {
      try {
        const extra = JSON.parse(row.extra_settings);
        podcastProgress = extra.podcastProgress || null;
      } catch (_) {}
    }
    res.json({ success: true, progress: podcastProgress });
  } catch (err) {
    console.error('[cumu] GET /podcasts/progress error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/progress', requireAuth, async (req, res) => {
  try {
    const { progress } = req.body;
    if (!progress) return res.status(400).json({ error: 'Missing progress payload' });

    const db = getDB();
    const row = db.prepare('SELECT extra_settings FROM user_state WHERE user_id = ?').get(req.user.id);
    let extra = {};
    if (row && row.extra_settings) {
      try { extra = JSON.parse(row.extra_settings); } catch (_) {}
    }
    extra.podcastProgress = progress;

    db.prepare(`
      INSERT INTO user_state (user_id, extra_settings, updated_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(user_id) DO UPDATE SET
        extra_settings = excluded.extra_settings,
        updated_at = unixepoch()
    `).run(req.user.id, JSON.stringify(extra));

    res.json({ success: true });
  } catch (err) {
    console.error('[cumu] POST /podcasts/progress error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/recommendations', requireAuth, async (req, res) => {
  const cfg = getConfig();
  const db = getDB();
  
  let globalTrending = [];
  let frequentlyListened = [];
  let instanceRecommendations = [];
  let continueListening = null;

  // 0. User's saved podcast progress
  try {
    const row = db.prepare('SELECT extra_settings FROM user_state WHERE user_id = ?').get(req.user.id);
    if (row && row.extra_settings) {
      const extra = JSON.parse(row.extra_settings);
      if (extra.podcastProgress) {
        continueListening = extra.podcastProgress;
      }
    }
  } catch (_) {}

  // 1. Fetch Global Trending
  if (cfg.enablePublicPodcasts !== false) {
    try {
      if (cfg.podcastApiSource === 'podcastindex' && cfg.podcastIndexKey && cfg.podcastIndexSecret) {
        const response = await fetch('https://api.podcastindex.org/api/1.0/podcasts/trending?max=20', {
          headers: getPodcastIndexHeaders(cfg.podcastIndexKey, cfg.podcastIndexSecret)
        });
        if (response.ok) {
          const data = await response.json();
          if (data.feeds) {
            globalTrending = data.feeds.map(mapPodcastIndex);
          }
        }
      } else {
        const response = await fetch('https://itunes.apple.com/search?media=podcast&term=podcast&limit=20');
        if (response.ok) {
          const data = await response.json();
          if (data.results) {
            globalTrending = data.results.map(mapItunesPodcast);
          }
        }
      }
    } catch (err) {
      console.error('[cumu] Global Podcast API Error:', err);
    }
  }

  // Helper to fetch podcast metadata by song_id
  async function resolvePodcastMeta(songId) {
    let isItunes = songId.startsWith('itunes:');
    let realId = songId.replace(/^(pi:|itunes:|custom:)/, '');
    if (songId.startsWith('custom:')) {
      const feedUrl = Buffer.from(realId, 'base64').toString('utf8');
      const customFeed = (cfg.customPodcastFeeds || []).find(f => f.url === feedUrl);
      return {
        id: songId,
        title: customFeed?.title || 'Custom RSS',
        artist: 'Custom Feed',
        cover: customFeed?.cover || '',
        feedUrl,
        source: 'custom'
      };
    }
    try {
      if (!isItunes && cfg.podcastApiSource === 'podcastindex' && cfg.podcastIndexKey && cfg.podcastIndexSecret) {
        const response = await fetch('https://api.podcastindex.org/api/1.0/podcasts/byfeedid?id=' + realId, {
          headers: getPodcastIndexHeaders(cfg.podcastIndexKey, cfg.podcastIndexSecret)
        });
        if (response.ok) {
          const data = await response.json();
          if (data.feed) return mapPodcastIndex(data.feed);
        }
      } else {
        const response = await fetch('https://itunes.apple.com/lookup?id=' + realId);
        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) return mapItunesPodcast(data.results[0]);
        }
      }
    } catch (err) {
      console.error('[cumu] Podcast lookup error:', err);
    }
    return null;
  }

  // 2. Fetch Frequently Listened for current user ("Oft gehört")
  try {
    const userRows = db.prepare(`
      SELECT song_id, COUNT(*) as play_count 
      FROM play_history 
      WHERE user_id = ? AND (song_id LIKE 'pi:%' OR song_id LIKE 'itunes:%' OR song_id LIKE 'custom:%')
      GROUP BY song_id 
      ORDER BY play_count DESC 
      LIMIT 10
    `).all(req.user.id);

    for (const row of userRows) {
      const meta = await resolvePodcastMeta(row.song_id);
      if (meta) frequentlyListened.push({ ...meta, playCount: row.play_count });
    }
  } catch (dbErr) {
    console.error('[cumu] DB Error fetching frequently listened:', dbErr);
  }

  // 3. Instance Recommendations (Empfohlen basierend auf allen Nutzern der Cumu-Instanz)
  try {
    const instRows = db.prepare(`
      SELECT song_id, COUNT(DISTINCT user_id) as user_count, COUNT(*) as total_plays 
      FROM play_history 
      WHERE song_id LIKE 'pi:%' OR song_id LIKE 'itunes:%' OR song_id LIKE 'custom:%'
      GROUP BY song_id 
      ORDER BY user_count DESC, total_plays DESC 
      LIMIT 10
    `).all();

    for (const row of instRows) {
      const meta = await resolvePodcastMeta(row.song_id);
      if (meta) instanceRecommendations.push({ ...meta, userCount: row.user_count });
    }
  } catch (dbErr) {
    console.error('[cumu] DB Error fetching instance recommendations:', dbErr);
  }

  res.json({
    success: true,
    continueListening,
    frequentlyListened,
    instanceRecommendations,
    localTrending: frequentlyListened, // backwards compatibility
    globalTrending
  });
});

async function fetchPodcastSearchResults(q) {
  if (!q) return [];
  const cfg = getConfig();
  let results = [];

  // 1. Custom Feeds
  if (cfg.customPodcastFeeds && cfg.customPodcastFeeds.length > 0) {
    const qLower = q.toLowerCase();
    const customMatches = cfg.customPodcastFeeds
      .filter(feed => (feed.title || '').toLowerCase().includes(qLower))
      .map(feed => ({
        id: 'custom:' + Buffer.from(feed.url).toString('base64'),
        title: feed.title || 'Custom RSS',
        artist: 'Custom Feed',
        cover: feed.cover || '',
        feedUrl: feed.url,
        source: 'custom'
      }));
    results = results.concat(customMatches);
  }

  // 2. Public API Feeds if enabled
  if (cfg.enablePublicPodcasts !== false) {
    try {
      if (cfg.podcastApiSource === 'podcastindex' && cfg.podcastIndexKey && cfg.podcastIndexSecret) {
        const url = 'https://api.podcastindex.org/api/1.0/search/byterm?q=' + encodeURIComponent(q);
        const response = await fetch(url, {
          headers: getPodcastIndexHeaders(cfg.podcastIndexKey, cfg.podcastIndexSecret)
        });
        if (response.ok) {
          const data = await response.json();
          if (data.feeds) {
            results = results.concat(data.feeds.map(mapPodcastIndex));
          }
        }
      } else {
        const url = 'https://itunes.apple.com/search?media=podcast&term=' + encodeURIComponent(q);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.results) {
            results = results.concat(data.results.map(mapItunesPodcast));
          }
        }
      }
    } catch (err) {
      console.error('[cumu] Podcast API Search Error:', err);
    }
  }

  return results;
}

router.get('/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  const podcasts = await fetchPodcastSearchResults(q);
  res.json({ success: true, podcasts });
});

router.post('/episodes', requireAuth, async (req, res) => {
  const { feedUrl, id } = req.body;
  if (!feedUrl && !id) return res.status(400).json({ error: 'Missing feedUrl or id' });

  const cfg = getConfig();

  // Prefer Podcast Index API for episodes if configured and the ID is a PI id
  if (id && id.startsWith('pi:') && cfg.podcastApiSource === 'podcastindex' && cfg.podcastIndexKey) {
    try {
      const piId = id.replace('pi:', '');
      const url = 'https://api.podcastindex.org/api/1.0/episodes/bypodcastid?id=' + piId + '&max=50';
      const response = await fetch(url, {
        headers: getPodcastIndexHeaders(cfg.podcastIndexKey, cfg.podcastIndexSecret)
      });
      if (response.ok) {
        const data = await response.json();
        const eps = (data.items || []).map(item => ({
          id: item.id,
          title: item.title,
          description: item.description,
          audioUrl: item.enclosureUrl,
          duration: item.duration,
          publishedAt: item.datePublished
        }));
        return res.json({ success: true, episodes: eps });
      }
    } catch (err) {
      console.error('[cumu] PI Episode fetch error:', err);
    }
  }

  // Fallback: Fetch RSS XML and do a lightweight Regex/string extraction (since we don't have an XML parser)
  if (!feedUrl) return res.status(400).json({ error: 'feedUrl required for RSS fallback' });

  try {
    const response = await fetch(feedUrl);
    const xml = await response.text();
    
    // Very basic regex to grab <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    const episodes = [];
    
    while ((match = itemRegex.exec(xml)) !== null && episodes.length < 50) {
      const itemContent = match[1];
      
      const titleMatch = itemContent.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const descMatch = itemContent.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || itemContent.match(/<description>([\s\S]*?)<\/description>/);
      const encMatch = itemContent.match(/<enclosure[^>]+url="([^"]+)"/);
      const pubMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const durMatch = itemContent.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/);
      
      if (encMatch) {
        episodes.push({
          id: encMatch[1],
          title: titleMatch ? titleMatch[1].trim() : 'Unknown Episode',
          description: descMatch ? descMatch[1].trim() : '',
          audioUrl: encMatch[1],
          publishedAt: pubMatch ? Math.floor(new Date(pubMatch[1]).getTime() / 1000) : 0,
          duration: durMatch ? durMatch[1].trim() : 0
        });
      }
    }
    
    return res.json({ success: true, episodes });
  } catch (err) {
    console.error('[cumu] RSS parse error:', err);
    return res.status(500).json({ error: 'Failed to fetch or parse RSS feed' });
  }
});

module.exports = router;
module.exports.fetchPodcastSearchResults = fetchPodcastSearchResults;

