'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { createServer } = require('../server/app');
const { tempDir, documents } = require('./fixtures');

const publicDir = path.join(__dirname, '..', 'public');

async function start(dataDir) {
  const server = createServer({ dataDir, publicDir, log: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const close = () => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
  return { server, base, close };
}

async function call(base, method, pathname, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
    options.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${base}${pathname}`, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

/** Raw request that does not normalise the path, so traversal attempts reach the server as sent. */
function rawGet(base, rawPath) {
  const { port } = new URL(base);
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: rawPath }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    }).on('error', reject);
  });
}

test('health and app list', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  const health = await call(base, 'GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.status, 'ok');
  assert.equal(health.json.apps, 5);

  const list = await call(base, 'GET', '/api/apps');
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.apps.map((a) => a.key), ['crm', 'inventory', 'job-tracker', 'finance', 'doc-assistant']);
  assert.ok(list.json.apps.every((a) => a.initialized === false));
});

test('an app without data answers 404 with a JSON message', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  const res = await call(base, 'GET', '/api/crm/state');
  assert.equal(res.status, 404);
  assert.match(res.json.error, /no data yet/);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
});

test('init, state, sync and summary round-trip through HTTP', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  const init = await call(base, 'POST', '/api/crm/init', documents.crm());
  assert.equal(init.status, 201);
  assert.equal(init.json.initialized, true);

  const again = await call(base, 'POST', '/api/crm/init', documents.crm());
  assert.equal(again.status, 409);

  const state = await call(base, 'GET', '/api/crm/state');
  assert.equal(state.status, 200);
  assert.equal(state.json.contacts.length, 2);

  const sync = await call(base, 'POST', '/api/crm/sync', {
    ops: [{ op: 'upsert', collection: 'contacts', record: { ...documents.crm().contacts[0], status: 'Customer' } }],
  });
  assert.equal(sync.status, 200);
  assert.deepEqual(sync.json, { applied: 1, upserted: 1, deleted: 0, settings: 0 });

  const after = await call(base, 'GET', '/api/crm/state');
  assert.equal(after.json.contacts.find((c) => c.id === 'c1').status, 'Customer');

  const summary = await call(base, 'GET', '/api/crm/summary');
  assert.equal(summary.status, 200);
  assert.equal(summary.json.openDeals, 1);
});

test('an invalid change is rejected with field-level details and nothing changes', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  await call(base, 'POST', '/api/inventory/init', documents.inventory());
  const before = (await call(base, 'GET', '/api/inventory/state')).text;

  const res = await call(base, 'POST', '/api/inventory/sync', {
    ops: [{ op: 'upsert', collection: 'products', record: { ...documents.inventory().products[0], stock: -5 } }],
  });
  assert.equal(res.status, 422);
  assert.ok(res.json.details.some((d) => d.path.includes('stock')));

  const after = (await call(base, 'GET', '/api/inventory/state')).text;
  assert.equal(after, before);
});

test('data survives a restart of the server', async (t) => {
  const dir = tempDir('five-apps-api');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const first = await start(dir);
  await call(first.base, 'POST', '/api/finance/init', documents.finance());
  await first.close();

  const second = await start(dir);
  t.after(() => second.close());
  const state = await call(second.base, 'GET', '/api/finance/state');
  assert.equal(state.status, 200);
  assert.equal(state.json.accounts.length, 2);
});

test('reset clears an app so it can be initialised again', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  await call(base, 'POST', '/api/doc-assistant/init', documents['doc-assistant']());
  const reset = await call(base, 'POST', '/api/doc-assistant/reset');
  assert.equal(reset.status, 200);
  assert.equal((await call(base, 'GET', '/api/doc-assistant/state')).status, 404);
});

test('HTTP method, route and body errors use the right status codes', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  assert.equal((await call(base, 'GET', '/api/nope/state')).status, 404);
  assert.equal((await call(base, 'GET', '/api/crm/unknown-thing')).status, 404);
  assert.equal((await call(base, 'GET', '/api/crm/sync')).status, 405);
  assert.equal((await call(base, 'DELETE', '/api/health')).status, 405);

  await call(base, 'POST', '/api/crm/init', documents.crm());
  const broken = await call(base, 'POST', '/api/crm/sync', '{"ops": [');
  assert.equal(broken.status, 400);
  assert.match(broken.json.error, /not valid JSON/);
});

test('the job tracker calendar feed is served as an .ics file', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  await call(base, 'POST', '/api/job-tracker/init', documents['job-tracker']());
  const res = await fetch(`${base}/api/job-tracker/calendar.ics`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/calendar; charset=utf-8');
  assert.match(res.headers.get('content-disposition'), /hireboard-calendar\.ics/);
  const body = await res.text();
  assert.match(body, /^BEGIN:VCALENDAR\r\n/);
  assert.match(body, /END:VCALENDAR\r\n$/);
});

test('the frontend is served with security headers and a content security policy', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'self'/);

  const css = await fetch(`${base}/shared/ui.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);

  const app = await fetch(`${base}/job-tracker/index.html`);
  assert.equal(app.status, 200);
});

test('files outside the public folder cannot be read', async (t) => {
  const dir = tempDir('five-apps-api');
  const { base, close } = await start(dir);
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

  const attempt = await rawGet(base, '/%2e%2e%2fpackage.json');
  assert.equal(attempt.status, 403);
  assert.doesNotMatch(attempt.text, /"name": "five-apps"/);
  assert.equal((await fetch(`${base}/does-not-exist.html`)).status, 404);
});
