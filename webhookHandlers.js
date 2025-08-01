const { isAllowedUser } = require('./userAuth');
const { hasValidToken } = require('./tokenManager');
const { searchShowInTrakt, searchMovieInTrakt, checkEpisodeInTrakt, sendToTrakt } = require('./traktApi');

async function handlePlexEvent(payload) {
  const { event, Metadata } = payload;
  
  if (!hasValidToken()) {
    console.log('⚠️ No hay token de Trakt disponible');
    return;
  }
  
  try {
    let traktData;
    
    if (Metadata.type === 'episode') {
      if (!Metadata.grandparentTitle || !Metadata.parentIndex || !Metadata.index) {
        console.log('❌ Datos incompletos para episodio:', {
          show: Metadata.grandparentTitle,
          season: Metadata.parentIndex,
          episode: Metadata.index,
          title: Metadata.title
        });
        return;
      }
      
      console.log(`🔍 Buscando "${Metadata.grandparentTitle}" en Trakt...`);
      const traktShow = await searchShowInTrakt(Metadata.grandparentTitle);
      
      let finalYear;
      let finalTitle = Metadata.grandparentTitle;
      let showSlug = null;
      
      if (traktShow) {
        finalYear = traktShow.year;
        finalTitle = traktShow.title;
        showSlug = traktShow.ids?.slug;
        console.log(`✅ Usando datos de Trakt: "${finalTitle}" (${finalYear})`);
        
        if (showSlug) {
          const episodeExists = await checkEpisodeInTrakt(showSlug, Metadata.parentIndex, Metadata.index);
          if (!episodeExists) {
            console.log(`⚠️ El episodio ${Metadata.parentIndex}x${Metadata.index} no existe en Trakt`);
            console.log(`💡 Se intentará scrobble genérico de la serie completa`);
          }
        }
        
      } else {
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
      if (!Metadata.title) {
        console.log('❌ Datos incompletos para película:', {
          title: Metadata.title,
          year: Metadata.year
        });
        return;
      }
      
      console.log(`🔍 Buscando película "${Metadata.title}" en Trakt...`);
      const traktMovie = await searchMovieInTrakt(Metadata.title);
      
      let finalYear;
      let finalTitle = Metadata.title;
      
      if (traktMovie) {
        finalYear = traktMovie.year;
        finalTitle = traktMovie.title;
        console.log(`✅ Usando datos de Trakt: "${finalTitle}" (${finalYear})`);
      } else {
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
    
    const eventMapping = {
      'media.play': 'start',
      'media.resume': 'start', 
      'media.pause': 'pause',
      'media.stop': 'stop',
      'media.scrobble': 'stop'
    };
    
    const traktAction = eventMapping[event];
    if (!traktAction) {
      console.log('⚠️ Evento no mapeado:', event);
      return;
    }
    
    await sendToTrakt(traktAction, traktData, Metadata);
    
  } catch (error) {
    console.error('❌ Error procesando evento de Plex:', error.message);
  }
}

async function processWebhook(req, res) {
  try {
    const payload = JSON.parse(req.body.payload);
    
    console.log('📡 Webhook recibido - DATOS COMPLETOS:', {
      event: payload.event,
      user: payload.Account?.title,
      userId: payload.Account?.id,
      owner: payload.owner,
      episodeTitle: payload.Metadata?.title,
      seriesTitle: payload.Metadata?.grandparentTitle,
      type: payload.Metadata?.type,
      season: payload.Metadata?.parentIndex,
      episode: payload.Metadata?.index,
      episodeYear: payload.Metadata?.year,
      seriesYear: payload.Metadata?.grandparentYear,
      originallyAvailableAt: payload.Metadata?.originallyAvailableAt,
      guid: payload.Metadata?.guid,
      duration: payload.Metadata?.duration,
      viewOffset: payload.Metadata?.viewOffset
    });
    
    if (!isAllowedUser(payload)) {
      console.log('⚠️ Usuario no autorizado, ignorando evento');
      return res.status(200).send('Usuario no autorizado');
    }
    
    if (!['media.play', 'media.pause', 'media.resume', 'media.stop', 'media.scrobble'].includes(payload.event)) {
      return res.status(200).send('Evento ignorado');
    }
    
    if (!['episode', 'movie'].includes(payload.Metadata?.type)) {
      return res.status(200).send('Tipo de media no soportado');
    }
    
    await handlePlexEvent(payload);
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('❌ Error procesando webhook:', error);
    res.status(500).send('Error interno');
  }
}

module.exports = {
  handlePlexEvent,
  processWebhook
};