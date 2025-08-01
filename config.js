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
    allowedUsers: process.env.PLEX_ALLOWED_USERS ? process.env.PLEX_ALLOWED_USERS.split(',').map(u => u.trim()) : [],
    allowedUserIds: process.env.PLEX_ALLOWED_USER_IDS ? process.env.PLEX_ALLOWED_USER_IDS.split(',').map(id => id.trim()) : []
  },
  server: {
    port: parseInt(process.env.WEBHOOK_PORT) || 3000,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    baseUrl: process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.WEBHOOK_PORT || 3000}`
  },
  app: {
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development'
  }
};

function validateConfig() {
  const required = [
    'TRAKT_CLIENT_ID',
    'TRAKT_CLIENT_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Variables de entorno faltantes:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('   Revisa tu archivo .env');
    process.exit(1);
  }
  
  console.log('✅ Configuración validada');
  
  if (CONFIG.plex.ownerOnly) {
    console.log('👤 Filtro: Solo propietario del servidor');
  } else if (CONFIG.plex.allowedUsers.length > 0) {
    console.log('👤 Usuarios permitidos:', CONFIG.plex.allowedUsers.join(', '));
  } else if (CONFIG.plex.allowedUserIds.length > 0) {
    console.log('👤 IDs de usuario permitidos:', CONFIG.plex.allowedUserIds.join(', '));
  } else {
    console.log('⚠️ Sin filtro de usuarios configurado - todos los usuarios sincronizarán');
  }
}

module.exports = { CONFIG, validateConfig };