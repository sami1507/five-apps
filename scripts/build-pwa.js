#!/usr/bin/env node
'use strict';

/**
 * Writes the installable-app files for each app in public/:
 *   - manifest.webmanifest (name, colours, icons, standalone display)
 *   - sw.js (offline cache of the app shell; the cache name changes whenever a file changes)
 *
 * Run it after editing any file under public/: npm run build:pwa
 * Icons (PNG/ICO) are generated from each app's icons/icon.svg by your image tool of choice.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC = path.join(__dirname, '..', 'public');

const APPS = [
  { folder: 'crm', name: 'Pulse CRM', short: 'Pulse CRM', description: 'Contacts, deal pipeline and sales reporting.', theme: '#4f46e5', background: '#f4f6fb' },
  { folder: 'doc-assistant', name: 'DocPilot', short: 'DocPilot', description: 'AI document assistant with cited answers.', theme: '#0d9488', background: '#080b11' },
  { folder: 'inventory', name: 'Inventix', short: 'Inventix', description: 'Inventory and orders with automatic stock control.', theme: '#2563eb', background: '#f4f6fb' },
  { folder: 'job-tracker', name: 'Hireboard', short: 'Hireboard', description: 'Job application tracker with interviews and follow-ups.', theme: '#7c3aed', background: '#f4f6fb' },
  { folder: 'finance', name: 'Ledgerly', short: 'Ledgerly', description: 'Personal finance dashboard with budgets and accounts.', theme: '#6d28d9', background: '#f4f6fb' },
];

// Shared files every app depends on; they are cached alongside the app's own files.
const SHARED = ['../shared/ui.css', '../shared/ui.js', '../shared/ai.js', '../shared/store.js', '../shared/register-sw.js'];

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}

function manifestFor(app) {
  return {
    name: app.name,
    short_name: app.short,
    description: app.description,
    id: './',
    start_url: './index.html',
    scope: './',
    display: 'standalone',
    background_color: app.background,
    theme_color: app.theme,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}

function serviceWorkerFor(app, assets, cacheName) {
  return `// Service worker for ${app.name}: caches the app so it opens offline.
// Network first (so updates arrive quickly), falling back to the cached copy.
const CACHE = '${cacheName}';
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
  );
});
`;
}

for (const app of APPS) {
  const dir = path.join(PUBLIC, app.folder);
  fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), `${JSON.stringify(manifestFor(app), null, 2)}\n`);

  const shell = listFiles(dir).filter((file) => file !== 'sw.js');
  const assets = [...shell.map((file) => `./${file}`), ...SHARED];
  const hash = crypto.createHash('sha1');
  assets.forEach((asset) => hash.update(fs.readFileSync(path.resolve(dir, asset))));
  const cacheName = `${app.folder}-${hash.digest('hex').slice(0, 10)}`;
  fs.writeFileSync(path.join(dir, 'sw.js'), serviceWorkerFor(app, assets, cacheName));
  console.log(`built ${app.folder}: ${assets.length} cached assets, cache ${cacheName}`);
}
