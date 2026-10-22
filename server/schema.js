'use strict';

/**
 * Small validation DSL used by every app's backend.
 *
 * A schema is built from descriptors such as S.text(1, 120) or S.record({...}).
 * `check` returns a cleaned copy of the value (unknown keys are dropped) or records
 * human-readable problems. Nothing is written unless the whole document is valid.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ValidationError extends Error {
  constructor(details, status = 422) {
    super(`Validation failed: ${details.length} problem${details.length === 1 ? '' : 's'}`);
    this.name = 'ValidationError';
    this.status = status;
    this.details = details;
  }
}

const isRealDate = (value) => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function check(desc, value, path, errors) {
  const fail = (message) => {
    errors.push({ path, message });
    return undefined;
  };

  switch (desc.kind) {
    case 'id':
      if (typeof value !== 'string' || !ID_RE.test(value)) {
        return fail('must be an id (letters, digits, "-" or "_", up to 80 characters)');
      }
      return value;

    case 'text':
      if (typeof value !== 'string') return fail('must be text');
      if (value.length < desc.min) return fail(desc.min > 0 ? 'is required' : 'is too short');
      if (value.length > desc.max) return fail(`must be at most ${desc.max} characters`);
      return value;

    case 'email':
      if (typeof value !== 'string') return fail('must be text');
      if (value && (value.length > 160 || !EMAIL_RE.test(value))) return fail('must be a valid email address');
      return value;

    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('must be a number');
      if (value < desc.min || value > desc.max) return fail(`must be between ${desc.min} and ${desc.max}`);
      return value;

    case 'integer':
      if (!Number.isInteger(value)) return fail('must be a whole number');
      if (value < desc.min || value > desc.max) return fail(`must be between ${desc.min} and ${desc.max}`);
      return value;

    case 'boolean':
      if (typeof value !== 'boolean') return fail('must be true or false');
      return value;

    case 'date':
      if (typeof value !== 'string') return fail('must be a date');
      if (value === '') return value;
      if (!DATE_RE.test(value) || !isRealDate(value)) return fail('must be a date (YYYY-MM-DD)');
      return value;

    case 'datetime':
      if (typeof value !== 'string') return fail('must be a date and time');
      if (value === '') return value;
      if (!DATETIME_RE.test(value)) return fail('must be a date and time (YYYY-MM-DDTHH:MM)');
      return value;

    case 'time':
      if (typeof value !== 'string') return fail('must be a time');
      if (value === '') return value;
      if (!TIME_RE.test(value)) return fail('must be a time (HH:MM)');
      return value;

    case 'enum':
      if (!desc.values.includes(value)) return fail(`must be one of: ${desc.values.filter(Boolean).join(', ')}`);
      return value;

    case 'list': {
      if (!Array.isArray(value)) return fail('must be a list');
      if (value.length > desc.max) return fail(`can contain at most ${desc.max} items`);
      const out = [];
      value.forEach((item, index) => {
        const cleaned = check(desc.item, item, `${path}[${index}]`, errors);
        if (cleaned !== undefined) out.push(cleaned);
      });
      return out;
    }

    case 'record': {
      if (!isPlainObject(value)) return fail('must be an object');
      const out = {};
      Object.entries(desc.shape).forEach(([key, sub]) => {
        const field = value[key];
        if (field === undefined) {
          if (!sub.optional) errors.push({ path: `${path}.${key}`, message: 'is required' });
          return;
        }
        const cleaned = check(sub, field, `${path}.${key}`, errors);
        if (cleaned !== undefined) out[key] = cleaned;
      });
      return out;
    }

    case 'map': {
      if (!isPlainObject(value)) return fail('must be an object');
      const out = {};
      Object.entries(value).forEach(([key, item]) => {
        if (key.length > 80) {
          errors.push({ path: `${path}.${key}`, message: 'key is too long' });
          return;
        }
        const cleaned = check(desc.value, item, `${path}.${key}`, errors);
        if (cleaned !== undefined) out[key] = cleaned;
      });
      return out;
    }

    default:
      throw new Error(`Unknown schema kind: ${desc.kind}`);
  }
}

const S = {
  id: { kind: 'id' },
  text: (min = 0, max = 200) => ({ kind: 'text', min, max }),
  email: { kind: 'email' },
  number: (min = 0, max = 1e9) => ({ kind: 'number', min, max }),
  integer: (min = 0, max = 1e9) => ({ kind: 'integer', min, max }),
  boolean: { kind: 'boolean' },
  date: { kind: 'date' },
  datetime: { kind: 'datetime' },
  time: { kind: 'time' },
  enum: (values) => ({ kind: 'enum', values }),
  list: (item, max = 200) => ({ kind: 'list', item, max }),
  record: (shape) => ({ kind: 'record', shape }),
  map: (value) => ({ kind: 'map', value }),
  optional: (desc) => ({ ...desc, optional: true }),
};

/** Validates one record (for example a single job) against a record descriptor. */
function validateRecord(recordDesc, value, path = '$') {
  const errors = [];
  const cleaned = check(recordDesc, value, path, errors);
  if (errors.length) throw new ValidationError(errors);
  return cleaned;
}

/**
 * Validates a whole app document.
 * schema = { collections: { name: S.list(S.record(...)) }, settings: { name: descriptor } }
 */
function validateDocument(schema, input) {
  const errors = [];
  if (!isPlainObject(input)) throw new ValidationError([{ path: '$', message: 'must be an object' }]);

  const known = new Set([...Object.keys(schema.collections), ...Object.keys(schema.settings || {})]);
  Object.keys(input).forEach((key) => {
    if (!known.has(key)) errors.push({ path: key, message: 'is not a known field' });
  });

  const doc = {};
  Object.entries(schema.collections).forEach(([name, desc]) => {
    const value = input[name] === undefined ? [] : input[name];
    doc[name] = check(desc, value, name, errors) || [];
    const ids = new Set();
    doc[name].forEach((record) => {
      if (ids.has(record.id)) errors.push({ path: name, message: `duplicate id "${record.id}"` });
      ids.add(record.id);
    });
  });
  Object.entries(schema.settings || {}).forEach(([name, desc]) => {
    const value = input[name] === undefined ? desc.default : input[name];
    doc[name] = value === undefined ? undefined : check(desc, value, name, errors);
  });

  if (errors.length) throw new ValidationError(errors);
  return doc;
}

module.exports = { S, ValidationError, check, validateRecord, validateDocument, isPlainObject };
