'use strict';

const { S } = require('../schema');
const { round2, sum, dayKey } = require('../lib/util');

const TEAM = ['Sarah Lee', 'Mark Parker', 'Dana Khoury', 'Omar Haddad'];
const SOURCES = ['Website', 'Referral', 'LinkedIn', 'Event', 'Cold outreach'];
const STAGE_PROBABILITY = { new: 10, qualified: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 };
const OPEN_STAGES = ['new', 'qualified', 'proposal', 'negotiation'];

const contact = S.record({
  id: S.id,
  name: S.text(1, 120),
  company: S.text(0, 120),
  email: S.email,
  phone: S.text(0, 40),
  status: S.enum(['Lead', 'Prospect', 'Customer']),
  owner: S.enum(TEAM),
  source: S.enum(SOURCES),
  createdAt: S.date,
});

const deal = S.record({
  id: S.id,
  title: S.text(1, 160),
  contactId: S.text(0, 64),
  value: S.number(0, 1e9),
  stage: S.enum(Object.keys(STAGE_PROBABILITY)),
  owner: S.enum(TEAM),
  createdAt: S.date,
  expectedClose: S.date,
  closedAt: S.optional(S.date),
});

const activity = S.record({
  id: S.id,
  type: S.enum(['stage', 'note', 'created']),
  text: S.text(1, 500),
  owner: S.enum(TEAM),
  at: S.datetime,
  dealId: S.optional(S.text(0, 64)),
  contactId: S.optional(S.text(0, 64)),
});

module.exports = {
  key: 'crm',
  name: 'Pulse CRM',
  description: 'Contacts, a deal pipeline with stage probabilities, activity log and sales summary.',
  schema: {
    collections: {
      contacts: S.list(contact, 5000),
      deals: S.list(deal, 5000),
      activities: S.list(activity, 20000),
    },
    settings: {},
  },

  /** Business rules that a single field check cannot express. */
  invariants(doc) {
    const problems = [];
    const contactIds = new Set(doc.contacts.map((c) => c.id));
    const dealIds = new Set(doc.deals.map((d) => d.id));
    doc.deals.forEach((d, i) => {
      if (d.contactId && !contactIds.has(d.contactId)) {
        problems.push({ path: `deals[${i}].contactId`, message: 'refers to a contact that does not exist' });
      }
      if (d.stage === 'won' || d.stage === 'lost') {
        if (!d.closedAt) problems.push({ path: `deals[${i}].closedAt`, message: 'is required for closed deals' });
      }
    });
    doc.activities.forEach((a, i) => {
      if (a.dealId && !dealIds.has(a.dealId)) {
        problems.push({ path: `activities[${i}].dealId`, message: 'refers to a deal that does not exist' });
      }
      if (a.contactId && !contactIds.has(a.contactId)) {
        problems.push({ path: `activities[${i}].contactId`, message: 'refers to a contact that does not exist' });
      }
    });
    return problems;
  },

  summary(doc, now) {
    const open = doc.deals.filter((d) => OPEN_STAGES.includes(d.stage));
    const won = doc.deals.filter((d) => d.stage === 'won');
    const lost = doc.deals.filter((d) => d.stage === 'lost');
    const today = dayKey(now);
    return {
      asOf: today,
      contacts: doc.contacts.length,
      newContactsThisMonth: doc.contacts.filter((c) => c.createdAt.slice(0, 7) === today.slice(0, 7)).length,
      openDeals: open.length,
      openValue: round2(sum(open.map((d) => d.value))),
      weightedPipeline: round2(sum(open.map((d) => (d.value * STAGE_PROBABILITY[d.stage]) / 100))),
      wonDeals: won.length,
      wonValue: round2(sum(won.map((d) => d.value))),
      winRate: won.length + lost.length ? round2((won.length / (won.length + lost.length)) * 100) : 0,
    };
  },
};
