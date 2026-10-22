/* Pulse CRM: contacts, a drag-and-drop deal pipeline and sales reporting.
   All data is stored in this browser (localStorage). */
window.Store.ready.then(function () {
  'use strict';

  const U = window.UI;
  const {
    $, $$, esc, icon, money, num, pct, avatar, badge, hbar, sum, uid,
    toISO, today, addDays, fmtDate, lastMonths, monthKey, monthLabel,
    toCSV, downloadFile, emptyState, field, input, select, toast, confirmDialog, openModal,
    barChart, sparkline, initTheme, initShell, initRouter, createStore,
  } = U;

  const KEY = 'pulse-crm-v1';
  const TEAM = ['Sarah Lee', 'Mark Parker', 'Dana Khoury', 'Omar Haddad'];
  const SOURCES = ['Website', 'Referral', 'LinkedIn', 'Event', 'Cold outreach'];
  const CONTACT_STATUSES = ['Lead', 'Prospect', 'Customer'];
  const STATUS_TONE = { Customer: 'success', Prospect: 'accent', Lead: 'warning' };
  const STAGES = [
    { id: 'new', label: 'New Leads', prob: 10, color: '#6366f1' },
    { id: 'qualified', label: 'Qualified', prob: 25, color: '#0ea5e9' },
    { id: 'proposal', label: 'Proposal', prob: 50, color: '#f59e0b' },
    { id: 'negotiation', label: 'Negotiation', prob: 75, color: '#ec4899' },
    { id: 'won', label: 'Closed Won', prob: 100, color: '#10b981' },
    { id: 'lost', label: 'Lost', prob: 0, color: '#94a3b8' },
  ];
  const OPEN_IDS = ['new', 'qualified', 'proposal', 'negotiation'];
  const stageOf = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
  const isOpen = (d) => OPEN_IDS.includes(d.stage);
  const isClosed = (stage) => stage === 'won' || stage === 'lost';
  const pad2 = (n) => String(n).padStart(2, '0');
  const nowISO = () => {
    const d = new Date();
    return `${toISO(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  /* ---------- Seed data ---------- */
  function seed() {
    const t = today();
    const contacts = [
      ['c1', 'Carla Mansour', 'Northwind Traders', 'carla@northwind.example', '+961 70 123 456', 'Customer', 'Sarah Lee', 'Referral', -95],
      ['c2', 'Youssef Nassar', 'Bright Flow', 'youssef@brightflow.example', '+961 71 555 210', 'Prospect', 'Mark Parker', 'Website', -40],
      ['c3', 'Lina Khoury', 'Zen Solutions', 'lina@zensolutions.example', '+961 3 884 102', 'Customer', 'Dana Khoury', 'LinkedIn', -120],
      ['c4', 'Jad Sleiman', 'Cedar Labs', 'jad@cedarlabs.example', '+961 76 220 318', 'Lead', 'Omar Haddad', 'Event', -12],
      ['c5', 'Mia Chen', 'Summit Realty', 'mia@summitrealty.example', '+1 415 555 0142', 'Prospect', 'Sarah Lee', 'Cold outreach', -26],
      ['c6', 'Hadi Farah', 'Atlas Logistics', 'hadi@atlaslog.example', '+961 81 407 933', 'Lead', 'Mark Parker', 'Website', -5],
      ['c7', 'Nour El-Din', 'Blue Harbor Co.', 'nour@blueharbor.example', '+961 70 908 611', 'Customer', 'Dana Khoury', 'Referral', -160],
      ['c8', 'Elena Rossi', 'Orbit Health', 'elena@orbithealth.example', '+39 02 5550 1923', 'Prospect', 'Sarah Lee', 'LinkedIn', -33],
      ['c9', 'Rami Saab', 'Levant Foods', 'rami@levantfoods.example', '+961 3 610 455', 'Lead', 'Omar Haddad', 'Website', -2],
      ['c10', 'Sophie Laurent', 'Nova Textiles', 'sophie@novatextiles.example', '+33 1 55 50 12 34', 'Prospect', 'Mark Parker', 'Event', -18],
      ['c11', 'David Kim', 'Pioneer Motors', 'david@pioneermotors.example', '+1 212 555 0198', 'Customer', 'Sarah Lee', 'Cold outreach', -210],
      ['c12', 'Layla Haddad', 'Maple Retail', 'layla@mapleretail.example', '+961 78 330 071', 'Lead', 'Dana Khoury', 'Website', -9],
    ].map(([id, name, company, email, phone, status, owner, source, ago]) => ({
      id, name, company, email, phone, status, owner, source, createdAt: addDays(t, ago),
    }));

    // [id, title, contactId, value, stage, owner, createdAgo, closeIn]  (closeIn < 0 means already closed)
    const deal = (id, title, contactId, value, stage, owner, createdAgo, closeIn) => ({
      id, title, contactId, value, stage, owner,
      createdAt: addDays(t, createdAgo),
      expectedClose: addDays(t, closeIn),
      ...(isClosed(stage) ? { closedAt: addDays(t, closeIn) } : {}),
    });
    const deals = [
      deal('d1', 'Website redesign', 'c1', 4300, 'won', 'Sarah Lee', -40, -12),
      deal('d2', 'Annual support contract', 'c3', 12800, 'won', 'Dana Khoury', -70, -30),
      deal('d3', 'ERP integration', 'c7', 8600, 'won', 'Dana Khoury', -95, -48),
      deal('d4', 'Fleet tracking pilot', 'c11', 5200, 'won', 'Sarah Lee', -120, -70),
      deal('d5', 'Retail kiosk rollout', 'c11', 6900, 'won', 'Dana Khoury', -150, -102),
      deal('d6', 'Security audit', 'c8', 3900, 'lost', 'Omar Haddad', -50, -20),
      deal('d7', 'Mobile app retainer', 'c2', 6700, 'lost', 'Mark Parker', -80, -55),
      deal('d8', 'Brand identity package', 'c2', 3100, 'proposal', 'Mark Parker', -14, 14),
      deal('d9', 'Warehouse analytics', 'c6', 9400, 'negotiation', 'Mark Parker', -22, 21),
      deal('d10', 'Office lease advisory', 'c5', 2750, 'qualified', 'Sarah Lee', -9, 30),
      deal('d11', 'Cloud migration', 'c8', 15600, 'proposal', 'Sarah Lee', -30, 18),
      deal('d12', 'Packaging redesign', 'c9', 4800, 'new', 'Omar Haddad', -3, 45),
      deal('d13', 'Food distribution app', 'c4', 7300, 'qualified', 'Omar Haddad', -16, 35),
      deal('d14', 'Loyalty program', 'c12', 2200, 'new', 'Dana Khoury', -2, 40),
      deal('d15', 'Event booking platform', 'c10', 6100, 'negotiation', 'Mark Parker', -26, 10),
    ];

    const at = (days, time) => `${addDays(t, days)}T${time}`;
    const activities = [
      { id: uid(), type: 'stage', text: 'Cloud migration moved to Proposal', owner: 'Sarah Lee', at: at(-1, '10:20'), dealId: 'd11' },
      { id: uid(), type: 'note', text: 'Sent revised SOW to Orbit Health. Waiting on legal review.', owner: 'Sarah Lee', at: at(-1, '16:05'), contactId: 'c8' },
      { id: uid(), type: 'stage', text: 'Warehouse analytics moved to Negotiation', owner: 'Mark Parker', at: at(-2, '11:40'), dealId: 'd9' },
      { id: uid(), type: 'created', text: 'New deal: Loyalty program', owner: 'Dana Khoury', at: at(-2, '09:15'), dealId: 'd14' },
      { id: uid(), type: 'note', text: 'Discovery call done. Wants pricing for three locations.', owner: 'Omar Haddad', at: at(-3, '14:30'), contactId: 'c9' },
      { id: uid(), type: 'stage', text: 'Event booking platform moved to Negotiation', owner: 'Mark Parker', at: at(-5, '12:00'), dealId: 'd15' },
      { id: uid(), type: 'stage', text: 'Website redesign closed won', owner: 'Sarah Lee', at: at(-12, '17:45'), dealId: 'd1' },
      { id: uid(), type: 'note', text: 'Renewal call with Zen Solutions set for next month.', owner: 'Dana Khoury', at: at(-14, '09:50'), contactId: 'c3' },
    ];

    return { contacts, deals, activities };
  }

  /* ---------- State ---------- */
  const store = createStore(KEY, seed);
  const db = () => store.get();
  const ui = { view: 'dashboard', contactStatus: 'all', contactOwner: 'all', query: '' };

  const contactById = (id) => db().contacts.find((c) => c.id === id);
  const companyOf = (deal) => {
    const c = contactById(deal.contactId);
    return c ? c.company : '';
  };
  const valueOf = (ids, list = db().deals) => sum(list.filter((d) => ids.includes(d.stage)).map((d) => d.value));

  function metrics() {
    const { deals, contacts } = db();
    const open = deals.filter(isOpen);
    const won = deals.filter((d) => d.stage === 'won');
    const lost = deals.filter((d) => d.stage === 'lost');
    const thisMonth = monthKey(today());
    return {
      contacts: contacts.length,
      newContacts: contacts.filter((c) => monthKey(c.createdAt) === thisMonth).length,
      open,
      openValue: sum(open.map((d) => d.value)),
      weighted: sum(open.map((d) => (d.value * stageOf(d.stage).prob) / 100)),
      won,
      wonValue: sum(won.map((d) => d.value)),
      lost,
      conversion: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0,
    };
  }

  /* ---------- Rendering helpers ---------- */
  const statCard = (label, value, foot, iconName, extra = '') => `
    <article class="card stat">
      <div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon(iconName)}</span></div>
      <div class="stat-value">${esc(value)}</div>
      ${extra}
      <div class="stat-foot"><span>${esc(foot)}</span></div>
    </article>`;

  const statusBadge = (status) => badge(status, STATUS_TONE[status] || '');

  function timeAgo(at) {
    const minutes = (Date.now() - new Date(at).getTime()) / 60000;
    if (minutes < 60) return minutes < 2 ? 'just now' : `${Math.floor(minutes)}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return fmtDate(at.slice(0, 10), true);
  }

  const FEED_ICON = { stage: 'arrow', note: 'message', created: 'star' };
  const feedItem = (a) => `
    <li>
      <span class="feed-icon ${esc(a.type)}">${icon(FEED_ICON[a.type] || 'clock')}</span>
      <div>
        <p>${esc(a.text)}</p>
        <small>${esc(a.owner)} · ${esc(timeAgo(a.at))}</small>
      </div>
    </li>`;

  const dealCard = (d) => {
    const closed = isClosed(d.stage);
    const when = closed ? `Closed ${fmtDate(d.closedAt || d.expectedClose, true)}` : `Close ${fmtDate(d.expectedClose, true)}`;
    return `
      <article class="deal-card" draggable="true" data-deal="${esc(d.id)}" title="Drag to move, click to edit">
        <div class="deal-top">
          <strong>${esc(d.title)}</strong>
          <button type="button" class="icon-btn sm" data-action="edit-deal" data-id="${esc(d.id)}" aria-label="Edit deal">${icon('edit')}</button>
        </div>
        <div class="deal-company">${esc(companyOf(d) || 'No contact linked')}</div>
        <div class="deal-value">${money(d.value)}</div>
        <div class="deal-foot">${avatar(d.owner, 'sm')}<span>${esc(when)}</span></div>
      </article>`;
  };

  /* ---------- Views ---------- */
  function renderSidebar() {
    const m = metrics();
    $('#sidebar-forecast').innerHTML = `
      <div class="forecast">
        <small>Weighted forecast</small>
        <strong>${money(m.weighted)}</strong>
        <small>${money(m.openValue)} across ${m.open.length} open deals</small>
      </div>`;
  }

  function renderDashboard() {
    const m = metrics();
    const { contacts, deals } = db();
    const months = lastMonths(6);
    const labels = months.map(monthLabel);
    const contactGrowth = months.map((k) => contacts.filter((c) => monthKey(c.createdAt) <= k).length);
    const dealsCreated = months.map((k) => deals.filter((d) => monthKey(d.createdAt) === k).length);
    const wonByMonth = months.map((k) => sum(deals.filter((d) => d.stage === 'won' && monthKey(d.closedAt) === k).map((d) => d.value)));

    $('#dash-stats').innerHTML = [
      statCard('Total contacts', num(m.contacts), `+${m.newContacts} added this month`, 'users', sparkline(contactGrowth)),
      statCard('Open deals', num(m.open.length), `${money(m.weighted)} weighted forecast`, 'briefcase', sparkline(dealsCreated)),
      statCard('Won revenue', money(m.wonValue), `${m.won.length} deals closed`, 'dollar', sparkline(wonByMonth)),
      statCard('Conversion rate', pct(m.conversion), `${m.won.length} won · ${m.lost.length} lost`, 'target'),
    ].join('');

    $('#dash-revenue').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Revenue closed</h3>
          <div class="card-sub">Won deal value per month, last 6 months</div>
        </div>
        <span class="badge accent plain">${money(sum(wonByMonth))} in period</span>
      </div>
      ${barChart(labels, [{ name: 'Won revenue', color: 'var(--accent)', values: wonByMonth }], {
        prefix: '$', format: (v) => money(v), label: 'Won revenue by month',
      })}`;

    const recent = [...db().activities].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    $('#dash-activity').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Recent activity</h3>
          <div class="card-sub">Latest updates across the team</div>
        </div>
      </div>
      <ul class="feed">${recent.map(feedItem).join('') || '<li class="muted">No activity yet.</li>'}</ul>`;

    const stageRows = STAGES.filter((s) => s.id !== 'lost');
    const stageValues = stageRows.map((s) => valueOf([s.id]));
    const maxStage = Math.max(1, ...stageValues);
    $('#dash-pipeline').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Pipeline by stage</h3>
          <div class="card-sub">${num(m.open.length)} open deals · ${money(m.openValue)}</div>
        </div>
      </div>
      <div class="stack">
        ${stageRows.map((s, i) => {
          const count = deals.filter((d) => d.stage === s.id).length;
          return hbar(`${s.label} (${count})`, stageValues[i], maxStage, money(stageValues[i]), s.color);
        }).join('')}
      </div>`;

    const top = deals.filter(isOpen).sort((a, b) => b.value - a.value).slice(0, 5);
    $('#dash-top').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Largest open deals</h3>
          <div class="card-sub">Ranked by value</div>
        </div>
        <button type="button" class="btn sm" data-action="goto-pipeline">Open pipeline</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Deal</th><th>Owner</th><th>Stage</th><th class="num">Value</th></tr></thead>
          <tbody>
            ${top.map((d) => `
              <tr>
                <td><strong>${esc(d.title)}</strong><small>${esc(companyOf(d) || '—')}</small></td>
                <td><span class="owner-cell">${avatar(d.owner, 'sm')}${esc(d.owner)}</span></td>
                <td>${badge(stageOf(d.stage).label, 'accent')}</td>
                <td class="num">${money(d.value)}</td>
              </tr>`).join('') || '<tr><td colspan="4" class="muted">No open deals.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function renderContacts() {
    const q = ui.query.trim().toLowerCase();
    const rows = db().contacts
      .filter((c) => ui.contactStatus === 'all' || c.status === ui.contactStatus)
      .filter((c) => ui.contactOwner === 'all' || c.owner === ui.contactOwner)
      .filter((c) => !q || [c.name, c.company, c.email, c.phone].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    $('#contacts-sub').textContent = `${db().contacts.length} contacts · ${rows.length} shown`;

    $('#contacts-table').innerHTML = rows.length ? `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Contact</th><th>Company</th><th>Status</th><th>Owner</th><th class="hide-md">Source</th><th class="num">Deals</th><th class="actions"></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((c) => {
              const deals = db().deals.filter((d) => d.contactId === c.id).length;
              return `
              <tr>
                <td>
                  <div class="contact-main contact-link" data-action="open-contact" data-id="${esc(c.id)}">
                    ${avatar(c.name)}
                    <div><strong>${esc(c.name)}</strong><small>${esc(c.email || c.phone)}</small></div>
                  </div>
                </td>
                <td>${esc(c.company)}</td>
                <td>${statusBadge(c.status)}</td>
                <td><span class="owner-cell">${avatar(c.owner, 'sm')}${esc(c.owner)}</span></td>
                <td class="hide-md">${esc(c.source)}</td>
                <td class="num count-cell">${deals}</td>
                <td class="actions">
                  <button type="button" class="icon-btn sm" data-action="edit-contact" data-id="${esc(c.id)}" aria-label="Edit contact">${icon('edit')}</button>
                  <button type="button" class="icon-btn sm danger" data-action="delete-contact" data-id="${esc(c.id)}" aria-label="Delete contact">${icon('trash')}</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : emptyState('users', 'No contacts match these filters',
        'Try a different status or owner, or clear the search.',
        '<button type="button" class="btn primary" data-action="new-contact"><span data-icon="plus"></span>Add contact</button>');
  }

  function renderPipeline() {
    const q = ui.query.trim().toLowerCase();
    const deals = db().deals.filter((d) => !q || [d.title, companyOf(d), d.owner].join(' ').toLowerCase().includes(q));
    const m = metrics();
    $('#pipe-summary').textContent = `${money(m.openValue)} open · ${money(m.weighted)} weighted`;

    $('#board').innerHTML = STAGES.map((stage) => {
      const items = deals.filter((d) => d.stage === stage.id);
      return `
        <div class="column" data-stage="${stage.id}" style="--c:${stage.color}">
          <div class="column-head">
            <span class="column-dot"></span>
            <strong>${esc(stage.label)}</strong>
            <span class="column-count">${items.length}</span>
            <span class="column-total">${money(sum(items.map((d) => d.value)))}</span>
          </div>
          <div class="column-body">
            ${items.map(dealCard).join('') || '<div class="column-empty">Drop deals here</div>'}
          </div>
        </div>`;
    }).join('');
  }

  function renderReports() {
    const { deals } = db();
    const months = lastMonths(12);
    const won = months.map((k) => sum(deals.filter((d) => d.stage === 'won' && monthKey(d.closedAt) === k).map((d) => d.value)));
    const created = months.map((k) => sum(deals.filter((d) => monthKey(d.createdAt) === k).map((d) => d.value)));

    $('#rep-monthly').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Pipeline created vs. revenue won</h3>
          <div class="card-sub">Deal value by month, last 12 months</div>
        </div>
      </div>
      ${barChart(months.map(monthLabel), [
        { name: 'Created', color: '#94a3b8', values: created },
        { name: 'Won', color: 'var(--accent)', values: won },
      ], { prefix: '$', format: (v) => money(v), label: 'Pipeline created and revenue won by month', height: 280 })}
      <div class="legend" style="margin-top: 12px;">
        <span><i style="background:#94a3b8"></i>Created</span>
        <span><i style="background:var(--accent)"></i>Won</span>
      </div>`;

    const total = deals.length || 1;
    $('#rep-funnel').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Stage funnel</h3>
          <div class="card-sub">Share of deals by stage, with value</div>
        </div>
      </div>
      <div class="stack">
        ${STAGES.map((s) => {
          const items = deals.filter((d) => d.stage === s.id);
          return hbar(s.label, items.length, total, `${items.length} · ${money(sum(items.map((d) => d.value)))}`, s.color);
        }).join('')}
      </div>`;

    const rows = TEAM.map((owner) => {
      const mine = deals.filter((d) => d.owner === owner);
      const openDeals = mine.filter(isOpen);
      const wonDeals = mine.filter((d) => d.stage === 'won');
      const lostDeals = mine.filter((d) => d.stage === 'lost');
      const closed = wonDeals.length + lostDeals.length;
      return {
        owner,
        open: openDeals.length,
        won: wonDeals.length,
        lost: lostDeals.length,
        wonValue: sum(wonDeals.map((d) => d.value)),
        winRate: closed ? (wonDeals.length / closed) * 100 : 0,
        weighted: sum(openDeals.map((d) => (d.value * stageOf(d.stage).prob) / 100)),
      };
    });
    $('#rep-team').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Team performance</h3>
          <div class="card-sub">All deals grouped by owner</div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Owner</th><th class="num">Open</th><th class="num">Won</th><th class="num">Lost</th><th class="num">Won value</th><th class="num">Win rate</th><th class="num">Weighted</th></tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td><span class="owner-cell">${avatar(r.owner, 'sm')}<strong>${esc(r.owner)}</strong></span></td>
                <td class="num">${r.open}</td>
                <td class="num">${r.won}</td>
                <td class="num">${r.lost}</td>
                <td class="num">${money(r.wonValue)}</td>
                <td class="num">${pct(r.winRate)}</td>
                <td class="num">${money(r.weighted)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderSettings() {
    $('#settings-team').innerHTML = TEAM.map((owner) => {
      const contacts = db().contacts.filter((c) => c.owner === owner).length;
      const open = db().deals.filter((d) => d.owner === owner && isOpen(d)).length;
      return `
        <div class="team-row">
          ${avatar(owner)}
          <div><strong>${esc(owner)}</strong><small>${contacts} contacts · ${open} open deals</small></div>
        </div>`;
    }).join('');
  }

  function render() {
    renderSidebar();
    if (ui.view === 'dashboard') renderDashboard();
    if (ui.view === 'contacts') renderContacts();
    if (ui.view === 'pipeline') renderPipeline();
    if (ui.view === 'reports') renderReports();
    if (ui.view === 'settings') renderSettings();
  }

  /* ---------- Contacts ---------- */
  function openContactModal(existing = null) {
    const c = existing || { name: '', company: '', email: '', phone: '', status: 'Lead', owner: TEAM[0], source: 'Website' };
    openModal({
      title: existing ? 'Edit contact' : 'New contact',
      submitLabel: existing ? 'Save changes' : 'Add contact',
      body: [
        field('Full name', input('name', c.name, 'required placeholder="e.g. Carla Mansour"'), { full: true }),
        field('Company', input('company', c.company, 'placeholder="Company name"')),
        field('Email', input('email', c.email, 'type="email" placeholder="name@company.com"')),
        field('Phone', input('phone', c.phone, 'type="tel" placeholder="+961 …"')),
        field('Status', select('status', CONTACT_STATUSES, c.status)),
        field('Owner', select('owner', TEAM, c.owner)),
        field('Lead source', select('source', SOURCES, c.source), { full: true }),
      ].join(''),
      onSubmit: (v) => {
        const name = v.name.trim();
        if (!name) return 'Please enter the contact’s name.';
        const email = v.email.trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That email address doesn’t look right.';
        const fields = {
          name, company: v.company.trim(), email, phone: v.phone.trim(),
          status: v.status, owner: v.owner, source: v.source,
        };
        store.update((s) => {
          if (existing) Object.assign(s.contacts.find((x) => x.id === existing.id), fields);
          else s.contacts.push({ id: uid(), ...fields, createdAt: today() });
        });
        toast(existing ? 'Contact updated' : 'Contact added');
        render();
      },
    });
  }

  function openContactDetail(id) {
    const paint = (body) => {
      const c = contactById(id);
      if (!c) return;
      const deals = db().deals.filter((d) => d.contactId === id);
      const notes = db().activities.filter((a) => a.contactId === id).sort((a, b) => b.at.localeCompare(a.at));
      body.innerHTML = `
        <div class="full contact-hero">
          ${avatar(c.name, 'lg')}
          <div><h3>${esc(c.name)}</h3><div class="muted">${esc(c.company)}</div></div>
          <div class="spacer"></div>
          ${statusBadge(c.status)}
        </div>
        <dl class="detail-grid full">
          <div><dt>Email</dt><dd>${esc(c.email || '—')}</dd></div>
          <div><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd></div>
          <div><dt>Owner</dt><dd>${esc(c.owner)}</dd></div>
          <div><dt>Source</dt><dd>${esc(c.source)}</dd></div>
        </dl>
        <div class="modal-section-title">Deals (${deals.length})</div>
        <div class="full stack">
          ${deals.map((d) => `
            <div class="mini-row">
              <div><strong>${esc(d.title)}</strong><small>${esc(stageOf(d.stage).label)}</small></div>
              <span class="count-cell">${money(d.value)}</span>
            </div>`).join('') || '<p>No deals yet.</p>'}
        </div>
        <div class="modal-section-title">Add a note</div>
        <div class="full note-box">
          <textarea class="input" id="note-text" rows="2" placeholder="Call summary, next step, anything the team should know…"></textarea>
          <div class="row" style="justify-content: flex-end;">
            <button type="button" class="btn sm primary" data-note-add>Add note</button>
          </div>
        </div>
        <div class="modal-section-title">Notes & activity</div>
        <ul class="feed full">${notes.map(feedItem).join('') || '<li class="muted">No notes yet.</li>'}</ul>`;
    };

    openModal({
      title: 'Contact',
      size: 'lg',
      submitLabel: 'Done',
      body: '',
      onMount: ({ body }) => {
        paint(body);
        body.addEventListener('click', (e) => {
          if (!e.target.closest('[data-note-add]')) return;
          const c = contactById(id);
          const text = body.querySelector('#note-text').value.trim();
          if (!text) { toast('Write a note first.', 'warning'); return; }
          store.update((s) => s.activities.push({ id: uid(), type: 'note', text, owner: c.owner, at: nowISO(), contactId: id }));
          toast('Note added');
          paint(body);
        });
      },
      onSubmit: () => render(),
      onDismiss: () => render(),
    });
  }

  async function deleteContact(id) {
    const c = contactById(id);
    if (!c) return;
    const ok = await confirmDialog({
      title: 'Delete contact?',
      message: `${c.name} will be removed. Their deals stay in the pipeline, unlinked from this contact.`,
      confirmLabel: 'Delete contact',
    });
    if (!ok) return;
    store.update((s) => {
      s.contacts = s.contacts.filter((x) => x.id !== id);
      s.deals.forEach((d) => { if (d.contactId === id) d.contactId = ''; });
      s.activities = s.activities.filter((a) => a.contactId !== id);
    });
    toast('Contact deleted');
    render();
  }

  /* ---------- Deals ---------- */
  function openDealModal(existing = null) {
    const d = existing || { title: '', contactId: '', value: '', stage: 'new', owner: TEAM[0], expectedClose: addDays(today(), 30) };
    const contactOptions = [['', 'No contact yet'], ...db().contacts
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => [c.id, `${c.name} · ${c.company}`])];

    openModal({
      title: existing ? 'Edit deal' : 'New deal',
      submitLabel: existing ? 'Save changes' : 'Create deal',
      footerLeft: existing ? '<button type="button" class="btn danger" data-extra="delete-deal">Delete deal</button>' : '',
      body: [
        field('Deal title', input('title', d.title, 'required placeholder="e.g. Website redesign"'), { full: true }),
        field('Contact', select('contactId', contactOptions, d.contactId || ''), { full: true }),
        field('Deal value ($)', input('value', d.value, 'type="number" min="0" step="10" required placeholder="0"')),
        field('Stage', select('stage', STAGES.map((s) => [s.id, s.label]), d.stage)),
        field('Owner', select('owner', TEAM, d.owner)),
        field('Expected close', input('expectedClose', d.expectedClose, 'type="date"')),
      ].join(''),
      onMount: ({ form, close }) => {
        const del = form.querySelector('[data-extra="delete-deal"]');
        if (del) del.addEventListener('click', () => { close(); deleteDeal(existing.id); });
      },
      onSubmit: (v) => {
        const title = v.title.trim();
        if (!title) return 'Give the deal a title.';
        const value = Number(v.value);
        if (v.value === '' || !Number.isFinite(value) || value < 0) return 'Enter a deal value of 0 or more.';
        const fields = {
          title,
          value,
          contactId: v.contactId,
          stage: v.stage,
          owner: v.owner,
          expectedClose: v.expectedClose || addDays(today(), 30),
        };
        store.update((s) => {
          if (existing) {
            const deal = s.deals.find((x) => x.id === existing.id);
            const stageChanged = deal.stage !== fields.stage;
            Object.assign(deal, fields);
            if (stageChanged) {
              if (isClosed(fields.stage)) deal.closedAt = today();
              else delete deal.closedAt;
              s.activities.push({
                id: uid(), type: 'stage', owner: fields.owner, at: nowISO(), dealId: deal.id,
                text: `${title} moved to ${stageOf(fields.stage).label}`,
              });
            }
          } else {
            const deal = { id: uid(), ...fields, createdAt: today() };
            if (isClosed(fields.stage)) deal.closedAt = today();
            s.deals.push(deal);
            s.activities.push({ id: uid(), type: 'created', text: `New deal: ${title}`, owner: fields.owner, at: nowISO(), dealId: deal.id });
          }
        });
        toast(existing ? 'Deal updated' : 'Deal created');
        render();
      },
    });
  }

  async function deleteDeal(id) {
    const deal = db().deals.find((x) => x.id === id);
    if (!deal) return;
    const ok = await confirmDialog({
      title: 'Delete deal?',
      message: `“${deal.title}” and its activity history will be removed.`,
      confirmLabel: 'Delete deal',
    });
    if (!ok) return;
    store.update((s) => {
      s.deals = s.deals.filter((x) => x.id !== id);
      s.activities = s.activities.filter((a) => a.dealId !== id);
    });
    toast('Deal deleted');
    render();
  }

  function moveDeal(id, stage) {
    const deal = db().deals.find((x) => x.id === id);
    if (!deal || deal.stage === stage) return;
    const from = stageOf(deal.stage).label;
    const to = stageOf(stage).label;
    const owner = deal.owner;
    const title = deal.title;
    store.update((s) => {
      const d = s.deals.find((x) => x.id === id);
      d.stage = stage;
      if (isClosed(stage)) d.closedAt = today();
      else delete d.closedAt;
      s.activities.push({ id: uid(), type: 'stage', text: `${title}: ${from} → ${to}`, owner, at: nowISO(), dealId: id });
    });
    toast(`Moved to ${to}`);
    render();
  }

  /* ---------- Exports & reset ---------- */
  function exportContacts() {
    downloadFile('pulse-contacts.csv', toCSV(db().contacts, [
      { key: 'name', label: 'Name' },
      { key: 'company', label: 'Company' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'owner', label: 'Owner' },
      { key: 'source', label: 'Source' },
      { key: 'createdAt', label: 'Created' },
    ]));
    toast('Contacts exported');
  }

  function exportDeals() {
    downloadFile('pulse-deals.csv', toCSV(db().deals, [
      { key: 'title', label: 'Deal' },
      { label: 'Contact', value: (r) => (contactById(r.contactId) || {}).name || '' },
      { label: 'Company', value: (r) => companyOf(r) },
      { key: 'value', label: 'Value' },
      { label: 'Stage', value: (r) => stageOf(r.stage).label },
      { label: 'Probability', value: (r) => `${stageOf(r.stage).prob}%` },
      { key: 'owner', label: 'Owner' },
      { key: 'expectedClose', label: 'Expected close' },
      { key: 'closedAt', label: 'Closed' },
    ]));
    toast('Deals exported');
  }

  async function resetDemo() {
    const ok = await confirmDialog({
      title: 'Restore demo data?',
      message: 'This replaces all contacts, deals and activity with the sample workspace.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    store.reset();
    toast('Demo data restored');
    render();
  }

  /* ---------- Events ---------- */
  function handleAction(action, id) {
    switch (action) {
      case 'new-contact': return openContactModal();
      case 'edit-contact': return openContactModal(contactById(id));
      case 'open-contact': return openContactDetail(id);
      case 'delete-contact': return deleteContact(id);
      case 'new-deal': return openDealModal();
      case 'edit-deal': return openDealModal(db().deals.find((d) => d.id === id));
      case 'export-contacts': return exportContacts();
      case 'export-deals': return exportDeals();
      case 'goto-pipeline': location.hash = 'pipeline'; return;
      case 'reset-demo': return resetDemo();
      default: return undefined;
    }
  }

  document.addEventListener('click', (e) => {
    const segment = e.target.closest('#contact-status [data-status]');
    if (segment) {
      ui.contactStatus = segment.dataset.status;
      $$('#contact-status button').forEach((b) => b.classList.toggle('on', b === segment));
      renderContacts();
      return;
    }
    const action = e.target.closest('[data-action]');
    if (action) {
      handleAction(action.dataset.action, action.dataset.id);
      return;
    }
    const card = e.target.closest('.deal-card');
    if (card) openDealModal(db().deals.find((d) => d.id === card.dataset.deal));
  });

  const board = $('#board');
  let dragging = null;
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.deal-card');
    if (!card) return;
    dragging = card.dataset.deal;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragging);
    card.classList.add('dragging');
  });
  board.addEventListener('dragend', (e) => {
    const card = e.target.closest('.deal-card');
    if (card) card.classList.remove('dragging');
    $$('.column.drop-over').forEach((c) => c.classList.remove('drop-over'));
    dragging = null;
  });
  board.addEventListener('dragover', (e) => {
    const column = e.target.closest('.column');
    if (!column || !dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    column.classList.add('drop-over');
  });
  board.addEventListener('dragleave', (e) => {
    const column = e.target.closest('.column');
    if (column && !column.contains(e.relatedTarget)) column.classList.remove('drop-over');
  });
  board.addEventListener('drop', (e) => {
    const column = e.target.closest('.column');
    if (!column) return;
    e.preventDefault();
    column.classList.remove('drop-over');
    const id = e.dataTransfer.getData('text/plain') || dragging;
    if (id) moveDeal(id, column.dataset.stage);
  });

  /* ---------- Boot ---------- */
  initTheme({ button: $('[data-theme-toggle]') });
  initShell();

  const owner = $('#contact-owner');
  owner.innerHTML = ['<option value="all">All owners</option>', ...TEAM.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`)].join('');
  owner.addEventListener('change', (e) => {
    ui.contactOwner = e.target.value;
    renderContacts();
  });

  const search = $('#global-search');
  search.addEventListener('input', (e) => {
    ui.query = e.target.value;
    if (ui.view === 'contacts' || ui.view === 'pipeline') render();
    else router.go('contacts');
  });

  const router = initRouter(['dashboard', 'contacts', 'pipeline', 'reports', 'settings'], (view) => {
    ui.view = view;
    render();
  });
});
