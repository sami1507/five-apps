'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DocumentStore } = require('../server/store');
const { tempDir } = require('./fixtures');

test('writes and reads a document back, including after a restart', () => {
  const dir = tempDir();
  try {
    const first = new DocumentStore(dir);
    assert.equal(first.read('crm'), null);
    first.write('crm', { contacts: [{ id: 'c1' }] });
    assert.deepEqual(first.read('crm'), { contacts: [{ id: 'c1' }] });

    const restarted = new DocumentStore(dir);
    assert.deepEqual(restarted.read('crm'), { contacts: [{ id: 'c1' }] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('leaves no temporary files behind after a write', () => {
  const dir = tempDir();
  try {
    const store = new DocumentStore(dir);
    store.write('finance', { accounts: [] });
    const files = fs.readdirSync(dir);
    assert.deepEqual(files, ['finance.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a transaction that throws writes nothing', () => {
  const dir = tempDir();
  try {
    const store = new DocumentStore(dir);
    store.write('inventory', { products: [{ id: 'p1', stock: 5 }] });
    assert.throws(() => store.transact('inventory', (draft) => {
      draft.products[0].stock = -99;
      throw new Error('rule violated');
    }), /rule violated/);
    assert.equal(store.read('inventory').products[0].stock, 5);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'inventory.json'), 'utf8'));
    assert.equal(onDisk.document.products[0].stock, 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('transact works on a copy, so callers cannot change stored data by accident', () => {
  const dir = tempDir();
  try {
    const store = new DocumentStore(dir);
    store.write('crm', { contacts: [{ id: 'c1', name: 'Ada' }] });
    store.transact('crm', (draft) => {
      draft.contacts[0].name = 'Changed';
      return draft;
    });
    assert.equal(store.read('crm').contacts[0].name, 'Changed');
    assert.equal(new DocumentStore(dir).read('crm').contacts[0].name, 'Changed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('removing a document makes the app uninitialised again', () => {
  const dir = tempDir();
  try {
    const store = new DocumentStore(dir);
    store.write('crm', { contacts: [] });
    store.remove('crm');
    assert.equal(store.read('crm'), null);
    assert.equal(new DocumentStore(dir).read('crm'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses store keys that could escape the data directory', () => {
  const dir = tempDir();
  try {
    const store = new DocumentStore(dir);
    assert.throws(() => store.read('../secrets'), /Invalid store key/);
    assert.throws(() => store.write('a/b', {}), /Invalid store key/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
