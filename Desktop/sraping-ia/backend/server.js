import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import { Readable } from 'node:stream';

const app = express();
app.use(cors());
app.use(express.json());

const BASE_URL = 'https://hardstyle.com';
const DOWNLOAD_DIR = new URL('./downloads/', import.meta.url).pathname;

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://hardstyle.com/',
};

function getCSRFToken($) {
  return $('meta[name="csrf-token"]').attr('content') || '';
}

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query parameter q is required' });

    const url = `${BASE_URL}/en/search?search=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers });
    const html = await response.text();
    const $ = cheerio.load(html);

    const tracks = [];

    $('[data-track-id]').each((_, el) => {
      const $el = $(el);
      const trackId = $el.attr('data-track-id');
      if (!trackId || tracks.find(t => t.id === trackId)) return;

      const titleEl = $el.find('.trackTitle .innerLink').first();
      const title = titleEl.text().trim() || $el.find('.trackTitle').text().trim();
      if (!title) return;

      const mixMarquees = $el.find('.trackContent > .hoverMarquee');
      const mix = mixMarquees.eq(1).find('.linkTitle').text().trim() || '';

      const artists = [];
      $el.find('.artists .highlight .innerLink').each((_, a) => {
        const name = $(a).text().replace(/\s+/g, ' ').trim().replace(/Verified$/, '').trim();
        if (name) artists.push(name);
      });

      const duration = $el.find('.innerDuration').text().trim() || '';
      const label = $el.find('.label .link').first().text().trim() || '';

      const imageEl = $el.find('.imageWrapper img, .trackPoster img').first();
      const imageSrc = imageEl.attr('src') || imageEl.attr('data-src') || '';
      const image = imageSrc.startsWith('http') ? imageSrc : `${BASE_URL}${imageSrc}`;

      let mixType = 'unknown';
      const mixLower = mix.toLowerCase();
      if (mixLower.includes('extended')) mixType = 'extended';
      else if (mixLower.includes('radio')) mixType = 'radio';
      else if (mixLower.includes('original')) mixType = 'original';
      else if (mixLower.includes('remix')) mixType = 'remix';
      else if (mixLower.includes('edit')) mixType = 'edit';
      else if (!mix) mixType = 'original';

      tracks.push({
        id: trackId,
        title,
        artists,
        mix,
        mixType,
        duration,
        label,
        image,
        previewUrl: `${BASE_URL}/track_preview/128/${trackId}`,
        pageUrl: `${BASE_URL}${$el.find('.playButton').attr('data-track-url') || ''}`,
      });
    });

    const csrfToken = getCSRFToken($);

    res.json({ tracks, csrfToken, total: tracks.length });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

app.get('/api/track/:id', async (req, res) => {
  try {
    const trackId = req.params.id;
    const pageUrl = req.query.url;

    let html;
    if (pageUrl) {
      const response = await fetch(pageUrl, { headers });
      html = await response.text();
    } else {
      const response = await fetch(`${BASE_URL}/en/search?search=${trackId}`, { headers });
      html = await response.text();
    }

    const $ = cheerio.load(html);
    const csrfToken = getCSRFToken($);

    const playerRes = await fetch(`${BASE_URL}/player/${trackId}`, {
      method: 'POST',
      headers: {
        ...headers,
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: '',
    });

    const playerHtml = await playerRes.text();
    const $player = cheerio.load(playerHtml);
    const audioSrc = $player('audio').attr('src') || '';

    const trackData = {
      id: trackId,
      previewUrl: audioSrc.startsWith('http') ? audioSrc : `${BASE_URL}${audioSrc}`,
    };

    const tracklistTracks = [];

    $('[data-track-id]').each((_, el) => {
      const $el = $(el);
      const tId = $el.attr('data-track-id');
      if (!tId || tracklistTracks.find(t => t.id === tId)) return;

      const title = $el.find('.trackTitle .innerLink').text().trim();
      if (!title) return;

      const mixMarquees = $el.find('.trackContent > .hoverMarquee');
      const mix = mixMarquees.eq(1).find('.linkTitle').text().trim() || '';

      const artists = [];
      $el.find('.artists .highlight .innerLink').each((_, a) => {
        const name = $(a).text().replace(/\s+/g, ' ').trim().replace(/Verified$/, '').trim();
        if (name) artists.push(name);
      });

      const duration = $el.find('.innerDuration').text().trim() || '';
      const label = $el.find('.label .link').first().text().trim() || '';

      let mixType = 'unknown';
      const mixLower = mix.toLowerCase();
      if (mixLower.includes('extended')) mixType = 'extended';
      else if (mixLower.includes('radio')) mixType = 'radio';
      else if (mixLower.includes('original')) mixType = 'original';
      else if (mixLower.includes('remix')) mixType = 'remix';
      else if (mixLower.includes('edit')) mixType = 'edit';
      else if (!mix) mixType = 'original';

      tracklistTracks.push({
        id: tId,
        title,
        artists,
        mix,
        mixType,
        duration,
        label,
        previewUrl: `${BASE_URL}/track_preview/375/${tId}`,
      });
    });

    if (tracklistTracks.length > 0) {
      trackData.tracklist = tracklistTracks;
    }

    res.json(trackData);
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ error: 'Failed to get track', message: err.message });
  }
});

app.get('/api/download/:id', async (req, res) => {
  try {
    const trackId = req.params.id;
    const title = req.query.title || trackId;
    const artist = req.query.artist || 'Unknown';
    const mix = req.query.mix || '';

    // Get session cookies from initial search
    const initRes = await fetch(`${BASE_URL}/en/search?search=${trackId}`, { headers });
    const cookies = initRes.headers.getSetCookie();
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    const initHtml = await initRes.text();
    const $ = cheerio.load(initHtml);
    const csrfToken = getCSRFToken($);

    const reqHeaders = {
      ...headers,
      'X-CSRF-TOKEN': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
    };

    const playerRes = await fetch(`${BASE_URL}/player/${trackId}`, {
      method: 'POST',
      headers: reqHeaders,
      body: '',
    });

    const playerHtml = await playerRes.text();
    const $player = cheerio.load(playerHtml);
    let audioSrc = $player('audio').attr('src') || '';

    if (!audioSrc) {
      return res.status(404).json({ error: 'Audio source not found' });
    }

    if (!audioSrc.startsWith('http')) {
      audioSrc = `${BASE_URL}${audioSrc}`;
    }

    const safeTitle = `${artist} - ${title}${mix ? ` (${mix})` : ''}`.replace(/[^a-zA-Z0-9\s\-_()áéíóúñüÁÉÍÓÚÑÜ.,!&']/g, '').trim();

    // Range header is required by hardstyle.com server
    const audioRes = await fetch(audioSrc, {
      headers: {
        ...headers,
        'Range': 'bytes=0-',
        'Referer': `${BASE_URL}/en/tracks/${trackId}/`,
        'Cookie': cookieHeader,
      },
    });

    if (!audioRes.ok && audioRes.status !== 206) {
      return res.status(audioRes.status).json({ error: 'Failed to fetch audio' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
    const contentLength = audioRes.headers.get('content-length') || '';
    if (contentLength) res.setHeader('Content-Length', contentLength);

    Readable.fromWeb(audioRes.body).pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', message: err.message });
    }
  }
});

app.get('/api/tracks', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const artist = req.query.artist || '';
    const label = req.query.label || '';
    const year = req.query.year || '';
    const genre = req.query.genre || '';

    let url = `${BASE_URL}/en/tracks`;
    const params = new URLSearchParams();
    if (page > 1) params.append('page', page);
    if (artist) params.append('artist', artist);
    if (label) params.append('label', label);
    if (year) params.append('year', year);
    if (genre) params.append('genre', genre);

    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const response = await fetch(url, { headers });
    const html = await response.text();
    const $ = cheerio.load(html);

    const tracks = [];
    const seen = new Set();

    $('[data-track-id]').each((_, el) => {
      const $el = $(el);
      const trackId = $el.attr('data-track-id');
      if (!trackId || seen.has(trackId)) return;
      seen.add(trackId);

      const title = $el.find('.trackTitle .innerLink').text().trim();
      if (!title) return;

      const mixMarquees = $el.find('.trackContent > .hoverMarquee');
      const mix = mixMarquees.eq(1).find('.linkTitle').text().trim() || '';

      const artists = [];
      $el.find('.artists .highlight .innerLink').each((_, a) => {
        const name = $(a).text().replace(/\s+/g, ' ').trim().replace(/Verified$/, '').trim();
        if (name) artists.push(name);
      });

      const duration = $el.find('.innerDuration').text().trim() || '';
      const label = $el.find('.label .link').first().text().trim() || '';

      const imageEl = $el.find('.imageWrapper img, .trackPoster img').first();
      const imageSrc = imageEl.attr('src') || imageEl.attr('data-src') || '';
      const image = imageSrc.startsWith('http') ? imageSrc : `${BASE_URL}${imageSrc}`;

      let mixType = 'unknown';
      const mixLower = mix.toLowerCase();
      if (mixLower.includes('extended')) mixType = 'extended';
      else if (mixLower.includes('radio')) mixType = 'radio';
      else if (mixLower.includes('original')) mixType = 'original';
      else if (mixLower.includes('remix')) mixType = 'remix';
      else if (mixLower.includes('edit')) mixType = 'edit';
      else if (!mix) mixType = 'original';

      tracks.push({
        id: trackId,
        title,
        artists,
        mix,
        mixType,
        duration,
        label,
        image,
        previewUrl: `${BASE_URL}/track_preview/128/${trackId}`,
      });
    });

    res.json({ tracks, total: tracks.length, page });
  } catch (err) {
    console.error('Tracks error:', err);
    res.status(500).json({ error: 'Failed to get tracks', message: err.message });
  }
});

app.get('/api/preview/:id', async (req, res) => {
  try {
    const trackId = req.params.id;

    const initRes = await fetch(`${BASE_URL}/en/search?search=${trackId}`, { headers });
    const cookies = initRes.headers.getSetCookie();
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    const initHtml = await initRes.text();
    const $ = cheerio.load(initHtml);
    const csrfToken = getCSRFToken($);

    const playerRes = await fetch(`${BASE_URL}/player/${trackId}`, {
      method: 'POST',
      headers: {
        ...headers,
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieHeader,
      },
      body: '',
    });

    const playerHtml = await playerRes.text();
    const $player = cheerio.load(playerHtml);
    let audioSrc = $player('audio').attr('src') || '';

    if (!audioSrc) {
      return res.status(404).json({ error: 'Audio source not found' });
    }

    if (!audioSrc.startsWith('http')) {
      audioSrc = `${BASE_URL}${audioSrc}`;
    }

    const audioRes = await fetch(audioSrc, {
      headers: {
        ...headers,
        'Range': 'bytes=0-',
        'Referer': `${BASE_URL}/`,
        'Cookie': cookieHeader,
      },
    });

    if (!audioRes.ok && audioRes.status !== 206) {
      return res.status(audioRes.status).json({ error: 'Failed to fetch audio' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    const contentLength = audioRes.headers.get('content-length') || '';
    if (contentLength) res.setHeader('Content-Length', contentLength);

    Readable.fromWeb(audioRes.body).pipe(res);
  } catch (err) {
    console.error('Preview error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Preview failed', message: err.message });
    }
  }
});

app.listen(3003, () => {
  console.log('Hardstyle Scraper API running on http://localhost:3003');
});
