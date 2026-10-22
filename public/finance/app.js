/* Ledgerly: personal finance dashboard.
   Transactions, accounts and budgets live in localStorage. The advisor answers quick questions on-device;
   open-ended questions use Claude only when the user adds their own API key in Settings. */
window.Store.ready.then(function () {
  'use strict';

  const U = window.UI;
  const {
    $, $$, esc, icon, money, num, pct, compact, badge, sum, uid, today, addMonths,
    fmtDate, monthKey, monthLabel, lastMonths, toCSV, downloadFile, emptyState, field, input, select,
    textarea, toast, confirmDialog, openModal, barChart, donut, sparkline, initTheme, initShell, initRouter, createStore,
  } = U;

  const KEY = 'ledgerly-v1';
  const AI_KEY = 'ledgerly-ai';
  const INCOME_CATS = ['Salary', 'Freelance', 'Investments', 'Other income'];
  const EXPENSE_CATS = ['Housing', 'Groceries', 'Utilities', 'Transport', 'Dining', 'Shopping', 'Health', 'Entertainment', 'Subscriptions', 'Education'];
  const ACCOUNT_TYPES = ['Checking', 'Savings', 'Cash', 'Credit card', 'Investment'];
  const LIQUID = ['Checking', 'Savings', 'Cash'];
  const FIXED_CATS = ['Housing', 'Utilities', 'Education'];
  const ACCOUNT_COLOR = { Checking: '#6d28d9', Savings: '#059669', Cash: '#d97706', 'Credit card': '#e11d48', Investment: '#0891b2' };
  const ACCOUNT_ICON = { Checking: 'wallet', Savings: 'shield', Cash: 'dollar', 'Credit card': 'tag', Investment: 'trend' };
  const PALETTE = ['#6d28d9', '#8b5cf6', '#a78bfa', '#c4b5fd', '#f59e0b', '#10b981', '#0891b2', '#94a3b8'];
  const PERIOD_LABEL = { 1: 'Last 30 days', 3: 'Last 3 months', 6: 'Last 6 months', 12: 'Last 12 months', all: 'All time' };
  const QUICK = [
    { id: 'trends', label: 'Analyze spending trends', icon: 'trend' },
    { id: 'runway', label: 'Calculate runway', icon: 'clock' },
    { id: 'savings', label: 'Get cost-saving suggestions', icon: 'percent' },
    { id: 'report', label: 'Generate financial report', icon: 'file' },
  ];
  const pad2 = (n) => String(n).padStart(2, '0');

  /* ---------- Seed data ---------- */
  function seed() {
    const t = today();
    let r = 42;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const between = (a, b) => a + rnd() * (b - a);

    const accounts = [
      { id: 'a1', name: 'Main checking', type: 'Checking', opening: 3200 },
      { id: 'a2', name: 'Emergency savings', type: 'Savings', opening: 9000 },
      { id: 'a3', name: 'Cash wallet', type: 'Cash', opening: 300 },
      { id: 'a4', name: 'Visa Platinum', type: 'Credit card', opening: -850 },
    ];

    const transactions = [];
    const add = (monthsAgo, day, description, category, amount, accountId) => {
      const date = `${monthKey(addMonths(t, -monthsAgo))}-${pad2(day)}`;
      if (date > t) return;
      transactions.push({
        id: uid(),
        date,
        description,
        category,
        type: INCOME_CATS.includes(category) ? 'income' : 'expense',
        amount: Math.round(amount * 100) / 100,
        accountId,
        status: 'completed',
      });
    };

    for (let m = 5; m >= 0; m--) {
      add(m, 1, 'Monthly salary · Northwind Traders', 'Salary', 4200, 'a1');
      if (m % 2 === 1) add(m, 15, 'Freelance design project', 'Freelance', between(650, 1150), 'a1');
      if (m === 2 || m === 4) add(m, 20, 'Dividend payout', 'Investments', between(40, 90), 'a2');
      if (m === 3) add(m, 22, 'Birthday gift', 'Other income', 150, 'a3');
      add(m, 2, 'Apartment rent', 'Housing', 1150, 'a1');
      add(m, 9, 'Electricity & water', 'Utilities', between(85, 130), 'a1');
      add(m, 11, 'Mobile & internet bundle', 'Utilities', 58, 'a4');
      add(m, 5, 'Streaming bundle', 'Subscriptions', 15.99, 'a4');
      add(m, 6, 'Cloud storage', 'Subscriptions', 9.99, 'a4');
      add(m, 7, 'Gym membership', 'Health', 45, 'a1');
      [4, 12, 19, 26].forEach((day, k) => add(m, day, 'Supermarket', 'Groceries', between(55, 140), k % 2 ? 'a4' : 'a1'));
      [8, 21].forEach((day) => add(m, day, pick(['Fuel', 'Ride-hailing', 'Parking']), 'Transport', between(25, 85), pick(['a1', 'a4', 'a3'])));
      [10, 17, 24].forEach((day) => add(m, day, pick(['Restaurant dinner', 'Coffee & lunch', 'Takeaway']), 'Dining', between(14, 70), pick(['a3', 'a4'])));
      if (m % 2 === 0) add(m, 14, 'Online order · clothing', 'Shopping', between(60, 210), 'a4');
      add(m, 18, pick(['Cinema tickets', 'Concert', 'Board game café']), 'Entertainment', between(25, 75), 'a4');
      if (m === 3) add(m, 12, 'Online course · data analysis', 'Education', 180, 'a4');
    }

    const latestExpense = transactions.filter((x) => x.type === 'expense').sort((a, b) => a.date.localeCompare(b.date)).pop();
    if (latestExpense) latestExpense.status = 'pending';

    const budgets = { Housing: 1200, Groceries: 480, Utilities: 220, Transport: 180, Dining: 180, Shopping: 200, Health: 60, Entertainment: 120, Subscriptions: 45, Education: 200 };
    return { accounts, transactions, budgets };
  }

  /* ---------- State ---------- */
  const store = createStore(KEY, seed);
  const db = () => store.get();
  const ui = { view: 'dashboard', period: '6', txType: 'all', txAccount: 'all', query: '' };
  let ai = loadAI();

  function loadAI() {
    try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch (_) { return {}; }
  }
  function saveAI(cfg) {
    try { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); } catch (_) { toast('Could not save settings in this browser.', 'error'); }
  }

  const accountById = (id) => db().accounts.find((a) => a.id === id);
  const accountBalance = (a) => a.opening + sum(db().transactions
    .filter((t) => t.accountId === a.id && t.status === 'completed')
    .map((t) => (t.type === 'income' ? t.amount : -t.amount)));
  const periodStart = () => (ui.period === 'all' ? '0000-00-00' : addMonths(today(), -Number(ui.period)));
  const inPeriod = () => db().transactions.filter((t) => t.date >= periodStart());
  const isExpense = (t) => t.type === 'expense';
  const isIncome = (t) => t.type === 'income';
  const spentIn = (month, category) => sum(db().transactions
    .filter((t) => isExpense(t) && monthKey(t.date) === month && (!category || t.category === category))
    .map((t) => t.amount));

  function totals(list) {
    const income = sum(list.filter(isIncome).map((t) => t.amount));
    const expense = sum(list.filter(isExpense).map((t) => t.amount));
    return { income, expense, net: income - expense, count: list.length, pending: list.filter((t) => t.status === 'pending').length };
  }

  function categoryTotals(list) {
    const map = new Map();
    list.forEach((t) => map.set(t.category, (map.get(t.category) || 0) + t.amount));
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }

  function monthlyFlow(count) {
    const keys = lastMonths(count);
    const list = db().transactions;
    return {
      labels: keys.map(monthLabel),
      income: keys.map((k) => sum(list.filter((t) => isIncome(t) && monthKey(t.date) === k).map((t) => t.amount))),
      expense: keys.map((k) => sum(list.filter((t) => isExpense(t) && monthKey(t.date) === k).map((t) => t.amount))),
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

  const amountCell = (t) => `<span class="amount ${t.type}">${t.type === 'income' ? '+' : '−'}${money(t.amount, '$', 2)}</span>`;
  const statusBadge = (t) => (t.status === 'pending' ? badge('Pending', 'warning') : badge('Completed', 'success'));

  function txTable(rows, compact = false) {
    return `
      <table class="table">
        <thead>
          <tr>
            <th>Date</th><th>Description</th>
            ${compact ? '' : '<th class="hide-md">Account</th>'}
            <th class="num">Amount</th><th>Status</th>
            ${compact ? '' : '<th class="actions"></th>'}
          </tr>
        </thead>
        <tbody>
          ${rows.map((t) => `
            <tr>
              <td class="muted">${esc(fmtDate(t.date, true))}</td>
              <td>
                <strong>${esc(t.description)}</strong>
                <div style="margin-top: 4px;"><span class="chip">${esc(t.category)}</span></div>
              </td>
              ${compact ? '' : `<td class="hide-md">${esc((accountById(t.accountId) || {}).name || '—')}</td>`}
              <td class="num">${amountCell(t)}</td>
              <td>${statusBadge(t)}</td>
              ${compact ? '' : `
                <td class="actions">
                  <button type="button" class="icon-btn sm" data-action="edit-tx" data-id="${esc(t.id)}" aria-label="Edit transaction">${icon('edit')}</button>
                  <button type="button" class="icon-btn sm danger" data-action="delete-tx" data-id="${esc(t.id)}" aria-label="Delete transaction">${icon('trash')}</button>
                </td>`}
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  const periodLabel = () => PERIOD_LABEL[ui.period] || PERIOD_LABEL[6];

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const list = inPeriod();
    const t = totals(list);
    const months = ui.period === 'all' ? 12 : Math.max(3, Number(ui.period));
    const flow = monthlyFlow(months);
    const rate = t.income ? (t.net / t.income) * 100 : 0;

    $('#dash-sub').textContent = `${periodLabel()} · ${pct(rate)} savings rate`;

    $('#dash-stats').innerHTML = [
      statCard('Total income', money(t.income), 'Salary, freelance and other income', 'trend', sparkline(flow.income)),
      statCard('Total expenses', money(t.expense), `${pct(t.income ? (t.expense / t.income) * 100 : 0, 0)} of income spent`, 'wallet', sparkline(flow.expense)),
      statCard('Net balance', money(t.net), `${pct(rate)} of income saved`, 'layers', sparkline(flow.income.map((v, i) => v - flow.expense[i]))),
      statCard('Total transactions', num(t.count), `${t.pending} pending`, 'list'),
    ].join('');

    $('#dash-flow').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Cash flow</h3>
          <div class="card-sub">Income against expenses per month</div>
        </div>
        <div class="legend">
          <span><i style="background:#a78bfa"></i>Income</span>
          <span><i style="background:var(--accent)"></i>Expenses</span>
        </div>
      </div>
      ${barChart(flow.labels, [
        { name: 'Income', color: '#a78bfa', values: flow.income },
        { name: 'Expenses', color: 'var(--accent)', values: flow.expense },
      ], { prefix: '$', format: (v) => money(v), label: 'Cash flow by month', height: 250 })}`;

    const cats = categoryTotals(list.filter(isExpense));
    const top = cats.slice(0, 6);
    const other = sum(cats.slice(6).map((c) => c.value));
    const segments = [...top, ...(other ? [{ name: 'Other', value: other }] : [])]
      .map((c, i) => ({ label: c.name, value: c.value, color: PALETTE[i % PALETTE.length], display: money(c.value) }));
    $('#dash-spend').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Where the money goes</h3>
          <div class="card-sub">Expense categories for the selected period</div>
        </div>
      </div>
      <div class="spend-wrap">
        ${donut(segments, { center: compact(t.expense, '$'), sub: 'spent' })}
        <ul class="legend-list">
          ${segments.map((s) => `
            <li>
              <i style="background:${s.color}"></i>
              <span>${esc(s.label)}</span>
              <strong>${pct(t.expense ? (s.value / t.expense) * 100 : 0, 0)}</strong>
            </li>`).join('') || '<li class="muted">No expenses in this period.</li>'}
        </ul>
      </div>`;

    const recent = list.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    $('#dash-tx').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Recent transactions</h3>
          <div class="card-sub">Latest activity in this period</div>
        </div>
        <button type="button" class="btn sm" data-action="goto-tx">View all</button>
      </div>
      <div class="table-wrap">${recent.length ? txTable(recent, true) : emptyState('list', 'No transactions in this period')}</div>`;
  }

  /* ---------- Advisor ---------- */
  function localAnswer(kind) {
    const now = today();
    const thisM = monthKey(now);
    const prevM = monthKey(addMonths(now, -1));
    const incomeIn = (m) => sum(db().transactions.filter((t) => isIncome(t) && monthKey(t.date) === m).map((t) => t.amount));
    const avgSpend = (cat) => sum([0, 1, 2].map((i) => spentIn(monthKey(addMonths(now, -i)), cat))) / 3;

    if (kind === 'trends') {
      const nowSpend = spentIn(thisM);
      const prevSpend = spentIn(prevM);
      const change = prevSpend ? ((nowSpend - prevSpend) / prevSpend) * 100 : 0;
      const deltas = EXPENSE_CATS
        .map((c) => ({ c, d: spentIn(thisM, c) - spentIn(prevM, c) }))
        .filter((x) => x.d !== 0)
        .sort((a, b) => b.d - a.d);
      const rising = deltas.filter((x) => x.d > 0).slice(0, 2);
      const falling = deltas.filter((x) => x.d < 0).slice(-1);
      return {
        title: 'Spending trends',
        lines: [
          `So far this month you have spent ${money(nowSpend)}, against ${money(prevSpend)} for all of last month (${change >= 0 ? '+' : ''}${pct(change, 0)}).`,
          `Income so far this month is ${money(incomeIn(thisM))}; last month it was ${money(incomeIn(prevM))}.`,
          ...rising.map((x) => `Higher in ${x.c}: +${money(x.d)}.`),
          ...falling.map((x) => `Lower in ${x.c}: ${money(x.d)}.`),
        ],
      };
    }

    if (kind === 'runway') {
      const liquid = sum(db().accounts.filter((a) => LIQUID.includes(a.type)).map(accountBalance));
      const avg = sum([0, 1, 2].map((i) => spentIn(monthKey(addMonths(now, -i))))) / 3;
      if (!avg) return { title: 'Runway', lines: ['There is not enough spending history yet to estimate runway.'] };
      const months = liquid / avg;
      return {
        title: 'Runway',
        lines: [
          `Liquid balances (checking, savings and cash): ${money(liquid)}.`,
          `Average spending over the last three months: ${money(avg)} a month.`,
          months > 0
            ? `At this pace, your cash covers about ${months.toFixed(1)} months of expenses.`
            : 'Liquid balances are not positive yet, so building a cash buffer comes first.',
          `A six-month cushion at this spending level would be ${money(avg * 6)}.`,
        ],
      };
    }

    if (kind === 'savings') {
      // Fixed costs (rent, bills, tuition) are left out: they are not realistic places to cut.
      const ranked = EXPENSE_CATS
        .filter((c) => !FIXED_CATS.includes(c))
        .map((c) => ({ c, avg: avgSpend(c) }))
        .filter((x) => x.avg > 0)
        .sort((a, b) => b.avg - a.avg);
      const top = ranked.slice(0, 3);
      const lines = top.map((x) => `${x.c}: about ${money(x.avg)} a month. Trimming 15% saves ${money(x.avg * 0.15)}.`);
      const potential = sum(top.map((x) => x.avg * 0.15));
      if (top.length) lines.push(`Together that is about ${money(potential)} a month, or ${money(potential * 12)} a year.`);
      const subs = ranked.find((x) => x.c === 'Subscriptions');
      if (subs) lines.push(`Subscriptions cost about ${money(subs.avg * 12)} a year. Cancel anything you no longer use.`);
      Object.keys(db().budgets).forEach((c) => {
        const spent = spentIn(thisM, c);
        if (spent > db().budgets[c]) lines.push(`${c} is over budget this month: ${money(spent)} of ${money(db().budgets[c])}.`);
      });
      return { title: 'Cost-saving suggestions', lines: lines.length ? lines : ['No spending pattern stands out yet.'] };
    }

    const list = inPeriod();
    const t = totals(list);
    const top = categoryTotals(list.filter(isExpense))[0];
    const netWorth = sum(db().accounts.map(accountBalance));
    return {
      title: `Financial report · ${periodLabel()}`,
      lines: [
        `Income ${money(t.income)} · Expenses ${money(t.expense)} · Net ${money(t.net)}.`,
        `Savings rate: ${pct(t.income ? (t.net / t.income) * 100 : 0)}.`,
        top ? `Largest expense category: ${top.name} (${money(top.value)}).` : 'No expenses recorded in this period.',
        `${num(t.count)} transactions, ${t.pending} pending.`,
        `Net worth across all accounts: ${money(netWorth)}.`,
      ],
    };
  }

  function snapshotForAI() {
    const list = inPeriod();
    const now = today();
    return JSON.stringify({
      period: periodLabel(),
      currency: 'USD',
      totals: totals(list),
      topExpenseCategories: categoryTotals(list.filter(isExpense)).slice(0, 6),
      thisMonthSpending: spentIn(monthKey(now)),
      lastMonthSpending: spentIn(monthKey(addMonths(now, -1))),
      accounts: db().accounts.map((a) => ({ name: a.name, type: a.type, balance: accountBalance(a) })),
      budgets: EXPENSE_CATS.filter((c) => db().budgets[c]).map((c) => ({
        category: c, monthlyLimit: db().budgets[c], spentThisMonth: spentIn(monthKey(now), c),
      })),
    }, null, 2);
  }

  const ADVISOR_SYSTEM = 'You are Ledgerly, a personal finance assistant inside a budgeting app. '
    + 'Answer using only the figures provided, keep it short and practical, and say when data is missing. '
    + 'You are not a licensed financial, tax or investment advisor: give general considerations only and suggest a qualified professional for personal decisions.';

  function renderAdvisorMode() {
    $('#advisor-mode').textContent = ai.apiKey
      ? `Connected to Claude (${ai.model === 'claude-haiku-5-5' ? 'Haiku 5.5' : 'Sonnet 5.5'}). Ask anything.`
      : 'Quick insights run on your device. Add a Claude API key in Settings for open questions.';
  }

  async function runAdvisor(kind, question = '') {
    const out = $('#advisor-output');
    const quick = QUICK.find((q) => q.id === kind);
    const label = question || (quick ? quick.label : '');

    if (ai.apiKey && label) {
      out.innerHTML = `<p class="muted">Thinking…</p>`;
      try {
        const text = await window.AI.ask({
          apiKey: ai.apiKey,
          model: ai.model || window.AI.DEFAULT_MODEL,
          system: ADVISOR_SYSTEM,
          prompt: `Financial snapshot (JSON):\n${snapshotForAI()}\n\nQuestion: ${label}`,
          maxTokens: 700,
        });
        out.innerHTML = `<h4>${esc(label)}</h4><p class="answer-text">${esc(text)}</p>`;
      } catch (err) {
        out.innerHTML = `<p class="muted">Could not get an answer: ${esc(err.message)}</p>`;
      }
      return;
    }

    if (quick) {
      const answer = localAnswer(kind);
      out.innerHTML = `<h4>${esc(answer.title)}</h4><ul>${answer.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
      return;
    }
    out.innerHTML = '<p class="muted">Open-ended questions need a Claude API key. Add one in Settings, or try a quick action above.</p>';
  }

  /* ---------- Transactions ---------- */
  function renderTransactions() {
    $$('#tx-type [data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === ui.txType));

    const accountSelect = $('#tx-account');
    accountSelect.innerHTML = ['<option value="all">All accounts</option>', ...db().accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)].join('');
    if (!accountById(ui.txAccount)) ui.txAccount = 'all';
    accountSelect.value = ui.txAccount;

    const q = ui.query.trim().toLowerCase();
    const rows = db().transactions
      .filter((t) => ui.txType === 'all' || t.type === ui.txType)
      .filter((t) => ui.txAccount === 'all' || t.accountId === ui.txAccount)
      .filter((t) => !q || `${t.description} ${t.category} ${(accountById(t.accountId) || {}).name || ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));

    const t = totals(rows);
    $('#tx-sub').textContent = `${num(rows.length)} shown · ${money(t.income)} in, ${money(t.expense)} out, net ${money(t.net)}`;
    $('#tx-table').innerHTML = rows.length
      ? `<div class="table-wrap">${txTable(rows)}</div>`
      : emptyState('list', 'No transactions match', 'Change the filters or add a transaction.',
        '<button type="button" class="btn primary" data-action="new-tx"><span data-icon="plus"></span>Add transaction</button>');
  }

  function openTxModal(existing = null) {
    const t = existing || { date: today(), description: '', type: 'expense', category: 'Groceries', amount: '', accountId: (db().accounts[0] || {}).id || '', status: 'completed' };
    const categoriesFor = (type) => (type === 'income' ? INCOME_CATS : EXPENSE_CATS);
    const startCats = categoriesFor(t.type);
    const fld = (form, name) => form.querySelector(`[name="${name}"]`);

    openModal({
      title: existing ? 'Edit transaction' : 'Add transaction',
      submitLabel: existing ? 'Save changes' : 'Add transaction',
      footerLeft: existing ? '<button type="button" class="btn danger" data-extra="delete">Delete</button>' : '',
      body: [
        field('Description', input('description', t.description, 'required placeholder="e.g. Supermarket"'), { full: true }),
        field('Type', select('type', [['expense', 'Expense'], ['income', 'Income']], t.type)),
        field('Category', select('category', startCats, startCats.includes(t.category) ? t.category : startCats[0])),
        field('Amount ($)', input('amount', t.amount, 'type="number" min="0.01" step="0.01" required placeholder="0.00"')),
        field('Date', input('date', t.date, 'type="date" required')),
        field('Account', select('accountId', db().accounts.map((a) => [a.id, a.name]), t.accountId)),
        field('Status', select('status', [['completed', 'Completed'], ['pending', 'Pending']], t.status)),
      ].join(''),
      onMount: ({ form, close }) => {
        fld(form, 'type').addEventListener('change', (e) => {
          const options = categoriesFor(e.target.value);
          fld(form, 'category').innerHTML = options.map((c) => `<option>${esc(c)}</option>`).join('');
        });
        const del = form.querySelector('[data-extra="delete"]');
        if (del) del.addEventListener('click', () => { close(); deleteTx(existing.id); });
      },
      onSubmit: (v) => {
        const description = v.description.trim();
        if (!description) return 'Add a short description.';
        const amount = Number(v.amount);
        if (v.amount === '' || !(amount > 0)) return 'Enter an amount greater than zero.';
        if (!v.date) return 'Pick a date.';
        const fields = {
          description,
          type: v.type,
          category: v.category,
          amount: Math.round(amount * 100) / 100,
          date: v.date,
          accountId: v.accountId,
          status: v.status,
        };
        store.update((s) => {
          if (existing) Object.assign(s.transactions.find((x) => x.id === existing.id), fields);
          else s.transactions.push({ id: uid(), ...fields });
        });
        toast(existing ? 'Transaction updated' : 'Transaction added');
        render();
      },
    });
  }

  async function deleteTx(id) {
    const t = db().transactions.find((x) => x.id === id);
    if (!t) return;
    const ok = await confirmDialog({
      title: 'Delete transaction?',
      message: `“${t.description}” for ${money(t.amount, '$', 2)} will be removed. Account balances update automatically.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    store.update((s) => { s.transactions = s.transactions.filter((x) => x.id !== id); });
    toast('Transaction deleted');
    render();
  }

  /* ---------- Accounts ---------- */
  function renderAccounts() {
    const rows = db().accounts.map((a) => ({ a, bal: accountBalance(a), count: db().transactions.filter((t) => t.accountId === a.id).length }));
    const netWorth = sum(rows.map((x) => x.bal));
    const liquid = sum(rows.filter((x) => LIQUID.includes(x.a.type)).map((x) => x.bal));
    const owed = -sum(rows.filter((x) => x.bal < 0).map((x) => x.bal));

    $('#accounts-sub').textContent = `${rows.length} accounts · balances include completed transactions`;
    $('#account-summary').innerHTML = [
      statCard('Net worth', money(netWorth), 'All accounts combined', 'layers'),
      statCard('Liquid cash', money(liquid), 'Checking, savings and cash', 'wallet'),
      statCard('Owed on credit', money(owed), 'Outstanding card balances', 'tag'),
    ].join('');

    $('#account-grid').innerHTML = rows.map(({ a, bal, count }) => `
      <article class="card account-card">
        <div class="account-top">
          <span class="account-icon" style="--c:${ACCOUNT_COLOR[a.type]}">${icon(ACCOUNT_ICON[a.type])}</span>
          <div><strong>${esc(a.name)}</strong><small>${esc(a.type)} · ${num(count)} transactions</small></div>
        </div>
        <div class="account-balance ${bal < 0 ? 'negative' : ''}">${money(bal, '$', 2)}</div>
        <div class="account-actions">
          <button type="button" class="btn sm" data-action="view-account-tx" data-id="${esc(a.id)}">${icon('list')}Transactions</button>
          <button type="button" class="btn sm" data-action="edit-account" data-id="${esc(a.id)}">${icon('edit')}Edit</button>
          <button type="button" class="icon-btn sm danger" data-action="delete-account" data-id="${esc(a.id)}" aria-label="Delete account">${icon('trash')}</button>
        </div>
      </article>`).join('') || emptyState('wallet', 'No accounts yet', 'Add a checking, savings or card account to track balances.');
  }

  function openAccountModal(existing = null) {
    const a = existing || { name: '', type: 'Checking', opening: 0 };
    openModal({
      title: existing ? 'Edit account' : 'Add account',
      submitLabel: existing ? 'Save changes' : 'Add account',
      size: 'sm',
      body: [
        field('Account name', input('name', a.name, 'required placeholder="e.g. Joint savings"')),
        field('Type', select('type', ACCOUNT_TYPES, a.type)),
        field('Opening balance ($)', input('opening', a.opening, 'type="number" step="0.01" required'), { hint: 'Use a negative number for money you owe' }),
      ].join(''),
      onSubmit: (v) => {
        const name = v.name.trim();
        if (!name) return 'Give the account a name.';
        const opening = Number(v.opening);
        if (v.opening === '' || !Number.isFinite(opening)) return 'Enter the opening balance.';
        const fields = { name, type: v.type, opening: Math.round(opening * 100) / 100 };
        store.update((s) => {
          if (existing) Object.assign(s.accounts.find((x) => x.id === existing.id), fields);
          else s.accounts.push({ id: uid(), ...fields });
        });
        toast(existing ? 'Account updated' : 'Account added');
        render();
      },
    });
  }

  async function deleteAccount(id) {
    const a = accountById(id);
    if (!a) return;
    const used = db().transactions.filter((t) => t.accountId === id).length;
    if (used) {
      toast(`${a.name} has ${used} transaction${used === 1 ? '' : 's'}. Move or delete them first.`, 'error');
      return;
    }
    const ok = await confirmDialog({ title: 'Delete account?', message: `${a.name} will be removed.`, confirmLabel: 'Delete account' });
    if (!ok) return;
    store.update((s) => { s.accounts = s.accounts.filter((x) => x.id !== id); });
    toast('Account deleted');
    render();
  }

  /* ---------- Budgets ---------- */
  function renderBudgets() {
    const now = today();
    const thisM = monthKey(now);
    const rows = EXPENSE_CATS.map((cat) => {
      const limit = db().budgets[cat] || 0;
      const spent = spentIn(thisM, cat);
      return { cat, limit, spent, ratio: limit ? spent / limit : 0 };
    });
    const budgeted = rows.filter((r) => r.limit);
    const over = budgeted.filter((r) => r.ratio > 1).length;
    const limitTotal = sum(budgeted.map((r) => r.limit));
    const spentBudgeted = sum(budgeted.map((r) => r.spent));

    $('#budget-summary').innerHTML = [
      statCard('Monthly budget', money(limitTotal), `${budgeted.length} categories with a limit`, 'target'),
      statCard('Spent this month', money(spentBudgeted), `${pct(limitTotal ? (spentBudgeted / limitTotal) * 100 : 0, 0)} of budgets used`, 'wallet'),
      statCard('Left to spend', money(Math.max(0, limitTotal - spentBudgeted)), over ? `${over} categor${over === 1 ? 'y' : 'ies'} over budget` : 'Everything is on track', 'check'),
    ].join('');

    $('#budget-list').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Categories</h3>
          <div class="card-sub">This month. Amber means 80% used, red means over.</div>
        </div>
      </div>
      ${rows.map((r) => {
        const tone = r.ratio > 1 ? 'over' : r.ratio >= 0.8 ? 'near' : '';
        return `
          <div class="budget-row">
            <div class="budget-top">
              <div><strong>${esc(r.cat)}</strong><small>${r.limit ? `${pct(r.ratio * 100, 0)} used` : 'No limit set'}</small></div>
              <div class="budget-figures"><b>${money(r.spent)}</b>${r.limit ? ` of ${money(r.limit)}` : ''}</div>
            </div>
            ${r.limit ? `<div class="progress ${tone}"><span style="width:${Math.min(100, r.ratio * 100).toFixed(1)}%"></span></div>` : ''}
            <div class="row" style="justify-content: flex-end;">
              <button type="button" class="btn sm" data-action="edit-budget" data-cat="${esc(r.cat)}">${r.limit ? 'Edit limit' : 'Set limit'}</button>
            </div>
          </div>`;
      }).join('')}`;
  }

  function openBudgetModal(category) {
    const current = db().budgets[category] || '';
    openModal({
      title: `Monthly limit · ${category}`,
      size: 'sm',
      submitLabel: 'Save limit',
      body: [
        field('Monthly limit ($)', input('limit', current, 'type="number" min="0" step="10" placeholder="0 removes the limit"')),
        `<p class="full muted">Spent so far this month: ${money(spentIn(monthKey(today()), category), '$', 2)}</p>`,
      ].join(''),
      onSubmit: (v) => {
        const limit = Number(v.limit || 0);
        if (!Number.isFinite(limit) || limit < 0) return 'Enter zero or a positive amount.';
        store.update((s) => {
          if (limit > 0) s.budgets[category] = limit;
          else delete s.budgets[category];
        });
        toast(limit > 0 ? `${category} limit set` : `${category} limit removed`);
        render();
      },
    });
  }

  /* ---------- Settings & data ---------- */
  function renderSettings() {
    const key = $('#ai-key');
    key.placeholder = ai.apiKey ? 'A key is saved in this browser' : 'sk-ant-…';
    $('#ai-model').value = ai.model || window.AI.DEFAULT_MODEL;
  }

  function exportTransactions() {
    downloadFile('ledgerly-transactions.csv', toCSV(db().transactions, [
      { key: 'date', label: 'Date' },
      { key: 'description', label: 'Description' },
      { key: 'category', label: 'Category' },
      { key: 'type', label: 'Type' },
      { key: 'amount', label: 'Amount' },
      { label: 'Account', value: (t) => (accountById(t.accountId) || {}).name || '' },
      { key: 'status', label: 'Status' },
    ]));
    toast('Transactions exported');
  }

  async function resetDemo() {
    const ok = await confirmDialog({
      title: 'Restore demo data?',
      message: 'This replaces accounts, transactions and budgets with the sample finances. Your advisor key is kept.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    store.reset();
    toast('Demo data restored');
    render();
  }

  /* ---------- Rendering ---------- */
  function render() {
    if (ui.view === 'dashboard') renderDashboard();
    if (ui.view === 'transactions') renderTransactions();
    if (ui.view === 'accounts') renderAccounts();
    if (ui.view === 'budgets') renderBudgets();
    if (ui.view === 'settings') renderSettings();
    renderAdvisorMode();
  }

  /* ---------- Events ---------- */
  function handleAction(action, id, cat) {
    switch (action) {
      case 'new-tx': return openTxModal();
      case 'edit-tx': return openTxModal(db().transactions.find((t) => t.id === id));
      case 'delete-tx': return deleteTx(id);
      case 'goto-tx': location.hash = 'transactions'; return;
      case 'export-tx': return exportTransactions();
      case 'new-account': return openAccountModal();
      case 'edit-account': return openAccountModal(accountById(id));
      case 'delete-account': return deleteAccount(id);
      case 'view-account-tx': ui.txAccount = id; ui.txType = 'all'; location.hash = 'transactions'; return;
      case 'edit-budget': return openBudgetModal(cat);
      case 'reset-demo': return resetDemo();
      default: return undefined;
    }
  }

  document.addEventListener('click', (e) => {
    const quick = e.target.closest('[data-quick]');
    if (quick) { runAdvisor(quick.dataset.quick); return; }
    const type = e.target.closest('#tx-type [data-type]');
    if (type) {
      ui.txType = type.dataset.type;
      renderTransactions();
      return;
    }
    const action = e.target.closest('[data-action]');
    if (action) handleAction(action.dataset.action, action.dataset.id, action.dataset.cat);
  });

  $('#quick-actions').innerHTML = QUICK.map((q) => `<button type="button" data-quick="${q.id}">${esc(q.label)}${icon('arrow')}</button>`).join('');

  $('#advisor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const box = $('#advisor-input');
    const question = box.value.trim();
    if (!question) return;
    box.value = '';
    runAdvisor(null, question);
  });

  $('#period').addEventListener('change', (e) => {
    ui.period = e.target.value;
    renderDashboard();
  });
  $('#tx-account').addEventListener('change', (e) => {
    ui.txAccount = e.target.value;
    renderTransactions();
  });

  $('#ai-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('#ai-key').value.trim();
    if (key && !/^sk-/.test(key)) {
      toast('That does not look like a Claude API key.', 'error');
      return;
    }
    ai = { apiKey: key || ai.apiKey || '', model: $('#ai-model').value };
    saveAI(ai);
    $('#ai-key').value = '';
    renderSettings();
    renderAdvisorMode();
    toast('Advisor settings saved');
  });
  $('#ai-clear').addEventListener('click', () => {
    ai = { apiKey: '', model: ai.model || window.AI.DEFAULT_MODEL };
    saveAI(ai);
    renderSettings();
    renderAdvisorMode();
    toast('API key removed');
  });

  /* ---------- Boot ---------- */
  initTheme({ button: $('[data-theme-toggle]') });
  initShell();

  const search = $('#global-search');
  search.addEventListener('input', (e) => {
    ui.query = e.target.value;
    if (ui.view === 'transactions') render();
    else router.go('transactions');
  });

  const router = initRouter(['dashboard', 'transactions', 'accounts', 'budgets', 'settings'], (view) => {
    ui.view = view;
    render();
  });
});
