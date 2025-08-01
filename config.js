require('dotenv').config();

const CONFIG = {
  trakt: {
    clientId: process.env.TRAKT_CLIENT_ID,
    clientSecret: process.env.TRAKT_CLIENT_SECRET,
    redirectUri: process.env.TRAKT_REDIRECT_URI || `${process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.WEBHOOK_PORT || 3000}`}/callback`,
    apiUrl: 'https://api.trakt.tv'
  },
  plex: {
    ownerOnly: process.env.PLEX_OWNER_ONLY === 'true',
    allowedUsers: process.env.PLEX_ALLOWED_USERS?.split(',').map(u => u.trim()).filter(Boolean) || [],
    allowedUserIds: process.env.PLEX_ALLOWED_USER_IDS?.split(',').map(id => id.trim()).filter(Boolean) || []
  },
  server: {
    port: parseInt(process.env.WEBHOOK_PORT) || 3000,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    baseUrl: process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.WEBHOOK_PORT || 3000}`
  }
};

function validateConfig() {
  const required = ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('   Check your .env file');
    process.exit(1);
  }
  
  console.log('✅ Configuration validated');
}

module.exports = { CONFIG, validateConfig };