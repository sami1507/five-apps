'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { S, validateRecord, validateDocument, ValidationError } = require('../server/schema');

const person = S.record({
  id: S.id,
  name: S.text(1, 20),
  email: S.email,
  age: S.integer(0, 130),
  joined: S.date,
  role: S.enum(['admin', 'member']),
  nickname: S.optional(S.text(0, 10)),
});

const valid = { id: 'p-1', name: 'Ada', email: '', age: 36, joined: '2026-10-01', role: 'admin' };

test('accepts a valid record and drops unknown keys', () => {
  const cleaned = validateRecord(person, { ...valid, password: 'do-not-store' });
  assert.deepEqual(cleaned, valid);
  assert.equal('password' in cleaned, false);
});

test('optional fields may be omitted', () => {
  const cleaned = validateRecord(person, valid);
  assert.equal('nickname' in cleaned, false);
});

test('reports every problem with its path', () => {
  assert.throws(
    () => validateRecord(person, { id: 'bad id!', name: '', email: 'not-an-email', age: 1.5, joined: '2026-02-30', role: 'owner' }),
    (err) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.status, 422);
      const paths = err.details.map((d) => d.path);
      assert.deepEqual(paths, ['$.id', '$.name', '$.email', '$.age', '$.joined', '$.role']);
      return true;
    },
  );
});

test('flags missing required fields', () => {
  assert.throws(() => validateRecord(person, { id: 'p-2' }), (err) => {
    assert.ok(err.details.some((d) => d.path === '$.name' && d.message === 'is required'));
    return true;
  });
});

test('rejects impossible calendar dates but accepts empty optional dates', () => {
  assert.throws(() => validateRecord(person, { ...valid, joined: '2026-13-01' }));
  assert.equal(validateRecord(person, { ...valid, joined: '' }).joined, '');
});

test('enforces list limits and validates each item', () => {
  const list = S.list(S.integer(0, 9), 2);
  const errors = [];
  assert.throws(() => validateDocument({ collections: { numbers: list }, settings: {} }, { numbers: [1, 2, 3] }));
  try {
    validateDocument({ collections: { numbers: list }, settings: {} }, { numbers: [1, 42] });
  } catch (err) {
    errors.push(...err.details);
  }
  assert.deepEqual(errors.map((e) => e.path), ['numbers[1]']);
});

test('rejects duplicate ids inside a collection', () => {
  const schema = { collections: { people: S.list(person, 10) }, settings: {} };
  assert.throws(
    () => validateDocument(schema, { people: [valid, { ...valid, name: 'Grace' }] }),
    (err) => err.details.some((d) => d.message.includes('duplicate id')),
  );
});

test('rejects unknown top-level fields and fills missing collections with empty lists', () => {
  const schema = { collections: { people: S.list(person, 10) }, settings: { theme: S.enum(['light', 'dark']) } };
  assert.throws(
    () => validateDocument(schema, { people: [], extra: true }),
    (err) => err.details.some((d) => d.path === 'extra' && d.message === 'is not a known field'),
  );
  const doc = validateDocument(schema, { theme: 'dark' });
  assert.deepEqual(doc.people, []);
  assert.equal(doc.theme, 'dark');
});

test('maps validate their keys and values', () => {
  const budgets = S.map(S.number(0, 1000));
  assert.deepEqual(validateRecord(budgets, { Food: 300 }), { Food: 300 });
  assert.throws(() => validateRecord(budgets, { Food: -1 }));
  assert.throws(() => validateRecord(budgets, ['not', 'a', 'map']));
});
