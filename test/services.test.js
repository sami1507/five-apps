'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { DocumentStore } = require('../server/store');
const { createService, ServiceError } = require('../server/service');
const { ValidationError } = require('../server/schema');
const { apps } = require('../server/apps');
const { tempDir, documents } = require('./fixtures');

function setup() {
  const dir = tempDir('five-apps-service');
  const store = new DocumentStore(dir);
  const service = createService({ store, apps });
  return { dir, store, service, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const NOW = new Date(2026, 9, 16, 12, 0, 0); // 16 October 2026, local time

function expectRejection(fn, status, pathPart) {
  let caught;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'expected the call to be rejected');
  assert.equal(caught.status, status);
  if (pathPart) assert.ok(caught.details.some((d) => d.path.includes(pathPart)), `no detail mentions ${pathPart}`);
  return caught;
}

test('init stores a valid document once; a second init is a conflict', () => {
  const { service, cleanup } = setup();
  try {
    assert.equal(service.listApps().find((a) => a.key === 'crm').initialized, false);
    service.init('crm', documents.crm());
    assert.equal(service.listApps().find((a) => a.key === 'crm').initialized, true);
    assert.equal(service.getState('crm').contacts.length, 2);
    expectRejection(() => service.init('crm', documents.crm()), 409);
  } finally {
    cleanup();
  }
});

test('reading an uninitialised app is a 404 with a helpful message', () => {
  const { service, cleanup } = setup();
  try {
    const err = expectRejection(() => service.getState('finance'), 404);
    assert.match(err.message, /no data yet/);
  } finally {
    cleanup();
  }
});

test('an unknown app key is a 404', () => {
  const { service, cleanup } = setup();
  try {
    assert.throws(() => service.getState('payroll'), (err) => err instanceof ServiceError && err.status === 404);
  } finally {
    cleanup();
  }
});

test('a sync batch is applied as one unit', () => {
  const { service, cleanup } = setup();
  try {
    service.init('crm', documents.crm());
    const result = service.sync('crm', {
      ops: [
        { op: 'upsert', collection: 'contacts', record: { ...documents.crm().contacts[0], status: 'Customer' } },
        { op: 'delete', collection: 'activities', id: 'a1' },
        { op: 'upsert', collection: 'contacts', record: { id: 'c3', name: 'Linus', company: '', email: '', phone: '', status: 'Lead', owner: 'Dana Khoury', source: 'Event', createdAt: '2026-10-16' } },
      ],
    });
    assert.deepEqual(result, { applied: 3, upserted: 2, deleted: 1, settings: 0 });
    const state = service.getState('crm');
    assert.equal(state.contacts.find((c) => c.id === 'c1').status, 'Customer');
    assert.equal(state.contacts.length, 3);
    assert.equal(state.activities.length, 0);
  } finally {
    cleanup();
  }
});

test('one invalid operation rejects the whole batch and stores nothing', () => {
  const { service, cleanup } = setup();
  try {
    service.init('crm', documents.crm());
    const before = JSON.stringify(service.getState('crm'));
    expectRejection(() => service.sync('crm', {
      ops: [
        { op: 'upsert', collection: 'contacts', record: { ...documents.crm().contacts[0], name: 'Renamed' } },
        { op: 'upsert', collection: 'contacts', record: { id: 'bad', name: '', company: '', email: '', phone: '', status: 'Lead', owner: 'Sarah Lee', source: 'Website', createdAt: '2026-10-16' } },
      ],
    }), 422, 'ops[1].record.name');
    assert.equal(JSON.stringify(service.getState('crm')), before);
  } finally {
    cleanup();
  }
});

test('sync validates the batch format and size', () => {
  const { service, cleanup } = setup();
  try {
    service.init('crm', documents.crm());
    expectRejection(() => service.sync('crm', {}), 400);
    expectRejection(() => service.sync('crm', { ops: [{ op: 'explode' }] }), 422, 'ops[0].op');
    expectRejection(() => service.sync('crm', { ops: [{ op: 'upsert', collection: 'payments', record: {} }] }), 422, 'collection');
    expectRejection(() => service.sync('crm', { ops: new Array(501).fill({ op: 'delete', collection: 'deals', id: 'x' }) }), 413);
  } finally {
    cleanup();
  }
});

test('syncing an app that was never initialised is a 404', () => {
  const { service, cleanup } = setup();
  try {
    assert.throws(() => service.sync('crm', { ops: [] }), (err) => err.status === 404);
  } finally {
    cleanup();
  }
});

test('reset removes the document so the app can be initialised again', () => {
  const { service, cleanup } = setup();
  try {
    service.init('inventory', documents.inventory());
    service.reset('inventory');
    assert.equal(service.listApps().find((a) => a.key === 'inventory').initialized, false);
    service.init('inventory', documents.inventory());
    assert.equal(service.getState('inventory').company, 'Inventix Trading');
  } finally {
    cleanup();
  }
});

test('CRM: closed deals need a close date and deals must point at real contacts', () => {
  const { service, cleanup } = setup();
  try {
    service.init('crm', documents.crm());
    expectRejection(() => service.sync('crm', {
      ops: [{ op: 'upsert', collection: 'deals', record: { ...documents.crm().deals[0], contactId: 'ghost' } }],
    }), 422, 'contactId');
    expectRejection(() => service.sync('crm', {
      ops: [{ op: 'upsert', collection: 'deals', record: { ...documents.crm().deals[0], stage: 'won' } }],
    }), 422, 'closedAt');
  } finally {
    cleanup();
  }
});

test('CRM summary reports pipeline value, weighted forecast and win rate', () => {
  const { service, cleanup } = setup();
  try {
    service.init('crm', documents.crm());
    const summary = service.summary('crm', NOW);
    assert.equal(summary.openDeals, 1);
    assert.equal(summary.openValue, 1000);
    assert.equal(summary.weightedPipeline, 500); // proposal stage, 50 percent
    assert.equal(summary.wonValue, 2000);
    assert.equal(summary.winRate, 50);
  } finally {
    cleanup();
  }
});

test('inventory: stock can never go negative and zones must exist', () => {
  const { service, cleanup } = setup();
  try {
    service.init('inventory', documents.inventory());
    const product = documents.inventory().products[0];
    expectRejection(() => service.sync('inventory', {
      ops: [{ op: 'upsert', collection: 'products', record: { ...product, stock: -1 } }],
    }), 422, 'stock');
    expectRejection(() => service.sync('inventory', {
      ops: [{ op: 'upsert', collection: 'products', record: { ...product, zoneId: 'nowhere' } }],
    }), 422, 'zoneId');
  } finally {
    cleanup();
  }
});

test('inventory summary counts reserved stock and low-stock products', () => {
  const { service, cleanup } = setup();
  try {
    service.init('inventory', documents.inventory());
    const summary = service.summary('inventory', NOW);
    assert.equal(summary.products, 2);
    assert.equal(summary.lowStock, 1); // strawberries: 3 in stock, reorder at 8
    assert.equal(summary.activeOrders, 1);
    assert.equal(summary.unitsSold, 5);
    assert.equal(summary.activeRevenue, 20);
  } finally {
    cleanup();
  }
});

test('finance: transactions must reference an existing account and match their category', () => {
  const { service, cleanup } = setup();
  try {
    service.init('finance', documents.finance());
    const tx = documents.finance().transactions[1];
    expectRejection(() => service.sync('finance', {
      ops: [{ op: 'upsert', collection: 'transactions', record: { ...tx, accountId: 'missing' } }],
    }), 422, 'accountId');
    expectRejection(() => service.sync('finance', {
      ops: [{ op: 'upsert', collection: 'transactions', record: { ...tx, type: 'income' } }],
    }), 422, 'category');
  } finally {
    cleanup();
  }
});

test('finance: budgets only apply to expense categories', () => {
  const { service, cleanup } = setup();
  try {
    service.init('finance', documents.finance());
    expectRejection(() => service.sync('finance', {
      ops: [{ op: 'setting', key: 'budgets', value: { Salary: 100 } }],
    }), 422, 'budgets.Salary');
    service.sync('finance', { ops: [{ op: 'setting', key: 'budgets', value: { Groceries: 500 } }] });
    assert.deepEqual(service.getState('finance').budgets, { Groceries: 500 });
  } finally {
    cleanup();
  }
});

test('finance summary: net worth, liquid cash and budgets over the limit', () => {
  const { service, cleanup } = setup();
  try {
    service.init('finance', documents.finance());
    const summary = service.summary('finance', NOW);
    assert.equal(summary.income, 4200);
    assert.equal(summary.expenses, 1234.5);
    assert.equal(summary.net, 2965.5);
    // Pending transactions do not move balances: 3200 + 4200 on checking, -300 - 84.5 on the card.
    assert.equal(summary.netWorth, 7015.5);
    assert.equal(summary.liquidCash, 7400);
    assert.deepEqual(summary.budgetsOverLimit, []);
  } finally {
    cleanup();
  }
});

test('job tracker: a job cannot have an interview without a date', () => {
  const { service, cleanup } = setup();
  try {
    service.init('job-tracker', documents['job-tracker']());
    const job = documents['job-tracker']().jobs[0];
    const bad = { ...job, interviews: [{ ...job.interviews[0], date: '' }] };
    expectRejection(() => service.sync('job-tracker', { ops: [{ op: 'upsert', collection: 'jobs', record: bad }] }), 422, 'interviews[0].date');
  } finally {
    cleanup();
  }
});

test('job tracker summary counts follow-ups due in the next three days and upcoming interviews', () => {
  const { service, cleanup } = setup();
  try {
    service.init('job-tracker', documents['job-tracker']());
    const summary = service.summary('job-tracker', NOW);
    assert.equal(summary.active, 1);
    // The follow-up was due on 15 October; on 16 October it is overdue, and overdue counts as due.
    assert.equal(summary.followUpsDue, 1);
    assert.equal(summary.overdueFollowUps, 1);
    assert.equal(summary.upcomingInterviews, 1);
    assert.equal(summary.offers, 1);
  } finally {
    cleanup();
  }
});

test('job tracker calendar feed lists follow-ups and upcoming interviews', () => {
  const { service, cleanup } = setup();
  try {
    service.init('job-tracker', documents['job-tracker']());
    const feed = service.route('job-tracker', 'calendar.ics', NOW);
    assert.equal(feed.contentType, 'text/calendar; charset=utf-8');
    assert.equal(feed.filename, 'hireboard-calendar.ics');
    assert.match(feed.body, /BEGIN:VCALENDAR/);
    assert.match(feed.body, /SUMMARY:Follow up: Netflix/);
    assert.match(feed.body, /SUMMARY:Technical: Netflix/);
    assert.equal((feed.body.match(/BEGIN:VEVENT/g) || []).length, 2);
  } finally {
    cleanup();
  }
});

test('document assistant: a document may not exceed the per-document character limit', () => {
  const { service, cleanup } = setup();
  try {
    service.init('doc-assistant', documents['doc-assistant']());
    const huge = 'x'.repeat(20000);
    const chunks = Array.from({ length: 420 }, (_, i) => ({ id: `big:${i}`, page: 1, text: huge }));
    const doc = { ...documents['doc-assistant']().documents[0], id: 'big', chunks };
    expectRejection(() => service.sync('doc-assistant', { ops: [{ op: 'upsert', collection: 'documents', record: doc }] }), 422, 'chunks');
  } finally {
    cleanup();
  }
});

test('a rejected init leaves the app uninitialised', () => {
  const { service, cleanup } = setup();
  try {
    assert.throws(() => service.init('finance', { accounts: [{ id: 'a1' }] }), ValidationError);
    assert.equal(service.listApps().find((a) => a.key === 'finance').initialized, false);
  } finally {
    cleanup();
  }
});
