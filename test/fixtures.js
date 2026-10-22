'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** A fresh temporary directory for a test. Remove it with cleanup(). */
function tempDir(label = 'five-apps-test') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

/** Minimal documents that satisfy every app's schema and business rules. */
const documents = {
  crm: () => ({
    contacts: [
      { id: 'c1', name: 'Ada Lovelace', company: 'Analytical Engines', email: 'ada@example.com', phone: '', status: 'Lead', owner: 'Sarah Lee', source: 'Website', createdAt: '2026-10-01' },
      { id: 'c2', name: 'Grace Hopper', company: 'Navy Systems', email: '', phone: '+1 555 0100', status: 'Customer', owner: 'Mark Parker', source: 'Referral', createdAt: '2026-09-01' },
    ],
    deals: [
      { id: 'd1', title: 'Pilot programme', contactId: 'c1', value: 1000, stage: 'proposal', owner: 'Sarah Lee', createdAt: '2026-10-01', expectedClose: '2026-11-01' },
      { id: 'd2', title: 'Renewal', contactId: 'c2', value: 2000, stage: 'won', owner: 'Mark Parker', createdAt: '2026-08-01', expectedClose: '2026-09-10', closedAt: '2026-09-10' },
      { id: 'd3', title: 'Cold lead', contactId: '', value: 500, stage: 'lost', owner: 'Sarah Lee', createdAt: '2026-07-01', expectedClose: '2026-07-20', closedAt: '2026-07-20' },
    ],
    activities: [
      { id: 'a1', type: 'note', text: 'Sent proposal.', owner: 'Sarah Lee', at: '2026-10-02T10:30', contactId: 'c1' },
    ],
  }),

  inventory: () => ({
    zones: [{ id: 'z1', name: 'Fruits', block: 'Block A', capacity: 1000 }],
    products: [
      { id: 'p1', sku: 'SKU-1001', name: 'Lemon (per kg)', category: 'Fruits', price: 4, cost: 2.1, stock: 40, reorder: 10, zoneId: 'z1' },
      { id: 'p2', sku: 'SKU-1002', name: 'Strawberries 500g', category: 'Fruits', price: 6, cost: 3.5, stock: 3, reorder: 8, zoneId: '' },
    ],
    orders: [
      {
        id: 'o1', number: 'ORD-1001', customer: 'Maya Haddad', date: '2026-10-03', status: 'delivered',
        items: [{ productId: 'p1', name: 'Lemon (per kg)', qty: 5, price: 4 }],
      },
    ],
    purchases: [{ id: 'pu1', date: '2026-10-01', productId: 'p1', qty: 50, unitCost: 2.1 }],
    company: 'Inventix Trading',
  }),

  'job-tracker': () => ({
    jobs: [
      {
        id: 'j1', company: 'Netflix', role: 'Senior UI Engineer', location: 'Los Gatos, CA', source: 'Company website',
        salary: '$180k–$220k', link: 'https://careers.example.com/senior-ui', status: 'applied', archiveReason: '',
        appliedDate: '2026-10-07', followUp: '2026-10-15', notes: 'Applied through the careers site.',
        contactName: 'Maya Haddad', contactEmail: 'maya@example.com', contactPhone: '',
        interviews: [{ id: 'i1', date: '2026-10-25', time: '14:00', type: 'Technical', interviewer: 'Lead engineer', notes: '', done: false }],
        activity: [{ id: 'e1', at: '2026-10-07T09:00', text: 'Moved from New to Applied' }],
        createdAt: '2026-10-07', updatedAt: '2026-10-07',
      },
      {
        id: 'j2', company: 'Google', role: 'AI Researcher', location: 'Mountain View, CA', source: 'LinkedIn',
        salary: '', link: '', status: 'accepted', archiveReason: '', appliedDate: '2026-08-20', followUp: '',
        notes: '', contactName: '', contactEmail: '', contactPhone: '',
        interviews: [{ id: 'i2', date: '2026-09-01', time: '', type: 'Final', interviewer: '', notes: 'Strong feedback', done: true }],
        activity: [], createdAt: '2026-08-20', updatedAt: '2026-09-02',
      },
    ],
  }),

  finance: () => ({
    accounts: [
      { id: 'a1', name: 'Main checking', type: 'Checking', opening: 3200 },
      { id: 'a2', name: 'Visa', type: 'Credit card', opening: -300 },
    ],
    transactions: [
      { id: 't1', date: '2026-10-01', description: 'Salary', category: 'Salary', type: 'income', amount: 4200, accountId: 'a1', status: 'completed' },
      { id: 't2', date: '2026-10-02', description: 'Supermarket', category: 'Groceries', type: 'expense', amount: 84.5, accountId: 'a2', status: 'completed' },
      { id: 't3', date: '2026-10-03', description: 'Rent', category: 'Housing', type: 'expense', amount: 1150, accountId: 'a1', status: 'pending' },
    ],
    budgets: { Groceries: 400, Housing: 1200 },
  }),

  'doc-assistant': () => ({
    documents: [
      {
        id: 'doc1', name: 'lease.txt', ext: 'TXT', size: 1200, uploadedAt: '2026-10-05T11:20', pageLabel: 'Section',
        pageCount: 1, wordCount: 40,
        chunks: [{ id: 'doc1:0', page: 1, text: 'The tenant pays a monthly rent of 2400 dollars.' }],
      },
    ],
  }),
};

module.exports = { tempDir, documents };
