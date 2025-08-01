const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { CONFIG } = require('./config');

const TOKEN_FILE = path.join(__dirname, 'trakt_tokens.json');
let accessToken = null;
let refreshToken = null;

// Token Management
async function loadTokens() {
  try {
    const data = await fs.readFile(TOKEN_FILE, 'utf8');
    const tokens = JSON.parse(data);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    return true;
  } catch {
    return false;
  }
}

async function saveTokens(access, refresh) {
  try {
    const tokens = { accessToken: access, refreshToken: refresh, timestamp: Date.now() };
    await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    accessToken = access;
    refreshToken = refresh;
    console.log('✅ Tokens saved');
  } catch (error) {
    console.error('❌ Error saving tokens:', error.message);
  }
}

function hasValidToken() {
  return Boolean(accessToken);
}

// API calls
const apiHeaders = () => ({
  'Content-Type': 'application/json',
  'trakt-api-version': '2',
  'trakt-api-key': CONFIG.trakt.clientId,
  ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
});

async function searchShow(title) {
  try {
    const url = `${CONFIG.trakt.apiUrl}/search/show?query=${encodeURIComponent(title)}`;
    const response = await axios.get(url, { headers: apiHeaders() });
    
    if (response.data?.length > 0) {
      const show = response.data[0].show;
      console.log(`✅ Found: "${show.title}" (${show.year})`);
      return { title: show.title, year: show.year, ids: show.ids };
    }
    return null;
  } catch (error) {
    console.error('❌ Search error:', error.response?.status);
    return null;
  }
}

async function searchMovie(title) {
  try {
    const url = `${CONFIG.trakt.apiUrl}/search/movie?query=${encodeURIComponent(title)}`;
    const response = await axios.get(url, { headers: apiHeaders() });
    
    if (response.data?.length > 0) {
      const movie = response.data[0].movie;
      console.log(`✅ Found: "${movie.title}" (${movie.year})`);
      return { title: movie.title, year: movie.year, ids: movie.ids };
    }
    return null;
  } catch (error) {
    console.error('❌ Search error:', error.response?.status);
    return null;
  }
}

async function scrobble(action, mediaType, data, progress = 0) {
  if (!accessToken) {
    console.log('❌ No access token');
    return;
  }

  const endpoint = `/scrobble/${action}`;
  let payload = { progress };

  if (mediaType === 'episode') {
    payload.episode = {
      title: data.episode.title,
      season: data.season.number,
      number: data.episode.number,
      ids: {}
    };
    payload.show = {
      title: data.show.title,
      year: data.show.year,
      ids: data.show.ids || {}
    };
  } else {
    payload.movie = {
      title: data.title,
      year: data.year,
      ids: data.ids || {}
    };
  }

  try {
    const response = await axios.post(`${CONFIG.trakt.apiUrl}${endpoint}`, payload, { 
      headers: apiHeaders() 
    });
    console.log(`✅ ${action.toUpperCase()} sent: ${data.title || data.show?.title} (${progress}%)`);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('🔄 Token expired, refreshing...');
      await refreshTokens();
      return scrobble(action, mediaType, data, progress);
    }
    console.error(`❌ Scrobble error (${error.response?.status}):`, error.response?.statusText);
  }
}

async function refreshTokens() {
  try {
    const response = await axios.post(`${CONFIG.trakt.apiUrl}/oauth/token`, {
      refresh_token: refreshToken,
      client_id: CONFIG.trakt.clientId,
      client_secret: CONFIG.trakt.clientSecret,
      grant_type: 'refresh_token'
    });
    
    await saveTokens(response.data.access_token, response.data.refresh_token);
    console.log('✅ Token refreshed');
  } catch (error) {
    console.error('❌ Token refresh failed:', error.response?.data || error.message);
  }
}

async function exchangeCodeForTokens(code) {
  try {
    const response = await axios.post(`${CONFIG.trakt.apiUrl}/oauth/token`, {
      code,
      client_id: CONFIG.trakt.clientId,
      client_secret: CONFIG.trakt.clientSecret,
      redirect_uri: CONFIG.trakt.redirectUri,
      grant_type: 'authorization_code'
    });
    
    await saveTokens(response.data.access_token, response.data.refresh_token);
    console.log('✅ Authentication successful');
    return true;
  } catch (error) {
    console.error('❌ Authentication failed:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  loadTokens,
  hasValidToken,
  searchShow,
  searchMovie,
  scrobble,
  exchangeCodeForTokens
};