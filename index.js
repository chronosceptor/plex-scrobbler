#!/usr/bin/env node

const { CONFIG, validateConfig } = require('./config');
const { loadTokens, hasValidToken } = require('./trakt');
const Server = require('./server');
const querystring = require('querystring');

class PlexTraktCLI {
  constructor() {
    this.server = new Server();
  }

  async init() {
    validateConfig();
    await loadTokens();
  }

  showHelp() {
    console.log(`
🎬 Plex-Trakt CLI

Commands:
  auth         Authenticate with Trakt.tv
  listen       Start webhook listener
  status       Show connection status
  help         Show this help message

Examples:
  npm run auth     # Authenticate with Trakt.tv
  npm run listen   # Start listening for Plex webhooks
    `);
  }

  async showStatus() {
    console.log(`
🔍 Status:
  ✅ Configuration: Valid
  🔑 Trakt Token: ${hasValidToken() ? '✅ Valid' : '❌ Missing'}
  📡 Webhook URL: ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}
    `);

    if (CONFIG.plex.ownerOnly) {
      console.log('  👤 User Filter: Owner only');
    } else if (CONFIG.plex.allowedUsers.length > 0) {
      console.log(`  👤 Allowed Users: ${CONFIG.plex.allowedUsers.join(', ')}`);
    } else if (CONFIG.plex.allowedUserIds.length > 0) {
      console.log(`  👤 Allowed User IDs: ${CONFIG.plex.allowedUserIds.join(', ')}`);
    } else {
      console.log('  ⚠️  User Filter: None (all users will sync)');
    }
  }

  async authenticate() {
    console.log('🔐 Starting Trakt.tv authentication...');
    
    const authUrl = `${CONFIG.trakt.apiUrl}/oauth/authorize?` +
      querystring.stringify({
        response_type: 'code',
        client_id: CONFIG.trakt.clientId,
        redirect_uri: CONFIG.trakt.redirectUri
      });

    console.log(`
Please open this URL in your browser to authenticate:
${authUrl}

Waiting for authentication...
    `);

    this.server.start();
    
    process.on('SIGINT', () => {
      console.log('\n❌ Authentication cancelled');
      this.server.stop();
      process.exit(0);
    });
  }

  async startListener() {
    if (!hasValidToken()) {
      console.log('❌ No valid Trakt token found. Please run authentication first:');
      console.log('npm run auth');
      return;
    }

    console.log('🎧 Starting Plex webhook listener...');
    console.log(`📡 Listening on: ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}`);
    console.log('');
    console.log('Configure this URL in Plex:');
    console.log('  1. Go to Plex Web → Settings → Webhooks');
    console.log('  2. Click "+" to add a new webhook');
    console.log(`  3. Enter: ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}`);
    console.log('  4. Save and test by playing media');
    console.log('');
    console.log('Press Ctrl+C to stop...');

    this.server.start();

    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down webhook listener...');
      this.server.stop();
      process.exit(0);
    });

    process.stdin.resume();
  }

  async run(command) {
    await this.init();

    switch (command) {
      case 'auth':
        await this.authenticate();
        break;
      case 'listen':
        await this.startListener();
        break;
      case 'status':
        await this.showStatus();
        break;
      case 'help':
      default:
        this.showHelp();
        break;
    }
  }
}

// Run CLI
const cli = new PlexTraktCLI();
const command = process.argv[2] || 'help';

cli.run(command).catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});