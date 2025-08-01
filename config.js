require('dotenv').config();

const CONFIG = {
  trakt: {
    clientId: process.env.TRAKT_CLIENT_ID,
    clientSecret: process.env.TRAKT_CLIENT_SECRET,
    redirectUri: process.env.TRAKT_REDIRECT_URI || `${process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.WEBHOOK_PORT || 3000}`}/callback`,
    apiUrl: 'https://api.trakt.tv'
  },
  plex: {
    allowedUser: process.env.PLEX_ALLOWED_USER?.trim() || null
  },
  server: {
    port: parseInt(process.env.WEBHOOK_PORT) || parseInt(process.env.PORT) || 3000,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    baseUrl: process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.WEBHOOK_PORT || process.env.PORT || 3000}`
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