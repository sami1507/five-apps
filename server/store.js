'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * One JSON document per app, stored as <dataDir>/<app>.json.
 *
 * Writes are atomic: the new content goes to a temporary file that is then renamed over the
 * old one, so a crash never leaves a half-written file. All operations are synchronous, so
 * two requests can never interleave inside a read-modify-write cycle.
 */
class DocumentStore {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.cache = new Map();
  }

  filePath(key) {
    if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new Error(`Invalid store key: ${key}`);
    return path.join(this.dataDir, `${key}.json`);
  }

  /** Returns the stored document, or null when the app has not been initialised yet. */
  read(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    let document = null;
    try {
      const raw = fs.readFileSync(this.filePath(key), 'utf8');
      document = JSON.parse(raw).document || null;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    this.cache.set(key, document);
    return document;
  }

  write(key, document) {
    const target = this.filePath(key);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), document }, null, 2);
    fs.writeFileSync(temp, payload, 'utf8');
    fs.renameSync(temp, target);
    this.cache.set(key, document);
  }

  remove(key) {
    fs.rmSync(this.filePath(key), { force: true });
    this.cache.delete(key);
  }

  /**
   * Read-modify-write on a private copy. The callback returns the next document; if it throws,
   * nothing is written.
   */
  transact(key, mutate) {
    const current = this.read(key);
    const draft = current === null ? null : structuredClone(current);
    const next = mutate(draft);
    this.write(key, next);
    return next;
  }
}

module.exports = { DocumentStore };
