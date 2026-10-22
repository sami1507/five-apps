'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { DocumentStore } = require('./store');
const { createService, ServiceError } = require('./service');
const { ValidationError } = require('./schema');
const { apps } = require('./apps');
const { stampKey } = require('./lib/util');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

const BODY_LIMIT = 30 * 1024 * 1024;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data:",
    "connect-src 'self' https://api.anthropic.com https://cdnjs.cloudflare.com",
    "worker-src 'self' blob: https://cdnjs.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; '),
};

function sendJson(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(text);
}

function sendText(res, status, text, contentType, headers = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

/** Reads and parses a JSON request body, enforcing the size limit. */
function readJson(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new ServiceError(413, 'The request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new ServiceError(400, 'The request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/** Serves files from publicDir. Requests outside it are refused. */
function serveStatic(req, res, pathname, publicDir) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    sendText(res, 400, 'Bad request', 'text/plain; charset=utf-8');
    return;
  }
  let file = path.join(publicDir, decoded);
  if (!file.startsWith(publicDir + path.sep) && file !== publicDir) {
    sendText(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const data = fs.readFileSync(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  } catch (_) {
    sendText(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

/**
 * Creates the HTTP server. `dataDir` holds the JSON documents; `publicDir` holds the frontend.
 * Tests pass temporary directories, so nothing outside them is touched.
 */
function createServer({ dataDir, publicDir, log = true }) {
  const store = new DocumentStore(dataDir);
  const service = createService({ store, apps });
  const root = path.resolve(publicDir);

  async function handle(req, res) {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    Object.entries(SECURITY_HEADERS).forEach(([name, value]) => res.setHeader(name, value));

    try {
      if (pathname === '/api/health') {
        if (req.method !== 'GET') throw new ServiceError(405, 'Use GET.');
        sendJson(res, 200, { status: 'ok', time: new Date().toISOString(), apps: Object.keys(apps).length });
        return;
      }

      if (pathname === '/api/apps') {
        if (req.method !== 'GET') throw new ServiceError(405, 'Use GET.');
        sendJson(res, 200, { apps: service.listApps() });
        return;
      }

      const match = /^\/api\/([a-z][a-z-]*)\/([a-z][a-z.-]*)$/.exec(pathname);
      if (match) {
        const [, appKey, action] = match;
        await handleAppRoute(req, res, url, appKey, action);
        return;
      }

      if (pathname.startsWith('/api/')) {
        throw new ServiceError(404, `No endpoint at ${pathname}.`);
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendText(res, 405, 'Method not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' });
        return;
      }
      serveStatic(req, res, pathname === '/' ? '/index.html' : pathname, root);
    } catch (err) {
      respondWithError(res, err);
    } finally {
      if (log) console.log(`${stampKey(new Date())} ${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }

  async function handleAppRoute(req, res, url, appKey, action) {
    const methodFor = {
      state: 'GET',
      summary: 'GET',
      init: 'POST',
      sync: 'POST',
      reset: 'POST',
    };
    if (methodFor[action]) {
      if (req.method !== methodFor[action]) throw new ServiceError(405, `Use ${methodFor[action]} for /${action}.`);
    } else if (req.method !== 'GET') {
      throw new ServiceError(405, 'Use GET for app feeds.');
    }

    const now = new Date();
    switch (action) {
      case 'state':
        return sendJson(res, 200, service.getState(appKey));
      case 'summary':
        return sendJson(res, 200, service.summary(appKey, now));
      case 'init': {
        const body = await readJson(req);
        return sendJson(res, 201, { initialized: true, document: service.init(appKey, body) });
      }
      case 'sync': {
        const body = await readJson(req);
        return sendJson(res, 200, service.sync(appKey, body));
      }
      case 'reset':
        return sendJson(res, 200, service.reset(appKey));
      default: {
        const feed = service.route(appKey, action, now);
        return sendText(res, 200, feed.body, feed.contentType, {
          'Content-Disposition': `inline; filename="${feed.filename}"`,
          'Cache-Control': 'no-cache',
        });
      }
    }
  }

  function respondWithError(res, err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (err instanceof ValidationError) {
      sendJson(res, err.status, { error: err.message, details: err.details });
      return;
    }
    if (err instanceof ServiceError) {
      sendJson(res, err.status, { error: err.message, ...(err.details ? { details: err.details } : {}) });
      return;
    }
    console.error(err);
    sendJson(res, 500, { error: 'Something went wrong on the server. The error has been logged.' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res);
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 30000;
  server.service = service;
  server.store = store;
  return server;
}

module.exports = { createServer };
