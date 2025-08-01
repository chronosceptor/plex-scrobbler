const http = require('http');
const url = require('url');
const { CONFIG } = require('./config');
const { searchShow, searchMovie, scrobble, exchangeCodeForTokens, hasValidToken } = require('./trakt');

class Server {
  constructor() {
    this.server = null;
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.pathname;
      
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      try {
        if (path === '/callback' && req.method === 'GET') {
          await this.handleCallback(req, res, parsedUrl.query);
        } else if (path === CONFIG.server.webhookPath && req.method === 'POST') {
          await this.handleWebhook(req, res);
        } else if (path === CONFIG.server.webhookPath && req.method === 'GET') {
          this.showWebhookInfo(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      } catch (error) {
        console.error('❌ Server error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    this.server.listen(CONFIG.server.port, () => {
      console.log(`🚀 Server started on port ${CONFIG.server.port}`);
      console.log(`📡 Webhook URL: ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 Server stopped');
    }
  }

  async handleCallback(req, res, query) {
    const { code } = query;
    
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing authorization code');
      return;
    }

    try {
      await exchangeCodeForTokens(code);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <h1>✅ Authentication Successful!</h1>
        <p>Your Plex Scrobbler is now connected to Trakt.tv</p>
        <p>You can close this window and return to your terminal.</p>
      `);
      console.log('✅ Authentication successful! You can close the browser.');
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>❌ Authentication Failed</h1><p>${error.message}</p>`);
    }
  }

  async handleWebhook(req, res) {
    let body = '';
    
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        // Parse multipart form data for payload
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        let payload;
        
        if (boundary) {
          const parts = body.split(`--${boundary}`);
          for (const part of parts) {
            if (part.includes('name="payload"')) {
              const payloadStart = part.indexOf('\r\n\r\n') + 4;
              payload = part.substring(payloadStart).trim();
              break;
            }
          }
        } else {
          payload = body;
        }

        if (!payload) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('No payload found');
          return;
        }

        await this.processWebhook(JSON.parse(payload), res);
      } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error processing webhook');
      }
    });
  }

  async processWebhook(payload, res) {
    const { event, Metadata, Account } = payload;
    
    // User authorization check
    if (!this.isAllowedUser(Account)) {
      console.log('⚠️ Unauthorized user, ignoring event');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized user');
      return;
    }
    
    // Event filter
    if (!['media.play', 'media.pause', 'media.resume', 'media.stop', 'media.scrobble'].includes(event)) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Event ignored');
      return;
    }
    
    // Media type filter
    if (!['episode', 'movie'].includes(Metadata?.type)) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Media type not supported');
      return;
    }

    if (!hasValidToken()) {
      console.log('⚠️ No Trakt token available');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('No token');
      return;
    }

    // Calculate progress
    let progress = 0;
    if (Metadata.viewOffset && Metadata.duration) {
      progress = Math.round((Metadata.viewOffset / Metadata.duration) * 100);
    }

    // Map events to actions
    const actionMap = {
      'media.play': 'start',
      'media.resume': 'start', 
      'media.pause': 'pause',
      'media.stop': 'stop',
      'media.scrobble': 'stop'
    };

    try {
      if (Metadata.type === 'episode') {
        await this.handleEpisode(Metadata, actionMap[event], progress);
      } else {
        await this.handleMovie(Metadata, actionMap[event], progress);
      }
      
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } catch (error) {
      console.error('❌ Processing error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Processing error');
    }
  }

  async handleEpisode(metadata, action, progress) {
    const { grandparentTitle, parentIndex, index, title, grandparentYear, year } = metadata;
    
    if (!grandparentTitle || !parentIndex || !index) {
      console.log('❌ Incomplete episode data');
      return;
    }

    console.log(`🔍 Processing episode: ${grandparentTitle} ${parentIndex}x${index} - ${title}`);
    
    const traktShow = await searchShow(grandparentTitle);
    const finalTitle = traktShow?.title || grandparentTitle;
    const finalYear = traktShow?.year || parseInt(grandparentYear || year) || null;

    const data = {
      show: {
        title: finalTitle,
        year: finalYear,
        ids: traktShow?.ids || {}
      },
      season: { number: parseInt(parentIndex) },
      episode: { title, number: parseInt(index) }
    };

    await scrobble(action, 'episode', data, progress);
  }

  async handleMovie(metadata, action, progress) {
    const { title, year } = metadata;
    
    if (!title) {
      console.log('❌ Incomplete movie data');
      return;
    }

    console.log(`🔍 Processing movie: ${title} (${year})`);
    
    const traktMovie = await searchMovie(title);
    const data = {
      title: traktMovie?.title || title,
      year: traktMovie?.year || parseInt(year) || null,
      ids: traktMovie?.ids || {}
    };

    await scrobble(action, 'movie', data, progress);
  }

  isAllowedUser(account) {
    if (!account) return false;
    
    // If specific user is configured, only allow that user
    if (CONFIG.plex.allowedUser) {
      return account.title === CONFIG.plex.allowedUser;
    }
    
    // If no user filter configured, deny all users for security
    return false;
  }

  showWebhookInfo(res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h1>🎬 Plex Webhook Endpoint</h1>
      <p><strong>Status:</strong> ✅ Ready to receive webhooks</p>
      <p><strong>URL:</strong> ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}</p>
      <h3>Setup in Plex:</h3>
      <ol>
        <li>Go to Plex Web → Settings → Webhooks</li>
        <li>Click "+" to add webhook</li>
        <li>Enter: ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}</li>
        <li>Save and test by playing media</li>
      </ol>
    `);
  }
}

module.exports = Server;