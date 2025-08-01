const http = require('http');
const url = require('url');
const querystring = require('querystring');
const { processWebhook } = require('./webhookHandlers');
const { CONFIG } = require('./config');
const { exchangeCodeForTokens } = require('./traktApi');

class WebhookServer {
  constructor() {
    this.server = null;
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.pathname;
      
      // CORS headers for any preflight requests
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
          this.handleWebhookInfo(res);
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
      console.log(`🚀 Webhook server started on port ${CONFIG.server.port}`);
      console.log(`📡 Webhook URL: ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}`);
      console.log(`🔐 OAuth callback: ${CONFIG.server.baseUrl}/callback`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 Webhook server stopped');
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
      console.log('✅ Authentication successful! You can now close the browser.');
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
        <h1>❌ Authentication Failed</h1>
        <p>${error.message}</p>
      `);
    }
  }

  async handleWebhook(req, res) {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        // Parse multipart form data manually for the payload
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        let payload;
        
        if (boundary) {
          // Simple multipart parsing for payload field
          const parts = body.split(`--${boundary}`);
          for (const part of parts) {
            if (part.includes('name="payload"')) {
              const payloadStart = part.indexOf('\r\n\r\n') + 4;
              payload = part.substring(payloadStart).trim();
              break;
            }
          }
        } else {
          // Fallback for direct JSON
          payload = body;
        }

        if (!payload) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('No payload found');
          return;
        }

        // Create a mock request object for the webhook handler
        const mockReq = {
          body: { payload }
        };

        await processWebhook(mockReq, res);
      } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error processing webhook');
      }
    });
  }

  handleWebhookInfo(res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h1>🎬 Plex Webhook Endpoint</h1>
      <p><strong>Status:</strong> ✅ Ready to receive webhooks</p>
      <p><strong>URL:</strong> ${CONFIG.server.baseUrl}${CONFIG.server.webhookPath}</p>
      <p><strong>Method:</strong> POST</p>
      <p><strong>Content-Type:</strong> multipart/form-data</p>
      
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

module.exports = WebhookServer;