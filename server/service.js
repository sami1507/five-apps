'use strict';

const { validateDocument, validateRecord, check, ValidationError } = require('./schema');

const MAX_OPS_PER_BATCH = 500;

/** An error that carries an HTTP status code and is safe to show to the client. */
class ServiceError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.details = details;
  }
}

const problem = (path, message) => new ValidationError([{ path, message }]);

/**
 * Business operations for every app. Each app registers a definition with:
 *   key, name, schema, invariants(doc) -> [{ path, message }], summary(doc, now), routes
 * The service never trusts the client: every write is validated as a whole before it is stored.
 */
function createService({ store, apps }) {
  const definitionFor = (key) => {
    const app = apps[key];
    if (!app) throw new ServiceError(404, `Unknown app "${key}".`);
    return app;
  };

  const checkInvariants = (app, doc) => {
    const problems = app.invariants ? app.invariants(doc) : [];
    if (problems.length) throw new ValidationError(problems);
  };

  const applyOperation = (app, draft, op, index, summary) => {
    const at = `ops[${index}]`;
    if (!op || typeof op !== 'object') throw problem(at, 'must be an object');

    if (op.op === 'upsert') {
      const collection = app.schema.collections[op.collection];
      if (!collection) throw problem(`${at}.collection`, `unknown collection "${op.collection}"`);
      const record = validateRecord(collection.item, op.record, `${at}.record`);
      const list = draft[op.collection];
      const position = list.findIndex((item) => item.id === record.id);
      if (position === -1) list.push(record);
      else list[position] = record;
      summary.upserted += 1;
      return;
    }

    if (op.op === 'delete') {
      if (!app.schema.collections[op.collection]) throw problem(`${at}.collection`, `unknown collection "${op.collection}"`);
      if (typeof op.id !== 'string') throw problem(`${at}.id`, 'must be the id of a record');
      draft[op.collection] = draft[op.collection].filter((item) => item.id !== op.id);
      summary.deleted += 1;
      return;
    }

    if (op.op === 'setting') {
      const desc = app.schema.settings && app.schema.settings[op.key];
      if (!desc) throw problem(`${at}.key`, `unknown setting "${op.key}"`);
      const errors = [];
      const value = check(desc, op.value, `${at}.value`, errors);
      if (errors.length) throw new ValidationError(errors);
      draft[op.key] = value;
      summary.settings += 1;
      return;
    }

    throw problem(`${at}.op`, 'must be "upsert", "delete" or "setting"');
  };

  return {
    listApps() {
      return Object.values(apps).map((app) => ({
        key: app.key,
        name: app.name,
        description: app.description,
        initialized: store.read(app.key) !== null,
      }));
    },

    getState(key) {
      const app = definitionFor(key);
      const doc = store.read(app.key);
      if (doc === null) throw new ServiceError(404, 'This app has no data yet. Send its starting document to /init.');
      return doc;
    },

    init(key, body) {
      const app = definitionFor(key);
      if (store.read(app.key) !== null) {
        throw new ServiceError(409, 'This app already has data. Use /sync to change it, or /reset to start over.');
      }
      const doc = validateDocument(app.schema, body);
      checkInvariants(app, doc);
      store.write(app.key, doc);
      return doc;
    },

    sync(key, body) {
      const app = definitionFor(key);
      if (store.read(app.key) === null) throw new ServiceError(404, 'Initialise this app before syncing.');
      const ops = body && body.ops;
      if (!Array.isArray(ops)) throw new ServiceError(400, 'The request body must contain an "ops" array.');
      if (ops.length > MAX_OPS_PER_BATCH) {
        throw new ServiceError(413, `A batch can contain at most ${MAX_OPS_PER_BATCH} operations.`);
      }

      const summary = { upserted: 0, deleted: 0, settings: 0 };
      // The whole batch is applied to a private copy and written once. Any failure aborts it.
      store.transact(app.key, (draft) => {
        ops.forEach((op, index) => applyOperation(app, draft, op, index, summary));
        const doc = validateDocument(app.schema, draft);
        checkInvariants(app, doc);
        return doc;
      });
      return { applied: ops.length, ...summary };
    },

    reset(key) {
      const app = definitionFor(key);
      store.remove(app.key);
      return { ok: true };
    },

    summary(key, now) {
      const app = definitionFor(key);
      const doc = store.read(app.key);
      if (doc === null) throw new ServiceError(404, 'This app has no data yet.');
      return app.summary(doc, now);
    },

    route(key, name, now) {
      const app = definitionFor(key);
      const handler = app.routes && app.routes[name];
      if (!handler) throw new ServiceError(404, `Unknown endpoint "${name}" for ${app.name}.`);
      const doc = store.read(app.key);
      if (doc === null) throw new ServiceError(404, 'This app has no data yet.');
      return handler(doc, { now });
    },

    definitionFor,
  };
}

module.exports = { createService, ServiceError, MAX_OPS_PER_BATCH };
