# Plex Music Trivia Game

A web-based music quiz game that uses your Plex music library. Players listen to song clips and try to guess the correct song from multiple choice options.

## Features

- Multiple difficulty levels with configurable clip lengths and timers
- Cross-device leaderboard with persistent storage
- Smart ranking system based on correct answers and completion time
- Real-time audio streaming from Plex Media Server
- Mobile-friendly responsive design
- 10 rounds per game with 4 multiple choice options

## Requirements

- Docker and Docker Compose
- Plex Media Server with at least one music library
- Plex authentication token

## Quick Start

### 1. Get Your Plex Token

To find your Plex token:

1. Log into Plex Web App at https://app.plex.tv
2. Play any media item
3. Click the three dots menu and select "Get Info" then "View XML"
4. Look at the URL - you'll see `X-Plex-Token=YOUR_TOKEN`
5. Copy the token value

For more details: https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/

I beleive if you have Plex Desktop you can find it in 'C:\Users\[USER]\AppData\Local\Plex\Plex Media Server\Preferences.xml' too.



### 2. Clone and Configure
```bash
git clone https://github.com/whosliam/Plex-Music-Trivia-Game.git
cd Plex-Music-Trivia-Game
```

Edit `docker-compose.yml` and replace the placeholder values:
```yaml
environment:
  - PLEX_URL=http://192.168.1.100:32400
  - PLEX_TOKEN=your_actual_token_here
```

### 3. Run the Application
```bash
docker-compose up -d
```

Access the game at: `http://localhost:3000`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLEX_URL` | Your Plex server URL | `http://localhost:32400` |
| `PLEX_TOKEN` | Your Plex authentication token | (required) |
| `PORT` | Server port | `3000` |

### Difficulty Presets

| Difficulty | Clip Length | Answer Time |
|------------|-------------|-------------|
| Easy | 15 seconds | 45 seconds |
| Medium | 10 seconds | 30 seconds |
| Hard | 5 seconds | 20 seconds |

Custom timer can be configured from 10 to 60 seconds on the start screen.

## Leaderboard

The leaderboard is stored server-side and shared across all devices on your network. Scores are ranked by a composite score that considers both correct answers and completion time:
```
Composite Score = (Correct Answers × 100) - (Total Time ÷ 10)
```

This heavily weights correct answers while using completion time as a tiebreaker.

Example rankings:
- 10/10 in 60 seconds = 994 points
- 10/10 in 120 seconds = 988 points
- 8/10 in 60 seconds = 794 points

Data is persisted in `./data/leaderboard.json` via Docker volume mount.

## Network Access

To access the game from other devices on your network:

1. Find your host machine's IP address
2. Configure firewall to allow port 3000 (if needed)
3. Access from other devices using: `http://YOUR_HOST_IP:3000`

Example firewall configuration for Ubuntu:
```bash
sudo ufw allow 3000/tcp
```

## Troubleshooting

### No songs loading

- Verify Plex Media Server is running
- Check that `PLEX_URL` is correct and accessible
- Confirm `PLEX_TOKEN` is valid
- Ensure you have at least one music library in Plex with songs

### Audio not playing

- Check browser console for errors
- Verify Plex server is accessible from Docker container
- Confirm audio files are accessible in your Plex library
- Check Docker logs: `docker-compose logs`

### Leaderboard not saving

- Verify `./data` directory exists and has write permissions
- Check Docker logs for errors: `docker-compose logs`
- Ensure volume mount is configured in `docker-compose.yml`

### Port already in use

Change the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"
```

Then access at `http://localhost:8080`

## Development

### Project Structure
```
.
├── server.js              # Express server with Plex API integration
├── public/
│   └── index.html         # React frontend (single file)
├── data/                  # Leaderboard storage (created at runtime)
├── docker-compose.yml     # Docker configuration
├── Dockerfile            # Container build instructions
├── package.json          # Node.js dependencies
├── .env.example          # Environment variable template
└── .gitignore            # Git ignore rules
```

### Running Locally Without Docker
```bash
npm install

export PLEX_URL="http://your-plex-server:32400"
export PLEX_TOKEN="your-token"

node server.js
```

Access at `http://localhost:3000`

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plex/music` | GET | Fetch all tracks from Plex library |
| `/api/plex/audio/*` | GET | Stream audio from Plex |
| `/api/leaderboard` | GET | Get leaderboard data |
| `/api/leaderboard` | POST | Submit new score |
| `/api/health` | GET | Health check |

## Security Considerations

- Never commit your Plex token to version control
- The token provides full access to your Plex server
- Only expose the application on your local network
- Do not expose port 3000 to the internet without proper authentication
- Consider using environment variables or `.env` file for configuration

## Docker Commands
```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Rebuild after code changes
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Remove everything including volumes
docker-compose down -v
```

## License

MIT License - See LICENSE file for details


## Built With

- Node.js + Express
- React (via CDN)
- Tailwind CSS
- Plex Media Server API
- Docker