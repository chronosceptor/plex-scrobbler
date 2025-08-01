const express = require('express');
const axios = require('axios');
const multer = require('multer');
const querystring = require('querystring');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer();

// Archivo para persistir tokens
const TOKEN_FILE = path.join(__dirname, 'trakt_tokens.json');

// Variables globales para tokens
let traktAccessToken = null;
let traktRefreshToken = null;

// Configuración desde variables de entorno
const CONFIG = {
  trakt: {
    clientId: process.env.TRAKT_CLIENT_ID,
    clientSecret: process.env.TRAKT_CLIENT_SECRET,
    redirectUri: process.env.TRAKT_REDIRECT_URI || `${process.env.BASE_URL || `http://localhost:${process.env.SERVER_PORT || 3000}`}/callback`,
    apiUrl: 'https://api.trakt.tv'
  },
  plex: {
    ownerOnly: process.env.PLEX_OWNER_ONLY === 'true',
    allowedUsers: process.env.PLEX_ALLOWED_USERS ? process.env.PLEX_ALLOWED_USERS.split(',').map(u => u.trim()) : [],
    allowedUserIds: process.env.PLEX_ALLOWED_USER_IDS ? process.env.PLEX_ALLOWED_USER_IDS.split(',').map(id => id.trim()) : []
  },
  server: {
    port: parseInt(process.env.SERVER_PORT) || 3000,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    baseUrl: process.env.BASE_URL || `http://localhost:${process.env.SERVER_PORT || 3000}`,
    basePath: process.env.BASE_PATH || ''
  },
  app: {
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development'
  }
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Funciones para manejar tokens
async function saveTokens(accessToken, refreshToken) {
  try {
    const tokens = {
      accessToken,
      refreshToken,
      timestamp: Date.now()
    };
    await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log('✅ Tokens guardados en archivo');
  } catch (error) {
    console.error('❌ Error guardando tokens:', error.message);
  }
}

async function loadTokens() {
  try {
    const data = await fs.readFile(TOKEN_FILE, 'utf8');
    const tokens = JSON.parse(data);
    traktAccessToken = tokens.accessToken;
    traktRefreshToken = tokens.refreshToken;
    console.log('✅ Tokens cargados desde archivo');
    return true;
  } catch (error) {
    console.log('ℹ️ No se encontraron tokens guardados');
    return false;
  }
}

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
    
    // Guardar tokens en archivo
    await saveTokens(traktAccessToken, traktRefreshToken);
    
    console.log('✅ Autenticación exitosa con Trakt.tv');
    res.send(`
      <h1>¡Autenticación exitosa!</h1>
      <p>Tu Plex Scrobbler está ahora conectado con Trakt.tv</p>
      <p><a href="/">← Volver al inicio</a></p>
    `);
  } catch (error) {
    console.error('❌ Error en autenticación:', error.response?.data || error.message);
    res.status(500).send('Error en la autenticación');
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

// PASO 2: Webhook de Plex
app.post(CONFIG.server.webhookPath, upload.single('thumb'), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);
    
    console.log('📡 Webhook recibido - DATOS COMPLETOS:', {
      event: payload.event,
      user: payload.Account?.title,
      userId: payload.Account?.id,
      owner: payload.owner,
      // Información detallada para debugging
      episodeTitle: payload.Metadata?.title,           // "The House of Seven Gargoyles"
      seriesTitle: payload.Metadata?.grandparentTitle, // "Jonny Quest" 
      type: payload.Metadata?.type,                    // "episode"
      season: payload.Metadata?.parentIndex,           // 1
      episode: payload.Metadata?.index,                // 23
      episodeYear: payload.Metadata?.year,             // 1965 (año del episodio)
      seriesYear: payload.Metadata?.grandparentYear,   // null o undefined
      originallyAvailableAt: payload.Metadata?.originallyAvailableAt, // Fecha completa
      guid: payload.Metadata?.guid,
      // Datos adicionales que pueden ser útiles
      duration: payload.Metadata?.duration,
      viewOffset: payload.Metadata?.viewOffset
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

// Ruta GET para testing del webhook (opcional)
app.get(CONFIG.server.webhookPath, (req, res) => {
  res.send(`
    <style>
      body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
      .status { padding: 15px; border-radius: 8px; margin: 20px 0; }
      .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      code { background: #f8f9fa; padding: 4px 8px; border-radius: 4px; }
    </style>
    <h1>🎬 Plex Webhook Endpoint</h1>
    <div class="status success">
      <strong>✅ Webhook funcionando correctamente</strong><br>
      Este endpoint está listo para recibir eventos de Plex.
    </div>
    
    <h3>📋 Información:</h3>
    <p><strong>URL para Plex:</strong><br>
    <code>${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}</code></p>
    
    <p><strong>Método:</strong> POST</p>
    <p><strong>Content-Type:</strong> multipart/form-data</p>
    
    <h3>🔧 Para configurar en Plex:</h3>
    <ol>
      <li>Ve a <strong>Plex Web → Configuración → Webhooks</strong></li>
      <li>Haz clic en <strong>"+"</strong></li>
      <li>Pega la URL de arriba</li>
      <li>Guarda y reproduce algo para probarlo</li>
    </ol>
    
    <p><a href="${CONFIG.server.baseUrl}/">← Volver al dashboard</a></p>
  `);
});

// Función para buscar una serie en Trakt y obtener el año correcto
async function searchShowInTrakt(showTitle) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': CONFIG.trakt.clientId
    };
    
    const searchUrl = `${CONFIG.trakt.apiUrl}/search/show?query=${encodeURIComponent(showTitle)}`;
    const response = await axios.get(searchUrl, { headers });
    
    if (response.data && response.data.length > 0) {
      // Tomar el primer resultado (más relevante)
      const firstResult = response.data[0];
      if (firstResult.show) {
        console.log(`🔍 Serie encontrada en Trakt: "${firstResult.show.title}" (${firstResult.show.year})`);
        return {
          title: firstResult.show.title,
          year: firstResult.show.year,
          ids: firstResult.show.ids
        };
      }
    }
    
    console.log(`❌ No se encontró "${showTitle}" en la búsqueda de series en Trakt`);
    return null;
  } catch (error) {
    console.error('❌ Error buscando serie en Trakt:', error.response?.status, error.response?.data);
    return null;
  }
}

// Función para verificar si un episodio específico existe en Trakt
async function checkEpisodeInTrakt(showSlug, season, episode) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': CONFIG.trakt.clientId
    };
    
    const episodeUrl = `${CONFIG.trakt.apiUrl}/shows/${showSlug}/seasons/${season}/episodes/${episode}`;
    console.log(`🔍 Verificando episodio: ${episodeUrl}`);
    
    const response = await axios.get(episodeUrl, { headers });
    
    if (response.data && response.data.title) {
      console.log(`✅ Episodio encontrado: "${response.data.title}"`);
      return true;
    }
    
    return false;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`❌ Episodio ${season}x${episode} no existe en Trakt`);
    } else {
      console.log(`❌ Error verificando episodio:`, error.response?.status);
    }
    return false;
  }
}
async function searchMovieInTrakt(movieTitle) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': CONFIG.trakt.clientId
    };
    
    const searchUrl = `${CONFIG.trakt.apiUrl}/search/movie?query=${encodeURIComponent(movieTitle)}`;
    console.log(`🔍 Buscando película: ${searchUrl}`);
    const response = await axios.get(searchUrl, { headers });
    
    if (response.data && response.data.length > 0) {
      // Mostrar los primeros resultados para debug
      console.log(`📋 Encontradas ${response.data.length} películas, primeros 3 resultados:`);
      response.data.slice(0, 3).forEach((result, index) => {
        if (result.movie) {
          console.log(`   ${index + 1}. "${result.movie.title}" (${result.movie.year}) - Score: ${result.score || 'N/A'}`);
        }
      });
      
      // Tomar el primer resultado (más relevante)
      const firstResult = response.data[0];
      if (firstResult.movie) {
        console.log(`✅ Usando: "${firstResult.movie.title}" (${firstResult.movie.year})`);
        return {
          title: firstResult.movie.title,
          year: firstResult.movie.year,
          ids: firstResult.movie.ids
        };
      }
    }
    
    console.log(`❌ No se encontró "${movieTitle}" en la búsqueda de películas en Trakt`);
    return null;
  } catch (error) {
    console.error('❌ Error buscando película en Trakt:', error.response?.status, error.response?.data);
    return null;
  }
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
      // Para series - validar datos requeridos
      if (!Metadata.grandparentTitle || !Metadata.parentIndex || !Metadata.index) {
        console.log('❌ Datos incompletos para episodio:', {
          show: Metadata.grandparentTitle,
          season: Metadata.parentIndex,
          episode: Metadata.index,
          title: Metadata.title
        });
        return;
      }
      
      // Buscar la serie en Trakt para obtener el año correcto
      console.log(`🔍 Buscando "${Metadata.grandparentTitle}" en Trakt...`);
      const traktShow = await searchShowInTrakt(Metadata.grandparentTitle);
      
      let finalYear;
      let finalTitle = Metadata.grandparentTitle;
      let showSlug = null;
      
      if (traktShow) {
        // Usar datos de Trakt
        finalYear = traktShow.year;
        finalTitle = traktShow.title;
        showSlug = traktShow.ids?.slug;
        console.log(`✅ Usando datos de Trakt: "${finalTitle}" (${finalYear})`);
        
        // Verificar si el episodio específico existe
        if (showSlug) {
          const episodeExists = await checkEpisodeInTrakt(showSlug, Metadata.parentIndex, Metadata.index);
          if (!episodeExists) {
            console.log(`⚠️ El episodio ${Metadata.parentIndex}x${Metadata.index} no existe en Trakt`);
            console.log(`💡 Se intentará scrobble genérico de la serie completa`);
          }
        }
        
      } else {
        // Fallback a lógica anterior
        if (Metadata.grandparentYear) {
          finalYear = parseInt(Metadata.grandparentYear);
          console.log(`📅 Usando año de la serie: ${finalYear}`);
        } else if (Metadata.year) {
          finalYear = parseInt(Metadata.year);
          console.log(`📅 Usando año del episodio: ${finalYear}`);
        } else {
          finalYear = null;
          console.log(`⚠️ Sin información de año disponible`);
        }
      }
      
      traktData = {
        shows: [{
          title: finalTitle,
          // Incluir año si lo tenemos
          ...(finalYear ? { year: finalYear } : {}),
          seasons: [{
            number: parseInt(Metadata.parentIndex),
            episodes: [{
              number: parseInt(Metadata.index),
              title: Metadata.title
            }]
          }]
        }]
      };
      
      console.log('📺 Datos de serie preparados:', {
        originalSeries: Metadata.grandparentTitle,
        finalSeries: finalTitle,    
        episodeYear: Metadata.year || 'N/A',
        seriesYear: Metadata.grandparentYear || 'N/A', 
        yearUsed: finalYear || 'Sin año',
        season: Metadata.parentIndex,         
        episode: Metadata.index,              
        episodeTitle: Metadata.title
      });
      
    } else if (Metadata.type === 'movie') {
      // Para películas - validar datos requeridos
      if (!Metadata.title) {
        console.log('❌ Datos incompletos para película:', {
          title: Metadata.title,
          year: Metadata.year
        });
        return;
      }
      
      // Buscar la película en Trakt para obtener datos correctos
      console.log(`🔍 Buscando película "${Metadata.title}" en Trakt...`);
      const traktMovie = await searchMovieInTrakt(Metadata.title);
      
      let finalYear;
      let finalTitle = Metadata.title;
      
      if (traktMovie) {
        // Usar datos de Trakt
        finalYear = traktMovie.year;
        finalTitle = traktMovie.title; // Por si hay ligeras diferencias en el título
        console.log(`✅ Usando datos de Trakt: "${finalTitle}" (${finalYear})`);
      } else {
        // Fallback a datos de Plex
        finalYear = parseInt(Metadata.year) || null;
        console.log(`📅 Usando datos de Plex: "${finalTitle}" (${finalYear || 'sin año'})`);
      }
      
      traktData = {
        movies: [{
          title: finalTitle,
          year: finalYear
        }]
      };
      
      console.log('🎬 Datos de película preparados:', {
        originalTitle: Metadata.title,
        finalTitle: finalTitle,
        originalYear: Metadata.year,
        finalYear: finalYear
      });
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
    if (!traktAction) {
      console.log('⚠️ Evento no mapeado:', event);
      return;
    }
    
    // Enviar a Trakt
    await sendToTrakt(traktAction, traktData, Metadata);
    
  } catch (error) {
    console.error('❌ Error procesando evento de Plex:', error.message);
  }
}

// PASO 4: Enviar datos a Trakt.tv
async function sendToTrakt(action, data, metadata) {
  // Validar que tenemos un token válido
  if (!traktAccessToken) {
    console.log('❌ No hay token de acceso disponible');
    return;
  }
  
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
      if (metadata.viewOffset && metadata.duration) {
        payload.progress = Math.round((metadata.viewOffset / metadata.duration) * 100);
      } else {
        payload.progress = 0;
      }
      break;
    case 'pause':
      endpoint = '/scrobble/pause';
      if (metadata.viewOffset && metadata.duration) {
        payload.progress = Math.round((metadata.viewOffset / metadata.duration) * 100);
      } else {
        payload.progress = 0;
      }
      break;
    case 'stop':
      endpoint = '/scrobble/stop';
      if (metadata.viewOffset && metadata.duration) {
        payload.progress = Math.round((metadata.viewOffset / metadata.duration) * 100);
      } else {
        payload.progress = 100; // Asumir completado si no hay datos
      }
      break;
    default:
      console.log('❌ Acción no reconocida:', action);
      return;
  }
  
  try {
    console.log(`🔄 Enviando ${action.toUpperCase()} a Trakt:`, {
      endpoint: `${CONFIG.trakt.apiUrl}${endpoint}`,
      payload: JSON.stringify(payload, null, 2)
    });
    
    const response = await axios.post(`${CONFIG.trakt.apiUrl}${endpoint}`, payload, { headers });
    
    console.log(`✅ ${action.toUpperCase()} enviado a Trakt exitosamente:`, {
      title: metadata.title || metadata.grandparentTitle,
      progress: payload.progress + '%',
      status: response.status,
      action: response.data?.action || 'unknown',
      traktResponse: response.data
    });
    
  } catch (error) {
    console.error(`❌ Error enviando a Trakt (${action}):`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: `${CONFIG.trakt.apiUrl}${endpoint}`,
      headers: { ...headers, Authorization: '[HIDDEN]' },
      sentPayload: payload,
      mediaInfo: {
        title: metadata.title || metadata.grandparentTitle,
        type: metadata.type,
        year: metadata.year || metadata.grandparentYear,
        season: metadata.parentIndex,
        episode: metadata.index
      }
    });
    
    // Manejar diferentes tipos de errores
    if (error.response?.status === 401) {
      console.log('🔄 Token expirado, renovando...');
      await refreshTraktToken();
      console.log('🔄 Reintentando con token renovado...');
      await sendToTrakt(action, data, metadata);
    } else if (error.response?.status === 404) {
      console.log(`⚠️ ERROR 404 - Contenido no encontrado en Trakt:`);
      if (metadata.type === 'episode') {
        console.log(`   🎭 Serie buscada: "${metadata.grandparentTitle}"`);
        console.log(`   📺 Episodio: ${metadata.parentIndex}x${metadata.index} - "${metadata.title}"`);
        console.log(`   📅 Año de la serie: ${metadata.grandparentYear || 'N/A'}`);
        console.log(`   🔍 Buscar en: https://trakt.tv/search?query=${encodeURIComponent(metadata.grandparentTitle)}`);
      } else {
        console.log(`   🎬 Película: "${metadata.title}"`);
        console.log(`   📅 Año: ${metadata.year || 'N/A'}`);
        console.log(`   🔍 Buscar en: https://trakt.tv/search?query=${encodeURIComponent(metadata.title)}`);
        
        // Intentar fallback: buscar película sin año específico
        console.log('🔄 Intentando fallback: buscando película sin año específico...');
        try {
          const fallbackData = {
            movies: [{
              title: metadata.title
              // Sin año para que Trakt busque cualquier versión
            }]
          };
          
          const fallbackHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${traktAccessToken}`,
            'trakt-api-version': '2',
            'trakt-api-key': CONFIG.trakt.clientId
          };
          
          console.log('🔄 Payload de fallback:', JSON.stringify(fallbackData, null, 2));
          const fallbackResponse = await axios.post(`${CONFIG.trakt.apiUrl}/sync/history`, fallbackData, { headers: fallbackHeaders });
          console.log('✅ Fallback exitoso: Película marcada en historial general');
        } catch (fallbackError) {
          console.log('❌ Fallback también falló:', fallbackError.response?.status, fallbackError.response?.data);
          console.log('💡 Solución manual: Ve a https://trakt.tv y agrega la película manualmente a tu lista');
        }
      }
      console.log('💡 Posibles soluciones:');
      console.log('   1. Verifica que el contenido existe en la URL de arriba');
      console.log('   2. Agrega manualmente el contenido a tu lista en Trakt.tv');
      console.log('   3. Verifica que el título y año sean exactos');
      console.log('   4. Algunos contenidos pueden tener nombres ligeramente diferentes');
    } else if (error.response?.status === 422) {
      console.log(`⚠️ ERROR 422 - Datos inválidos enviados a Trakt:`);
      console.log('   Los datos enviados no cumplen con el formato esperado');
      console.log('   Payload enviado:', JSON.stringify(payload, null, 2));
    } else {
      console.error(`❌ Error inesperado (${error.response?.status}):`, error.response?.data);
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
    
    // Guardar nuevos tokens
    await saveTokens(traktAccessToken, traktRefreshToken);
    
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
  
  // Verificar estado de token de forma segura
  const isAuthenticated = Boolean(traktAccessToken);
    
  res.send(`
    <style>
      body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
      .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
      .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
      .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
      code { background: #f8f9fa; padding: 2px 4px; border-radius: 3px; }
    </style>
    <h1>🎬 Plex Scrobbler → Trakt.tv</h1>
    
    <div class="status ${isAuthenticated ? 'success' : 'warning'}">
      <strong>Estado de conexión:</strong> ${isAuthenticated ? '✅ Conectado con Trakt.tv' : '❌ No autenticado'}
    </div>
    
    <div class="status info">
      <strong>Filtro de usuarios:</strong> ${userConfig}<br>
      <strong>Entorno:</strong> ${CONFIG.app.nodeEnv}<br>
      <strong>Puerto interno:</strong> ${CONFIG.server.port}<br>
      <strong>Versión Node.js:</strong> ${process.version}
    </div>
    
    ${!isAuthenticated ? '<p><a href="/plex-scrobbler/auth" style="background:#007bff;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">🔐 Conectar con Trakt.tv</a></p>' : ''}
    
    <h3>📡 Configuración del Webhook</h3>
    <p>URL para configurar en Plex:</p>
    <code>${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}</code>
    
    <h3>🔧 Configuración en Plex</h3>
    <ol>
      <li>Ve a <strong>Plex Web → Configuración → Webhooks</strong></li>
      <li>Haz clic en <strong>"+"</strong> para agregar un nuevo webhook</li>
      <li>Pega la URL de arriba</li>
      <li>Guarda y ¡listo!</li>
    </ol>
    
    <hr>
    <p><a href="/plex-scrobbler/debug/last-event">🐛 Ver información de debugging</a></p>
    <small>Plex Scrobbler v1.0 - <a href="https://chronosceptor.com">chronosceptor.com</a></small>
  `);
});

// Ruta para obtener información de usuario (debug)
app.get('/debug/last-event', (req, res) => {
  res.send(`
    <style>
      body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
      pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
    <h2>🐛 Información de debugging</h2>
    <p>Para encontrar tu información de usuario en Plex:</p>
    
    <ol>
      <li>Reproduce cualquier contenido en Plex</li>
      <li>Revisa la consola del servidor</li>
      <li>Busca una línea similar a esta:</li>
    </ol>
    
    <pre>📡 Webhook recibido: {
  event: 'media.play',
  user: 'Tu Nombre de Usuario',
  userId: '12345',
  owner: true,
  media: 'Nombre de la serie/película'
}</pre>
    
    <p>Usa esa información para configurar tu archivo <code>.env</code>:</p>
    <pre># Para filtrar por nombre:
PLEX_ALLOWED_USERS=Tu Nombre de Usuario

# Para filtrar por ID (más seguro):
PLEX_ALLOWED_USER_IDS=12345

# Para solo propietario:
PLEX_OWNER_ONLY=true</pre>
    
    <p><a href="/plex-scrobbler/">← Volver al inicio</a></p>
  `);
});

// Iniciar servidor
app.listen(CONFIG.server.port, async () => {
  // Validar configuración primero
  validateConfig();
  
  // Cargar tokens guardados al iniciar
  await loadTokens();
  
  console.log(`🚀 Servidor iniciado en puerto ${CONFIG.server.port}`);
  console.log(`📡 Webhook URL: ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}`);
  console.log(`🔐 Autenticación: ${CONFIG.server.baseUrl}/auth`);
  console.log(`🌐 Dashboard: ${CONFIG.server.baseUrl}/`);
  console.log(`🏠 Entorno: ${CONFIG.app.nodeEnv}`);
  
  // Mostrar estado de tokens
  console.log(`🔑 Token estado:`, traktAccessToken ? 'Disponible' : 'No disponible');
  
  // Mostrar información adicional en desarrollo
  if (CONFIG.app.nodeEnv === 'development') {
    console.log(`📍 Servidor local: http://localhost:${CONFIG.server.port}`);
  }
});

module.exports = app;