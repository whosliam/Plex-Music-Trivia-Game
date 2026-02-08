const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Get Plex configuration from environment variables
const PLEX_URL = process.env.PLEX_URL || 'http://localhost:32400';
const PLEX_TOKEN = process.env.PLEX_TOKEN || '';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    plexConfigured: !!PLEX_TOKEN,
    plexUrl: PLEX_URL 
  });
});

// Get all music from Plex library
app.get('/api/plex/music', async (req, res) => {
  try {
    if (!PLEX_TOKEN) {
      return res.status(400).json({ 
        error: 'Plex token not configured. Set PLEX_TOKEN environment variable.' 
      });
    }

    // Get all library sections
    const librariesResponse = await axios.get(`${PLEX_URL}/library/sections`, {
      params: { 'X-Plex-Token': PLEX_TOKEN },
      timeout: 10000
    });

    // Find music library (type = 'artist')
    const musicLibrary = librariesResponse.data.MediaContainer.Directory?.find(
      dir => dir.type === 'artist'
    );

    if (!musicLibrary) {
      return res.status(404).json({ error: 'No music library found in Plex' });
    }

    // Get all tracks from music library
    const tracksResponse = await axios.get(
      `${PLEX_URL}/library/sections/${musicLibrary.key}/all`,
      {
        params: {
          'X-Plex-Token': PLEX_TOKEN,
          type: 10 // Type 10 = tracks
        },
        timeout: 30000
      }
    );

    const tracks = tracksResponse.data.MediaContainer.Metadata || [];

    // Format tracks for the game - use Part key from Media array
    const formattedTracks = tracks.map(track => {
      // Get the Part key from the track's Media array
      const partKey = track.Media?.[0]?.Part?.[0]?.key;
      
      return {
        id: track.ratingKey,
        title: track.title,
        artist: track.grandparentTitle || track.originalTitle || 'Unknown Artist',
        album: track.parentTitle || 'Unknown Album',
        year: track.parentYear || track.year || null,
        duration: track.duration || null,
        // Use the Part key directly
        audioPath: partKey || null,
        thumbPath: track.thumb || null
      };
    }).filter(track => track.audioPath); // Only include tracks with valid audio paths

    console.log(`Found ${formattedTracks.length} tracks in Plex library`);
    res.json({ tracks: formattedTracks });

  } catch (error) {
    console.error('Error fetching Plex music:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch music from Plex', 
      details: error.message 
    });
  }
});

// Proxy audio stream from Plex
app.get('/api/plex/audio/*', async (req, res) => {
  try {
    if (!PLEX_TOKEN) {
      return res.status(400).json({ error: 'Plex token not configured' });
    }

    // Get the path after /api/plex/audio/
    const audioPath = req.params[0];
    const cleanPath = audioPath.startsWith('/') ? audioPath : `/${audioPath}`;
    const fullUrl = `${PLEX_URL}${cleanPath}`;

    console.log(`Streaming audio from: ${fullUrl}`);
    console.log(`With token: ${PLEX_TOKEN.substring(0, 10)}...`);

    // Stream the audio file from Plex
    const response = await axios({
      method: 'GET',
      url: fullUrl,
      params: { 'X-Plex-Token': PLEX_TOKEN },
      responseType: 'stream',
      timeout: 30000
    });

    console.log(`Response status: ${response.status}`);

    // Set appropriate headers
    res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    res.setHeader('Accept-Ranges', 'bytes');

    // Pipe the stream to the response
    response.data.pipe(res);

  } catch (error) {
    console.error('Error streaming audio:', error.message);
    res.status(500).json({ 
      error: 'Failed to stream audio from Plex',
      details: error.message 
    });
  }
});

// Proxy image/thumbnail from Plex
app.get('/api/plex/thumb/*', async (req, res) => {
  try {
    if (!PLEX_TOKEN) {
      return res.status(400).json({ error: 'Plex token not configured' });
    }

    const thumbPath = req.params[0];
    const cleanPath = thumbPath.startsWith('/') ? thumbPath : `/${thumbPath}`;
    const fullUrl = `${PLEX_URL}${cleanPath}`;

    const response = await axios({
      method: 'GET',
      url: fullUrl,
      params: { 'X-Plex-Token': PLEX_TOKEN },
      responseType: 'stream',
      timeout: 10000
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    response.data.pipe(res);

  } catch (error) {
    console.error('Error fetching thumbnail:', error.message);
    res.status(500).send('Failed to fetch thumbnail');
  }
});

// Serve the game on root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Leaderboard file path
const LEADERBOARD_FILE = path.join(__dirname, 'data', 'leaderboard.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

// Load leaderboard
async function loadLeaderboard() {
  try {
    const data = await fs.readFile(LEADERBOARD_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

// Save leaderboard
async function saveLeaderboard(scores) {
  await ensureDataDir();
  await fs.writeFile(LEADERBOARD_FILE, JSON.stringify(scores, null, 2));
}

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await loadLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// Submit score
app.post('/api/leaderboard', async (req, res) => {
  try {
    const { name, score, difficulty, timer, totalTime } = req.body;
    
    if (!name || score === undefined || !difficulty || !timer || !totalTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const leaderboard = await loadLeaderboard();
    
    // Calculate composite score: (correct_answers * 100) - (total_time_in_seconds / 10)
    // This heavily weights correct answers but uses time as a tiebreaker
    const difficultyMultiplier = difficulty === 'easy' ? 1.0 : difficulty === 'medium' ? 1.5 : 2.0;
    const baseScore = (score * 100) - Math.floor(totalTime / 10);
    const compositeScore = Math.floor(baseScore * difficultyMultiplier);
    
    leaderboard.push({
      name: name.trim().substring(0, 20),
      score: score,
      difficulty: difficulty,
      timer: timer,
      totalTime: Math.floor(totalTime),
      compositeScore: compositeScore,
      date: new Date().toISOString()
    });
    
    // Sort by composite score (higher is better), then by score, then by time
    leaderboard.sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) {
        return b.compositeScore - a.compositeScore;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.totalTime - b.totalTime;
    });
    
    // Keep top 20
    const topScores = leaderboard.slice(0, 20);
    await saveLeaderboard(topScores);
    
    res.json({ success: true, leaderboard: topScores });
  } catch (error) {
    console.error('Error saving score:', error);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 Music Quiz Game server running on port ${PORT}`);
  console.log(`📺 Plex URL: ${PLEX_URL}`);
  console.log(`🔑 Plex Token: ${PLEX_TOKEN ? '✓ Configured' : '✗ Not configured'}`);
  console.log(`\n🌐 Access the game at: http://localhost:${PORT}`);
});
