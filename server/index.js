#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createServer } = require('./app');

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const publicDir = path.join(__dirname, '..', 'public');

const server = createServer({ dataDir, publicDir });

server.listen(port, host, () => {
  console.log(`Five apps are running at http://${host}:${port}/`);
  console.log(`Data is stored in ${path.resolve(dataDir)}`);
  console.log('Press Ctrl+C to stop.');
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
