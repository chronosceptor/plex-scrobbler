const fs = require('fs').promises;
const path = require('path');

const TOKEN_FILE = path.join(__dirname, 'trakt_tokens.json');

let traktAccessToken = null;
let traktRefreshToken = null;

async function saveTokens(accessToken, refreshToken) {
  try {
    const tokens = {
      accessToken,
      refreshToken,
      timestamp: Date.now()
    };
    await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log('✅ Tokens guardados en archivo');
    
    traktAccessToken = accessToken;
    traktRefreshToken = refreshToken;
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

function getTokens() {
  return {
    accessToken: traktAccessToken,
    refreshToken: traktRefreshToken
  };
}

function setTokens(accessToken, refreshToken) {
  traktAccessToken = accessToken;
  traktRefreshToken = refreshToken;
}

function hasValidToken() {
  return Boolean(traktAccessToken);
}

module.exports = {
  saveTokens,
  loadTokens,
  getTokens,
  setTokens,
  hasValidToken
};