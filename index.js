const express = require('express');
const axios = require('axios');
const multer = require('multer');
const querystring = require('querystring');
require('dotenv').config();

const app = express();
const upload = multer();

// Configuración desde variables de entorno
const CONFIG = {
  trakt: {
    clientId: process.env.TRAKT_CLIENT_ID,
    clientSecret: process.env.TRAKT_CLIENT_SECRET,
    redirectUri: process.env.TRAKT_REDIRECT_URI || `http://localhost:${process.env.SERVER_PORT || 3000}/callback`,
    apiUrl: 'https://api.trakt.tv'
  },
  plex: {
    ownerOnly: process.env.PLEX_OWNER_ONLY === 'true',
    allowedUsers: process.env.PLEX_ALLOWED_USERS ? process.env.PLEX_ALLOWED_USERS.split(',').map(u => u.trim()) : [],
    allowedUserIds: process.env.PLEX_ALLOWED_USER_IDS ? process.env.PLEX_ALLOWED_USER_IDS.split(',').map(id => id.trim()) : []
  },
  server: {
    port: parseInt(process.env.SERVER_PORT) || 3000,
    webhookPath: process.env.WEBHOOK_PATH || '/plex-webhook',
    baseUrl: process.env.BASE_URL || `http://localhost:${process.env.SERVER_PORT || 3000}`
  },
  app: {
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development'
  }
};

// Variables globales para tokens
let traktAccessToken = null;
let traktRefreshToken = null;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Validar configuración al inicio
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

  // Mostrar configuración de usuarios (sin datos sensibles)
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

// PASO 1: Autenticación con Trakt.tv
app.get('/auth', (req, res) => {
  const authUrl = `${CONFIG.trakt.apiUrl}/oauth/authorize?` +
    querystring.stringify({
      response_type: 'code',
      client_id: CONFIG.trakt.clientId,
      redirect_uri: CONFIG.trakt.redirectUri
    });

  res.redirect(authUrl);
});

// Callback de autenticación
app.get('/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const tokenResponse = await axios.post(`${CONFIG.trakt.apiUrl}/oauth/token`, {
      code,
      client_id: CONFIG.trakt.clientId,
      client_secret: CONFIG.trakt.clientSecret,
      redirect_uri: CONFIG.trakt.redirectUri,
      grant_type: 'authorization_code'
    });

    traktAccessToken = tokenResponse.data.access_token;
    traktRefreshToken = tokenResponse.data.refresh_token;

    console.log('✅ Autenticación exitosa con Trakt.tv');
    res.send('¡Autenticación exitosa! Ya puedes cerrar esta ventana.');
  } catch (error) {
    console.error('❌ Error en autenticación:', error.response?.data || error.message);
    res.status(500).send('Error en la autenticación');
  }
});

// PASO 2: Webhook de Plex
app.post(CONFIG.server.webhookPath, upload.single('thumb'), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);

    console.log('📡 Webhook recibido:', {
      event: payload.event,
      user: payload.Account?.title,
      userId: payload.Account?.id,
      owner: payload.owner,
      media: payload.Metadata?.title
    });

    // FILTRO DE USUARIO - Solo procesar TU usuario
    if (!isAllowedUser(payload)) {
      console.log('⚠️ Usuario no autorizado, ignorando evento');
      return res.status(200).send('Usuario no autorizado');
    }

    // Solo procesar eventos de reproducción
    if (!['media.play', 'media.pause', 'media.resume', 'media.stop', 'media.scrobble'].includes(payload.event)) {
      return res.status(200).send('Evento ignorado');
    }

    // Solo procesar series y películas
    if (!['episode', 'movie'].includes(payload.Metadata?.type)) {
      return res.status(200).send('Tipo de media no soportado');
    }

    await handlePlexEvent(payload);
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error procesando webhook:', error);
    res.status(500).send('Error interno');
  }
});

// FUNCIÓN PARA VERIFICAR SI EL USUARIO ESTÁ AUTORIZADO
function isAllowedUser(payload) {
  const account = payload.Account;

  if (!account) {
    console.log('⚠️ Sin información de cuenta en el payload');
    return false;
  }

  // Método 1: Solo el propietario del servidor
  if (CONFIG.plex.ownerOnly && payload.owner) {
    console.log('✅ Usuario autorizado (propietario del servidor)');
    return true;
  }

  // Método 2: Lista de nombres de usuario permitidos
  if (CONFIG.plex.allowedUsers && CONFIG.plex.allowedUsers.length > 0) {
    const isAllowed = CONFIG.plex.allowedUsers.includes(account.title);
    if (isAllowed) {
      console.log(`✅ Usuario autorizado por nombre: ${account.title}`);
      return true;
    }
  }

  // Método 3: Lista de IDs de usuario permitidos (más seguro)
  if (CONFIG.plex.allowedUserIds && CONFIG.plex.allowedUserIds.length > 0) {
    const isAllowed = CONFIG.plex.allowedUserIds.includes(String(account.id));
    if (isAllowed) {
      console.log(`✅ Usuario autorizado por ID: ${account.id}`);
      return true;
    }
  }

  console.log(`❌ Usuario NO autorizado: ${account.title} (ID: ${account.id})`);
  return false;
}

// PASO 3: Procesar eventos de Plex
async function handlePlexEvent(payload) {
  const { event, Metadata } = payload;

  if (!traktAccessToken) {
    console.log('⚠️ No hay token de Trakt disponible');
    return;
  }

  try {
    let traktData;

    if (Metadata.type === 'episode') {
      // Para series
      traktData = {
        shows: [{
          title: Metadata.grandparentTitle,
          year: Metadata.grandparentYear,
          seasons: [{
            number: Metadata.parentIndex,
            episodes: [{
              number: Metadata.index,
              title: Metadata.title
            }]
          }]
        }]
      };
    } else if (Metadata.type === 'movie') {
      // Para películas
      traktData = {
        movies: [{
          title: Metadata.title,
          year: Metadata.year
        }]
      };
    }

    // Mapear eventos de Plex a acciones de Trakt
    const eventMapping = {
      'media.play': 'start',
      'media.resume': 'start',
      'media.pause': 'pause',
      'media.stop': 'stop',
      'media.scrobble': 'stop' // Scrobble indica que se completó
    };

    const traktAction = eventMapping[event];
    if (!traktAction) return;

    // Enviar a Trakt
    await sendToTrakt(traktAction, traktData, Metadata);

  } catch (error) {
    console.error('❌ Error enviando a Trakt:', error.response?.data || error.message);
  }
}

// PASO 4: Enviar datos a Trakt.tv
async function sendToTrakt(action, data, metadata) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${traktAccessToken}`,
    'trakt-api-version': '2',
    'trakt-api-key': CONFIG.trakt.clientId
  };

  let endpoint;
  let payload = { ...data };

  // Determinar endpoint según la acción
  switch (action) {
    case 'start':
      endpoint = '/scrobble/start';
      payload.progress = Math.round((metadata.viewOffset / metadata.duration) * 100) || 0;
      break;
    case 'pause':
      endpoint = '/scrobble/pause';
      payload.progress = Math.round((metadata.viewOffset / metadata.duration) * 100) || 0;
      break;
    case 'stop':
      endpoint = '/scrobble/stop';
      payload.progress = Math.round((metadata.viewOffset / metadata.duration) * 100) || 100;
      break;
    default:
      return;
  }

  try {
    const response = await axios.post(`${CONFIG.trakt.apiUrl}${endpoint}`, payload, { headers });

    console.log(`✅ ${action.toUpperCase()} enviado a Trakt:`, {
      title: metadata.title || metadata.grandparentTitle,
      progress: payload.progress + '%',
      status: response.status
    });

  } catch (error) {
    if (error.response?.status === 401) {
      console.log('🔄 Token expirado, renovando...');
      await refreshTraktToken();
      // Reintentar
      await sendToTrakt(action, data, metadata);
    } else {
      throw error;
    }
  }
}

// PASO 5: Renovar token de Trakt
async function refreshTraktToken() {
  try {
    const response = await axios.post(`${CONFIG.trakt.apiUrl}/oauth/token`, {
      refresh_token: traktRefreshToken,
      client_id: CONFIG.trakt.clientId,
      client_secret: CONFIG.trakt.clientSecret,
      grant_type: 'refresh_token'
    });

    traktAccessToken = response.data.access_token;
    traktRefreshToken = response.data.refresh_token;

    console.log('✅ Token de Trakt renovado');
  } catch (error) {
    console.error('❌ Error renovando token:', error.response?.data || error.message);
  }
}

// Ruta de prueba
app.get('/', (req, res) => {
  const userConfig = CONFIG.plex.ownerOnly ? 'Solo propietario' :
    CONFIG.plex.allowedUsers?.length ? `Usuarios: ${CONFIG.plex.allowedUsers.join(', ')}` :
      CONFIG.plex.allowedUserIds?.length ? `IDs: ${CONFIG.plex.allowedUserIds.join(', ')}` :
        'Sin filtro configurado';

  res.send(`
    <h1>Plex-Trakt Sync</h1>
    <p>Estado: ${traktAccessToken ? '✅ Conectado' : '❌ No autenticado'}</p>
    <p>Filtro de usuarios: ${userConfig}</p>
    <p>Entorno: ${CONFIG.app.nodeEnv}</p>
    <p><a href="/auth">Autenticar con Trakt.tv</a></p>
    <p>Webhook URL: <code>${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}</code></p>
    <hr>
    <h3>Ayuda para configurar filtro de usuario:</h3>
    <p>Para encontrar tu información de usuario, revisa los logs cuando reproduzcas algo.</p>
    <p>Verás algo como: <code>user: "Tu Nombre", userId: "12345"</code></p>
  `);
});

// Ruta para obtener información de usuario (debug)
app.get('/debug/last-event', (req, res) => {
  res.send(`
    <h2>Último evento recibido</h2>
    <p>Revisa la consola del servidor para ver los detalles del usuario.</p>
    <p>Busca líneas como:</p>
    <pre>📡 Webhook recibido: {
  event: 'media.play',
  user: 'Tu Nombre de Usuario',
  userId: '12345',
  owner: true/false,
  media: 'Nombre de la serie/película'
}</pre>
    <p><a href="/">← Volver</a></p>
  `);
});

// Iniciar servidor
app.listen(CONFIG.server.port, () => {
  validateConfig();
  console.log(`🚀 Servidor iniciado en puerto ${CONFIG.server.port}`);
  console.log(`📡 Webhook URL: ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}`);
  console.log(`🔐 Autenticación: ${CONFIG.server.baseUrl}/auth`);
});

module.exports = app;