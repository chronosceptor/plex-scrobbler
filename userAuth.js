const { CONFIG } = require('./config');

function isAllowedUser(payload) {
  const account = payload.Account;
  
  if (!account) {
    console.log('⚠️ Sin información de cuenta en el payload');
    return false;
  }
  
  if (CONFIG.plex.ownerOnly && payload.owner) {
    console.log('✅ Usuario autorizado (propietario del servidor)');
    return true;
  }
  
  if (CONFIG.plex.allowedUsers && CONFIG.plex.allowedUsers.length > 0) {
    const isAllowed = CONFIG.plex.allowedUsers.includes(account.title);
    if (isAllowed) {
      console.log(`✅ Usuario autorizado por nombre: ${account.title}`);
      return true;
    }
  }
  
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

module.exports = {
  isAllowedUser
};