# Plex-Trakt Scrobbler

A simple CLI tool to automatically sync your Plex viewing activity to Trakt.tv using webhooks.

## Features

- 🎬 Automatically scrobbles movies and TV episodes from Plex to Trakt
- 🔄 Real-time syncing via Plex webhooks
- 👤 User filtering (owner only, specific users, or all users)
- 🔐 Secure OAuth authentication with Trakt.tv
- 📊 Progress tracking for pause/resume functionality

## Quick Setup

1. **Clone and install**
   ```bash
   git clone <repository-url>
   cd plex-trakt
   npm install
   ```

2. **Create Trakt.tv application**
   - Go to [Trakt.tv API Apps](https://trakt.tv/oauth/applications)
   - Create a new application
   - Set redirect URI to: `http://localhost:3000/callback` (or your server URL)

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Trakt.tv credentials
   ```

4. **Authenticate with Trakt**
   ```bash
   npm run auth
   ```

5. **Start the webhook listener**
   ```bash
   npm run listen
   ```

6. **Configure Plex webhook**
   - Go to Plex Web → Settings → Webhooks
   - Add webhook URL: `http://localhost:3000/webhook`

## Environment Variables

Create a `.env` file with these required variables:

```env
# Required - Get from https://trakt.tv/oauth/applications
TRAKT_CLIENT_ID=your_client_id
TRAKT_CLIENT_SECRET=your_client_secret

# Optional - Server configuration
WEBHOOK_PORT=3000
WEBHOOK_BASE_URL=http://localhost:3000
WEBHOOK_PATH=/webhook

# Optional - User filtering
PLEX_OWNER_ONLY=true
# OR
PLEX_ALLOWED_USERS=user1,user2,user3
# OR
PLEX_ALLOWED_USER_IDS=123,456,789
```

## Commands

```bash
npm run auth     # Authenticate with Trakt.tv
npm run listen   # Start webhook listener  
npm run start    # Show help
node index.js status  # Show connection status
```

## User Filtering

Control who can scrobble to your Trakt account:

- **Owner only**: `PLEX_OWNER_ONLY=true`
- **Specific users**: `PLEX_ALLOWED_USERS=john,jane,bob`
- **Specific user IDs**: `PLEX_ALLOWED_USER_IDS=123,456,789`
- **All users**: Leave all filtering options empty

## How It Works

1. Plex sends webhook events when users play/pause/stop media
2. The app receives these webhooks and processes them
3. It searches Trakt.tv for the movie/show to get proper metadata
4. It sends scrobble events to Trakt.tv with viewing progress
5. Trakt.tv records the viewing activity in your account

## File Structure

```
plex-trakt/
├── index.js          # Main CLI application
├── server.js         # HTTP server and webhook handler
├── trakt.js          # Trakt.tv API client and token management
├── config.js         # Configuration and validation
├── package.json      # Dependencies and scripts
└── .env              # Environment variables (create this)
```

## Troubleshooting

**Authentication fails:**
- Check your Trakt.tv client ID and secret
- Ensure redirect URI matches your webhook base URL + `/callback`

**Webhooks not received:**
- Verify the webhook URL is accessible from Plex
- Check firewall settings if using external access
- Test the webhook URL in a browser - it should show a setup page

**Scrobbling fails:**
- Check that content exists on Trakt.tv
- Verify your Trakt token is valid: `node index.js status`
- Look for error messages in the console output

## Development

The code is structured for simplicity:

- **trakt.js**: All Trakt.tv API interactions and token management
- **server.js**: HTTP server, webhook processing, and user authorization  
- **index.js**: CLI interface and main application logic
- **config.js**: Environment configuration and validation

## License

ISC