const axios = require('axios');
const { CONFIG } = require('./config');
const { getTokens, setTokens, saveTokens } = require('./tokenManager');

async function searchShowInTrakt(showTitle) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': CONFIG.trakt.clientId
    };
    
    const searchUrl = `${CONFIG.trakt.apiUrl}/search/show?query=${encodeURIComponent(showTitle)}`;
    console.log(`🔍 Buscando serie en Trakt: ${searchUrl}`);
    const response = await axios.get(searchUrl, { headers });
    
    if (response.data && response.data.length > 0) {
      console.log(`📋 Encontradas ${response.data.length} series, primeros 3 resultados:`);
      response.data.slice(0, 3).forEach((result, index) => {
        if (result.show) {
          console.log(`   ${index + 1}. "${result.show.title}" (${result.show.year}) - Score: ${result.score || 'N/A'}`);
        }
      });
      
      const firstResult = response.data[0];
      if (firstResult.show) {
        console.log(`✅ Usando: "${firstResult.show.title}" (${firstResult.show.year})`);
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
      console.log(`📋 Encontradas ${response.data.length} películas, primeros 3 resultados:`);
      response.data.slice(0, 3).forEach((result, index) => {
        if (result.movie) {
          console.log(`   ${index + 1}. "${result.movie.title}" (${result.movie.year}) - Score: ${result.score || 'N/A'}`);
        }
      });
      
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

async function sendToTrakt(action, data, metadata) {
  const { accessToken } = getTokens();
  
  if (!accessToken) {
    console.log('❌ No hay token de acceso disponible');
    return;
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'trakt-api-version': '2',
    'trakt-api-key': CONFIG.trakt.clientId
  };
  
  let endpoint;
  let payload = {};
  
  let progress = 0;
  if (metadata.viewOffset && metadata.duration) {
    progress = Math.round((metadata.viewOffset / metadata.duration) * 100);
  }
  
  switch (action) {
    case 'start':
      endpoint = '/scrobble/start';
      break;
    case 'pause':
      endpoint = '/scrobble/pause';
      break;
    case 'stop':
      endpoint = '/scrobble/stop';
      break;
    default:
      console.log('❌ Acción no reconocida:', action);
      return;
  }
  
  if (data.shows && data.shows.length > 0) {
    const show = data.shows[0];
    const season = show.seasons[0];
    const episode = season.episodes[0];
    
    payload = {
      item: {
        type: 'episode',
        episode: {
          title: episode.title,
          number: episode.number
        },
        season: {
          number: season.number
        },
        show: {
          title: show.title,
          year: show.year,
          ids: show.ids || {}
        }
      },
      progress: progress
    };
    
    console.log('📺 Payload construido para episodio:', JSON.stringify(payload, null, 2));
    
  } else if (data.movies && data.movies.length > 0) {
    const movie = data.movies[0];
    
    payload = {
      item: {
        type: 'movie',
        movie: {
          title: movie.title,
          year: movie.year,
          ids: {}
        }
      },
      progress: progress
    };
    
    console.log('🎬 Payload construido para película:', JSON.stringify(payload, null, 2));
  } else {
    console.log('❌ Datos inválidos recibidos:', JSON.stringify(data, null, 2));
    return;
  }
  
  try {
    console.log(`🔄 Enviando ${action.toUpperCase()} a Trakt con formato correcto:`, {
      endpoint: `${CONFIG.trakt.apiUrl}${endpoint}`,
      payload: JSON.stringify(payload, null, 2)
    });
    
    const response = await axios.post(`${CONFIG.trakt.apiUrl}${endpoint}`, payload, { headers });
    
    console.log(`✅ ${action.toUpperCase()} enviado a Trakt exitosamente:`, {
      title: metadata.title || metadata.grandparentTitle,
      progress: progress + '%',
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
    
    if (error.response?.status === 401) {
      console.log('🔄 Token expirado, renovando...');
      await refreshTraktToken();
      console.log('🔄 Reintentando con token renovado...');
      await sendToTrakt(action, data, metadata);
    } else if (error.response?.status === 404) {
      console.log(`⚠️ ERROR 404 - Contenido no encontrado en Trakt`);
      console.log('💡 Esto puede ocurrir si:');
      console.log('   - La serie/película no existe en la base de datos de Trakt');
      console.log('   - El episodio específico no existe en esa temporada');
      console.log('   - Los datos de búsqueda no coinciden exactamente');
      console.log('🔍 Verifica que el contenido existe en trakt.tv manualmente');
    } else if (error.response?.status === 422) {
      console.log(`⚠️ ERROR 422 - Datos inválidos enviados a Trakt:`);
      console.log('   Los datos enviados no cumplen con el formato esperado');
      console.log('   Payload enviado:', JSON.stringify(payload, null, 2));
    } else if (error.response?.status === 409) {
      console.log(`⚠️ ERROR 409 - Contenido ya fue scrobbled recientemente`);
      console.log('   Trakt evita duplicados, esto es normal');
    } else {
      console.error(`❌ Error inesperado (${error.response?.status}):`, error.response?.data);
    }
  }
}

async function refreshTraktToken() {
  try {
    const { refreshToken } = getTokens();
    
    const response = await axios.post(`${CONFIG.trakt.apiUrl}/oauth/token`, {
      refresh_token: refreshToken,
      client_id: CONFIG.trakt.clientId,
      client_secret: CONFIG.trakt.clientSecret,
      grant_type: 'refresh_token'
    });
    
    const newAccessToken = response.data.access_token;
    const newRefreshToken = response.data.refresh_token;
    
    setTokens(newAccessToken, newRefreshToken);
    await saveTokens(newAccessToken, newRefreshToken);
    
    console.log('✅ Token de Trakt renovado');
  } catch (error) {
    console.error('❌ Error renovando token:', error.response?.data || error.message);
  }
}

async function exchangeCodeForTokens(code) {
  try {
    const tokenResponse = await axios.post(`${CONFIG.trakt.apiUrl}/oauth/token`, {
      code,
      client_id: CONFIG.trakt.clientId,
      client_secret: CONFIG.trakt.clientSecret,
      redirect_uri: CONFIG.trakt.redirectUri,
      grant_type: 'authorization_code'
    });
    
    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;
    
    setTokens(accessToken, refreshToken);
    await saveTokens(accessToken, refreshToken);
    
    console.log('✅ Autenticación exitosa con Trakt.tv');
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('❌ Error en autenticación:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  searchShowInTrakt,
  searchMovieInTrakt,
  checkEpisodeInTrakt,
  sendToTrakt,
  refreshTraktToken,
  exchangeCodeForTokens
};