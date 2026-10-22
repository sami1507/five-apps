/* Inventix: products, warehouse zones and orders with automatic stock control.
   Stock moves with order status: active orders reserve stock, cancelled and returned orders release it. */
window.Store.ready.then(function () {
  'use strict';

  const U = window.UI;
  const {
    $, $$, esc, icon, money, num, pct, badge, hbar, progress, sum, uid,
    today, addDays, fmtDate, lastMonths, monthKey, monthLabel,
    toCSV, downloadFile, emptyState, field, input, select, toast, confirmDialog, openModal,
    barChart, sparkline, initTheme, initShell, initRouter, createStore,
  } = U;

  const KEY = 'inventix-v1';
  const CATEGORIES = [
    { name: 'Beverages', color: '#2563eb' },
    { name: 'Fruits', color: '#d97706' },
    { name: 'Vegetables', color: '#16a34a' },
    { name: 'Dairy', color: '#0891b2' },
    { name: 'Pantry', color: '#a16207' },
    { name: 'Health & Beauty', color: '#db2777' },
  ];
  const ACTIVE = ['pending', 'shipped', 'delivered'];
  const STATUS = {
    pending: { label: 'Pending', tone: 'warning' },
    shipped: { label: 'Shipped', tone: 'info' },
    delivered: { label: 'Delivered', tone: 'success' },
    returned: { label: 'Returned', tone: 'danger' },
    cancelled: { label: 'Cancelled', tone: '' },
  };
  const STOCK_TONE = { out: 'danger', low: 'warning', ok: 'success' };
  const STOCK_LABEL = { out: 'Out of stock', low: 'Low stock', ok: 'In stock' };

  const isActive = (status) => ACTIVE.includes(status);
  const catColor = (name) => (CATEGORIES.find((c) => c.name === name) || CATEGORIES[0]).color;
  const toNum = (value) => (value === '' || value == null ? NaN : Number(value));
  const initialsOf = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  /* ---------- Seed data ---------- */
  function seed() {
    const t = today();
    const zones = [
      { id: 'z1', name: 'Fruits', block: 'Block A', capacity: 1000 },
      { id: 'z2', name: 'Vegetables', block: 'Block B', capacity: 800 },
      { id: 'z3', name: 'Beverages', block: 'Block C', capacity: 1200 },
      { id: 'z4', name: 'Health & Beauty', block: 'Block D', capacity: 1000 },
      { id: 'z5', name: 'Dairy & Pantry', block: 'Block E', capacity: 900 },
    ];
    // [sku, name, category, price, cost, stock, reorder, zoneId]
    const products = [
      ['SKU-1001', 'Fanta Strawberry 1L', 'Beverages', 5, 3.2, 120, 150, 'z3'],
      ['SKU-1002', 'Red Chili 250g', 'Vegetables', 10, 6, 35, 40, 'z2'],
      ['SKU-1003', 'Lemon (per kg)', 'Fruits', 4, 2.1, 400, 120, 'z1'],
      ['SKU-1004', 'Malta Flower Shower Gel', 'Health & Beauty', 13, 8, 60, 50, 'z4'],
      ['SKU-1005', 'Rinse Rose Fresh Shampoo', 'Health & Beauty', 9, 5.5, 25, 30, 'z4'],
      ['SKU-1006', 'Lettuce Head', 'Vegetables', 3, 1.4, 18, 60, 'z2'],
      ['SKU-1007', 'Greek Yogurt 500g', 'Dairy', 6, 3.8, 210, 80, 'z5'],
      ['SKU-1008', 'Extra Virgin Olive Oil 1L', 'Pantry', 12, 8.5, 90, 40, 'z5'],
      ['SKU-1009', 'Orange Juice 1L', 'Beverages', 4.5, 2.7, 260, 100, 'z3'],
      ['SKU-1010', 'Cheddar Block 400g', 'Dairy', 7, 4.6, 48, 40, 'z5'],
      ['SKU-1011', 'Strawberries 500g', 'Fruits', 6, 3.5, 14, 45, 'z1'],
      ['SKU-1012', 'Basmati Rice 5kg', 'Pantry', 16, 11, 130, 50, 'z5'],
    ].map(([sku, name, category, price, cost, stock, reorder, zoneId], i) => ({
      id: `p${i + 1}`, sku, name, category, price, cost, stock, reorder, zoneId,
    }));

    // Deterministic pseudo-random so the demo looks the same on every reset.
    let rngState = 7;
    const rnd = () => (rngState = (rngState * 16807) % 2147483647) / 2147483647;
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

    const customers = ['Maya Haddad', 'Karim Saad', 'Tala Nassar', 'Joe Mansour', 'Rita Khalil', 'Samir Aoun', 'Nadine Fares', 'Walid Hamdan'];
    const orders = [];
    for (let i = 0; i < 26; i++) {
      const items = [];
      const count = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < count; k++) {
        const p = pick(products);
        if (items.some((x) => x.productId === p.id)) continue;
        items.push({ productId: p.id, name: p.name, qty: 3 + Math.floor(rnd() * 14), price: p.price });
      }
      const r = rnd();
      const status = r < 0.62 ? 'delivered' : r < 0.78 ? 'shipped' : r < 0.86 ? 'pending' : r < 0.94 ? 'returned' : 'cancelled';
      orders.push({
        id: uid(),
        number: `ORD-${1040 + i}`,
        customer: pick(customers),
        date: addDays(t, -Math.floor(rnd() * 170)),
        status,
        items,
      });
    }
    orders.sort((a, b) => a.date.localeCompare(b.date));
    orders.forEach((o, i) => { o.number = `ORD-${1041 + i}`; });

    const purchases = [];
    for (let m = 0; m < 6; m++) {
      for (let k = 0; k < 2; k++) {
        const p = products[(m * 2 + k) % products.length];
        purchases.push({
          id: uid(),
          date: addDays(t, -(m * 30) - 5 - k * 9),
          productId: p.id,
          qty: 30 + Math.floor(rnd() * 60),
          unitCost: p.cost,
        });
      }
    }

    return { company: 'Inventix Trading', zones, products, orders, purchases };
  }

  /* ---------- State ---------- */
  const store = createStore(KEY, seed);
  const db = () => store.get();
  const ui = { view: 'dashboard', productFilter: 'all', productCategory: 'all', orderFilter: 'all', query: '' };

  const productById = (id) => db().products.find((p) => p.id === id);
  const zoneById = (id) => db().zones.find((z) => z.id === id);
  const stockState = (p) => (p.stock <= 0 ? 'out' : p.stock <= p.reorder ? 'low' : 'ok');
  const orderTotal = (o) => sum(o.items.map((i) => i.qty * i.price));
  const nextNumber = (orders) => `ORD-${Math.max(1000, ...orders.map((o) => parseInt(String(o.number).replace(/\D/g, ''), 10) || 0)) + 1}`;

  function metrics() {
    const { orders, products } = db();
    const active = orders.filter((o) => isActive(o.status));
    const returned = orders.filter((o) => o.status === 'returned');
    return {
      activeOrders: active.length,
      revenue: sum(active.map(orderTotal)),
      sold: sum(active.flatMap((o) => o.items).map((i) => i.qty)),
      returned: sum(returned.flatMap((o) => o.items).map((i) => i.qty)),
      returnedOrders: returned.length,
      inventoryValue: sum(products.map((p) => p.stock * p.cost)),
      atReorder: products.filter((p) => stockState(p) !== 'ok').length,
    };
  }

  function monthlySeries(months) {
    const { orders, purchases } = db();
    return {
      income: months.map((k) => sum(orders.filter((o) => isActive(o.status) && monthKey(o.date) === k).map(orderTotal))),
      expenses: months.map((k) => sum(purchases.filter((p) => monthKey(p.date) === k).map((p) => p.qty * p.unitCost))),
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

  const stockBadge = (p) => badge(STOCK_LABEL[stockState(p)], STOCK_TONE[stockState(p)]);
  const statusBadge = (status) => badge(STATUS[status].label, STATUS[status].tone);

  const productCell = (p) => `
    <div class="product-main">
      <span class="product-tile" style="--c:${catColor(p.category)}">${esc(initialsOf(p.name))}</span>
      <div><strong>${esc(p.name)}</strong><small class="mono">${esc(p.sku)} · ${esc(p.category)}</small></div>
    </div>`;

  /* ---------- Views ---------- */
  function renderSidebar() {
    const m = metrics();
    $('#sidebar-alert').innerHTML = m.atReorder
      ? `<div class="alert-box"><strong>${num(m.atReorder)} product${m.atReorder === 1 ? '' : 's'} need restocking</strong><small>At or below reorder level</small></div>`
      : '';
  }

  function renderDashboard() {
    const m = metrics();
    const months = lastMonths(6);
    const { income, expenses } = monthlySeries(months);

    $('#dash-stats').innerHTML = [
      statCard('Total revenue', money(m.revenue), `${m.activeOrders} active orders`, 'dollar', sparkline(income)),
      statCard('Products sold', num(m.sold), 'Units in active orders', 'box'),
      statCard('Products returned', num(m.returned), `${m.returnedOrders} returned orders`, 'refresh'),
      statCard('Inventory value', money(m.inventoryValue), `${db().products.length} products at cost`, 'layers'),
    ].join('');

    $('#dash-chart').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Operational overview</h3>
          <div class="card-sub">Order revenue against stock purchases, last 6 months</div>
        </div>
      </div>
      ${barChart(months.map(monthLabel), [
        { name: 'Income', color: 'var(--accent)', values: income },
        { name: 'Expenses', color: '#94a3b8', values: expenses },
      ], { prefix: '$', format: (v) => money(v), label: 'Income and expenses by month' })}
      <div class="legend" style="margin-top: 12px;">
        <span><i style="background:var(--accent)"></i>Income</span>
        <span><i style="background:#94a3b8"></i>Expenses</span>
      </div>`;

    const sales = new Map();
    db().orders.filter((o) => isActive(o.status)).forEach((o) => o.items.forEach((i) => {
      const row = sales.get(i.productId) || { name: i.name, qty: 0 };
      row.qty += i.qty;
      sales.set(i.productId, row);
    }));
    const top = [...sales.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
    const maxQty = top.length ? top[0].qty : 1;
    $('#dash-best').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Best selling</h3>
          <div class="card-sub">Units in active orders</div>
        </div>
      </div>
      <div class="stack">
        ${top.map((t) => hbar(t.name, t.qty, maxQty, `${num(t.qty)} sold`)).join('') || emptyState('box', 'No sales yet')}
      </div>`;

    const low = db().products
      .filter((p) => stockState(p) !== 'ok')
      .sort((a, b) => a.stock / Math.max(a.reorder, 1) - b.stock / Math.max(b.reorder, 1));
    $('#dash-low').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Products running out of stock</h3>
          <div class="card-sub">At or below reorder level</div>
        </div>
        <button type="button" class="btn sm" data-action="goto-products">All products</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Product</th><th class="num">In stock</th><th class="num">Reorder at</th><th>Status</th><th class="actions"></th></tr></thead>
          <tbody>
            ${low.map((p) => `
              <tr>
                <td>${productCell(p)}</td>
                <td class="num">${num(p.stock)}</td>
                <td class="num">${num(p.reorder)}</td>
                <td>${stockBadge(p)}</td>
                <td class="actions"><button type="button" class="btn sm primary" data-action="restock" data-id="${esc(p.id)}">Add stock</button></td>
              </tr>`).join('') || '<tr><td colspan="5" class="muted">Every product is above its reorder level.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    const zones = db().zones.map((z) => {
      const used = sum(db().products.filter((p) => p.zoneId === z.id).map((p) => p.stock));
      return { z, used };
    });
    $('#dash-zones').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Warehouse storage</h3>
          <div class="card-sub">Units stored against zone capacity</div>
        </div>
      </div>
      <div class="stack">
        ${zones.map(({ z, used }) => hbar(
          `${z.name} · ${z.block}`,
          Math.min(used, z.capacity),
          z.capacity,
          `${Math.round((used / z.capacity) * 100)}%`,
          used / z.capacity >= 0.9 ? 'var(--danger)' : used / z.capacity >= 0.7 ? 'var(--warning)' : ''
        )).join('')}
      </div>`;
  }

  function renderProducts() {
    const q = ui.query.trim().toLowerCase();
    const rows = db().products
      .filter((p) => ui.productCategory === 'all' || p.category === ui.productCategory)
      .filter((p) => {
        if (ui.productFilter === 'low') return stockState(p) !== 'ok';
        if (ui.productFilter === 'out') return stockState(p) === 'out';
        return true;
      })
      .filter((p) => !q || `${p.name} ${p.sku}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    const low = db().products.filter((p) => stockState(p) !== 'ok').length;
    $('#products-sub').textContent = `${db().products.length} products · ${rows.length} shown · ${low} need restocking`;

    $('#products-table').innerHTML = rows.length ? `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Product</th><th>Zone</th><th class="num">Price</th><th class="num hide-md">Cost</th><th>Stock</th><th>Status</th><th class="actions"></th></tr>
          </thead>
          <tbody>
            ${rows.map((p) => {
              const zone = zoneById(p.zoneId);
              const ratio = p.stock / Math.max(p.reorder * 2, 1);
              const color = stockState(p) === 'out' ? 'var(--danger)' : stockState(p) === 'low' ? 'var(--warning)' : '';
              return `
              <tr>
                <td>${productCell(p)}</td>
                <td>${esc(zone ? `${zone.name} · ${zone.block}` : 'Unassigned')}</td>
                <td class="num">${money(p.price, '$', 2)}</td>
                <td class="num hide-md">${money(p.cost, '$', 2)}</td>
                <td><div class="stock-cell"><strong>${num(p.stock)} units</strong>${progress(Math.min(1, ratio), color)}</div></td>
                <td>${stockBadge(p)}</td>
                <td class="actions">
                  <button type="button" class="icon-btn sm" data-action="restock" data-id="${esc(p.id)}" aria-label="Add stock" title="Add stock">${icon('plus')}</button>
                  <button type="button" class="icon-btn sm" data-action="edit-product" data-id="${esc(p.id)}" aria-label="Edit product">${icon('edit')}</button>
                  <button type="button" class="icon-btn sm danger" data-action="delete-product" data-id="${esc(p.id)}" aria-label="Delete product">${icon('trash')}</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : emptyState('box', 'No products match', 'Change the filter or clear the search.',
        '<button type="button" class="btn primary" data-action="new-product"><span data-icon="plus"></span>Add product</button>');
  }

  function renderOrders() {
    const q = ui.query.trim().toLowerCase();
    const rows = db().orders
      .filter((o) => ui.orderFilter === 'all' || o.status === ui.orderFilter)
      .filter((o) => !q || `${o.number} ${o.customer}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

    $('#orders-sub').textContent = `${db().orders.length} orders · ${rows.length} shown`;

    $('#orders-table').innerHTML = rows.length ? `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Order</th><th>Customer</th><th>Date</th><th class="num">Items</th><th class="num">Total</th><th>Status</th><th class="actions"></th></tr>
          </thead>
          <tbody>
            ${rows.map((o) => `
              <tr class="clickable" data-action="edit-order" data-id="${esc(o.id)}">
                <td><span class="order-no">${esc(o.number)}</span></td>
                <td><span class="owner-cell">${esc(o.customer)}</span></td>
                <td>${esc(fmtDate(o.date, true))}</td>
                <td class="num">${num(sum(o.items.map((i) => i.qty)))}</td>
                <td class="num">${money(orderTotal(o), '$', 2)}</td>
                <td>${statusBadge(o.status)}</td>
                <td class="actions">
                  <button type="button" class="icon-btn sm" data-action="edit-order" data-id="${esc(o.id)}" aria-label="Edit order">${icon('edit')}</button>
                  <button type="button" class="icon-btn sm danger" data-action="delete-order" data-id="${esc(o.id)}" aria-label="Delete order">${icon('trash')}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState('truck', 'No orders here', 'Create an order to reserve stock and track delivery.',
        '<button type="button" class="btn primary" data-action="new-order"><span data-icon="plus"></span>New order</button>');
  }

  function renderWarehouses() {
    const { zones, products } = db();
    $('#zone-grid').innerHTML = zones.map((z) => {
      const items = products.filter((p) => p.zoneId === z.id);
      const used = sum(items.map((p) => p.stock));
      const ratio = z.capacity ? used / z.capacity : 0;
      const tone = ratio >= 0.9 ? 'danger' : ratio >= 0.7 ? 'warning' : 'success';
      const color = ratio >= 0.9 ? 'var(--danger)' : ratio >= 0.7 ? 'var(--warning)' : '';
      return `
        <article class="card zone-card">
          <div class="zone-head">
            <div><h3>${esc(z.name)}</h3><small>${esc(z.block)} · capacity ${num(z.capacity)} units</small></div>
            ${badge(`${pct(ratio * 100, 0)} full`, tone)}
          </div>
          ${progress(ratio, color)}
          <div class="zone-stats">
            <div><strong>${items.length}</strong><small>Products</small></div>
            <div><strong>${num(used)}</strong><small>Units stored</small></div>
            <div><strong>${num(Math.max(0, z.capacity - used))}</strong><small>Free space</small></div>
          </div>
          <ul class="zone-items">
            ${items.slice(0, 5).map((p) => `<li><span>${esc(p.name)}</span><span>${num(p.stock)}</span></li>`).join('') || '<li class="muted">No products stored here yet.</li>'}
            ${items.length > 5 ? `<li class="muted"><span>+ ${items.length - 5} more</span><span></span></li>` : ''}
          </ul>
          <div class="zone-actions">
            <button type="button" class="btn sm" data-action="edit-zone" data-id="${esc(z.id)}">${icon('edit')}Edit</button>
            <button type="button" class="btn sm danger" data-action="delete-zone" data-id="${esc(z.id)}">${icon('trash')}Delete</button>
          </div>
        </article>`;
    }).join('') || emptyState('building', 'No warehouse zones yet', 'Add a zone to organise where products are stored.');
  }

  function renderSettings() {
    const form = $('#company-form');
    if (form && document.activeElement !== form.company) form.company.value = db().company;
  }

  function render() {
    renderSidebar();
    if (ui.view === 'dashboard') renderDashboard();
    if (ui.view === 'products') renderProducts();
    if (ui.view === 'orders') renderOrders();
    if (ui.view === 'warehouses') renderWarehouses();
    if (ui.view === 'settings') renderSettings();
  }

  /* ---------- Products ---------- */
  function openProductModal(existing = null) {
    const p = existing || { sku: '', name: '', category: CATEGORIES[0].name, zoneId: '', price: '', cost: '', stock: 0, reorder: 20 };
    openModal({
      title: existing ? 'Edit product' : 'New product',
      submitLabel: existing ? 'Save changes' : 'Add product',
      body: [
        field('SKU', input('sku', p.sku, 'required placeholder="SKU-1013"')),
        field('Product name', input('name', p.name, 'required placeholder="e.g. Sparkling water 1.5L"')),
        field('Category', select('category', CATEGORIES.map((c) => c.name), p.category)),
        field('Storage zone', select('zoneId', [['', 'Unassigned'], ...db().zones.map((z) => [z.id, `${z.name} · ${z.block}`])], p.zoneId || '')),
        field('Selling price ($)', input('price', p.price, 'type="number" min="0" step="0.01" required')),
        field('Unit cost ($)', input('cost', p.cost, 'type="number" min="0" step="0.01" required')),
        field('Stock on hand', input('stock', p.stock, 'type="number" min="0" step="1" required')),
        field('Reorder level', input('reorder', p.reorder, 'type="number" min="0" step="1" required'), { hint: 'Flagged as low stock at or below this level' }),
      ].join(''),
      onSubmit: (v) => {
        const sku = v.sku.trim().toUpperCase();
        const name = v.name.trim();
        if (!sku || !name) return 'SKU and product name are required.';
        if (db().products.some((x) => x.sku === sku && (!existing || x.id !== existing.id))) {
          return `SKU ${sku} is already used by another product.`;
        }
        const price = toNum(v.price);
        const cost = toNum(v.cost);
        const stock = toNum(v.stock);
        const reorder = toNum(v.reorder);
        if ([price, cost, stock, reorder].some((n) => !Number.isFinite(n) || n < 0)) {
          return 'Prices, stock and reorder level must be zero or more.';
        }
        const fields = { sku, name, category: v.category, zoneId: v.zoneId, price, cost, stock: Math.round(stock), reorder: Math.round(reorder) };
        store.update((s) => {
          if (existing) Object.assign(s.products.find((x) => x.id === existing.id), fields);
          else s.products.push({ id: uid(), ...fields });
        });
        toast(existing ? 'Product updated' : 'Product added');
        render();
      },
    });
  }

  function openRestockModal(product) {
    if (!product) return;
    openModal({
      title: `Add stock · ${product.name}`,
      size: 'sm',
      submitLabel: 'Record purchase',
      body: [
        field('Units received', input('qty', '', 'type="number" min="1" step="1" required placeholder="e.g. 50"')),
        field('Unit cost ($)', input('unitCost', product.cost, 'type="number" min="0" step="0.01" required')),
        `<p class="full">Currently ${num(product.stock)} units in stock. Purchase total: <strong id="restock-total">${money(0, '$', 2)}</strong></p>`,
      ].join(''),
      onMount: ({ form }) => {
        const update = () => {
          const total = (toNum(form.elements.qty.value) || 0) * (toNum(form.elements.unitCost.value) || 0);
          $('#restock-total', form).textContent = money(total, '$', 2);
        };
        form.addEventListener('input', update);
        update();
      },
      onSubmit: (v) => {
        const qty = Math.round(toNum(v.qty));
        const unitCost = toNum(v.unitCost);
        if (!(qty > 0)) return 'Enter how many units were received.';
        if (!(unitCost >= 0)) return 'Enter a valid unit cost.';
        store.update((s) => {
          const p = s.products.find((x) => x.id === product.id);
          p.stock += qty;
          s.purchases.push({ id: uid(), date: today(), productId: product.id, qty, unitCost });
        });
        toast(`${num(qty)} units added to ${product.name}`);
        render();
      },
    });
  }

  async function deleteProduct(id) {
    const p = productById(id);
    if (!p) return;
    const ok = await confirmDialog({
      title: 'Delete product?',
      message: `${p.name} will be removed from the catalogue. Past orders keep their line items.`,
      confirmLabel: 'Delete product',
    });
    if (!ok) return;
    store.update((s) => { s.products = s.products.filter((x) => x.id !== id); });
    toast('Product deleted');
    render();
  }

  /* ---------- Zones ---------- */
  function openZoneModal(existing = null) {
    const z = existing || { name: '', block: '', capacity: 1000 };
    openModal({
      title: existing ? 'Edit zone' : 'New storage zone',
      submitLabel: existing ? 'Save changes' : 'Add zone',
      size: 'sm',
      body: [
        field('Zone name', input('name', z.name, 'required placeholder="e.g. Frozen goods"')),
        field('Block / location', input('block', z.block, 'placeholder="e.g. Block F"')),
        field('Capacity (units)', input('capacity', z.capacity, 'type="number" min="1" step="1" required')),
      ].join(''),
      onSubmit: (v) => {
        const name = v.name.trim();
        if (!name) return 'Give the zone a name.';
        const capacity = toNum(v.capacity);
        if (!(capacity > 0)) return 'Capacity must be more than zero.';
        const fields = { name, block: v.block.trim(), capacity: Math.round(capacity) };
        store.update((s) => {
          if (existing) Object.assign(s.zones.find((x) => x.id === existing.id), fields);
          else s.zones.push({ id: uid(), ...fields });
        });
        toast(existing ? 'Zone updated' : 'Zone added');
        render();
      },
    });
  }

  async function deleteZone(id) {
    const z = zoneById(id);
    if (!z) return;
    const count = db().products.filter((p) => p.zoneId === id).length;
    const ok = await confirmDialog({
      title: 'Delete zone?',
      message: count
        ? `${count} product${count === 1 ? ' is' : 's are'} stored here and will become unassigned.`
        : `${z.name} will be removed.`,
      confirmLabel: 'Delete zone',
    });
    if (!ok) return;
    store.update((s) => {
      s.zones = s.zones.filter((x) => x.id !== id);
      s.products.forEach((p) => { if (p.zoneId === id) p.zoneId = ''; });
    });
    toast('Zone deleted');
    render();
  }

  /* ---------- Orders ---------- */
  const productOptions = (selected = '') => [
    '<option value="">Choose a product…</option>',
    ...db().products
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => `<option value="${esc(p.id)}"${p.id === selected ? ' selected' : ''}>${esc(p.name)} · ${money(p.price, '$', 2)} · ${num(p.stock)} in stock</option>`),
  ].join('');

  const lineRow = (productId = '', qty = 1) => `
    <div class="line-row" data-line>
      <select class="input" data-product aria-label="Product">${productOptions(productId)}</select>
      <input class="input" data-qty type="number" min="1" step="1" value="${esc(qty)}" aria-label="Quantity">
      <button type="button" class="icon-btn sm danger" data-remove-line aria-label="Remove item">${icon('x')}</button>
    </div>`;

  function openOrderModal(existing = null) {
    const isNew = !existing;
    const o = existing || { customer: '', date: today(), status: 'pending', items: [] };
    const statusOptions = Object.entries(STATUS).map(([id, s]) => [id, s.label]);

    const itemsBlock = isNew
      ? `<div class="full line-list" id="lines"></div>
         <div class="full"><button type="button" class="btn sm" data-add-line>${icon('plus')}Add item</button></div>
         <div class="full line-total"><span>Order total</span><strong id="order-total">${money(0, '$', 2)}</strong></div>`
      : `<div class="full readonly-lines">${o.items.map((i) => `
           <div><span>${esc(i.name)} <small>× ${num(i.qty)}</small></span><strong>${money(i.qty * i.price, '$', 2)}</strong></div>`).join('')}
           <div><span>Total</span><strong>${money(orderTotal(o), '$', 2)}</strong></div></div>`;

    openModal({
      title: isNew ? 'New order' : `Order ${o.number}`,
      size: 'lg',
      submitLabel: isNew ? 'Create order' : 'Save changes',
      footerLeft: isNew ? '' : '<button type="button" class="btn danger" data-extra="delete-order">Delete order</button>',
      body: [
        field('Customer', input('customer', o.customer, 'required placeholder="Customer name"')),
        isNew
          ? field('Order date', input('date', o.date, 'type="date"'))
          : field('Order date', `<input class="input" value="${esc(fmtDate(o.date))}" disabled>`),
        field('Status', select('status', statusOptions, o.status), { full: false, hint: isNew ? 'Pending, shipped and delivered reserve stock' : 'Changing status updates stock automatically' }),
        itemsBlock,
      ].join(''),
      onMount: ({ form, close }) => {
        if (!isNew) {
          const del = form.querySelector('[data-extra="delete-order"]');
          if (del) del.addEventListener('click', () => { close(); deleteOrder(existing.id); });
          return;
        }
        const list = $('#lines', form);
        const addLine = (productId, qty) => list.insertAdjacentHTML('beforeend', lineRow(productId, qty));
        const recalc = () => {
          const total = sum($$('[data-line]', form).map((row) => {
            const p = productById(row.querySelector('[data-product]').value);
            const qty = Number(row.querySelector('[data-qty]').value) || 0;
            return p ? p.price * qty : 0;
          }));
          $('#order-total', form).textContent = money(total, '$', 2);
        };
        addLine('', 1);
        $('[data-add-line]', form).addEventListener('click', () => { addLine('', 1); recalc(); });
        form.addEventListener('click', (e) => {
          const remove = e.target.closest('[data-remove-line]');
          if (!remove) return;
          if ($$('[data-line]', form).length > 1) remove.closest('[data-line]').remove();
          else toast('An order needs at least one item.', 'warning');
          recalc();
        });
        form.addEventListener('input', recalc);
        form.addEventListener('change', recalc);
        recalc();
      },
      onSubmit: (v, { form }) => {
        const customer = v.customer.trim();
        if (!customer) return 'Enter the customer name.';

        if (isNew) {
          const rows = $$('[data-line]', form).map((row) => ({
            productId: row.querySelector('[data-product]').value,
            qty: Math.round(Number(row.querySelector('[data-qty]').value)),
          }));
          if (!rows.length) return 'Add at least one item.';
          if (rows.some((l) => !productById(l.productId))) return 'Choose a product for every item.';
          if (rows.some((l) => !(l.qty > 0))) return 'Each item needs a quantity of at least 1.';

          const merged = new Map();
          rows.forEach((l) => merged.set(l.productId, (merged.get(l.productId) || 0) + l.qty));
          const items = [...merged].map(([productId, qty]) => {
            const p = productById(productId);
            return { productId, name: p.name, qty, price: p.price };
          });
          const reserve = isActive(v.status);
          if (reserve) {
            const short = items.find((i) => productById(i.productId).stock < i.qty);
            if (short) return `Not enough stock for ${short.name} (${num(productById(short.productId).stock)} available).`;
          }
          store.update((s) => {
            if (reserve) items.forEach((i) => { s.products.find((p) => p.id === i.productId).stock -= i.qty; });
            s.orders.push({ id: uid(), number: nextNumber(s.orders), customer, date: v.date || today(), status: v.status, items });
          });
          toast('Order created');
          render();
          return undefined;
        }

        const from = existing.status;
        const to = v.status;
        if (from !== to && isActive(to) && !isActive(from)) {
          const short = existing.items.find((i) => {
            const p = productById(i.productId);
            return p && p.stock < i.qty;
          });
          if (short) return `Not enough stock to reactivate this order: ${short.name} (${num(productById(short.productId).stock)} available).`;
        }
        store.update((s) => {
          const order = s.orders.find((x) => x.id === existing.id);
          if (from !== to) {
            order.items.forEach((i) => {
              const p = s.products.find((x) => x.id === i.productId);
              if (!p) return;
              if (isActive(from) && !isActive(to)) p.stock += i.qty;
              if (!isActive(from) && isActive(to)) p.stock -= i.qty;
            });
            order.status = to;
          }
          order.customer = customer;
        });
        toast('Order updated');
        render();
        return undefined;
      },
    });
  }

  async function deleteOrder(id) {
    const o = db().orders.find((x) => x.id === id);
    if (!o) return;
    const restores = isActive(o.status);
    const ok = await confirmDialog({
      title: `Delete ${o.number}?`,
      message: restores ? 'Reserved stock for this order will be returned to inventory.' : 'This order will be removed from the records.',
      confirmLabel: 'Delete order',
    });
    if (!ok) return;
    store.update((s) => {
      const order = s.orders.find((x) => x.id === id);
      if (order && isActive(order.status)) {
        order.items.forEach((i) => {
          const p = s.products.find((x) => x.id === i.productId);
          if (p) p.stock += i.qty;
        });
      }
      s.orders = s.orders.filter((x) => x.id !== id);
    });
    toast('Order deleted');
    render();
  }

  /* ---------- Exports & reset ---------- */
  function exportProducts() {
    downloadFile('inventix-products.csv', toCSV(db().products, [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Product' },
      { key: 'category', label: 'Category' },
      { label: 'Zone', value: (p) => (zoneById(p.zoneId) || {}).name || '' },
      { key: 'price', label: 'Price' },
      { key: 'cost', label: 'Cost' },
      { key: 'stock', label: 'Stock' },
      { key: 'reorder', label: 'Reorder level' },
      { label: 'Status', value: (p) => STOCK_LABEL[stockState(p)] },
    ]));
    toast('Products exported');
  }

  function exportOrders() {
    downloadFile('inventix-orders.csv', toCSV(db().orders, [
      { key: 'number', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'date', label: 'Date' },
      { key: 'status', label: 'Status', value: (o) => STATUS[o.status].label },
      { label: 'Items', value: (o) => o.items.map((i) => `${i.qty} x ${i.name}`).join('; ') },
      { label: 'Total', value: (o) => orderTotal(o).toFixed(2) },
    ]));
    toast('Orders exported');
  }

  async function resetDemo() {
    const ok = await confirmDialog({
      title: 'Restore demo data?',
      message: 'This replaces all products, zones, orders and purchases with the sample inventory.',
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
      case 'new-order': return openOrderModal();
      case 'edit-order': return openOrderModal(db().orders.find((o) => o.id === id));
      case 'delete-order': return deleteOrder(id);
      case 'new-product': return openProductModal();
      case 'edit-product': return openProductModal(productById(id));
      case 'delete-product': return deleteProduct(id);
      case 'restock': return openRestockModal(productById(id));
      case 'new-zone': return openZoneModal();
      case 'edit-zone': return openZoneModal(zoneById(id));
      case 'delete-zone': return deleteZone(id);
      case 'export-products': return exportProducts();
      case 'export-orders': return exportOrders();
      case 'goto-products': location.hash = 'products'; return;
      case 'reset-demo': return resetDemo();
      default: return undefined;
    }
  }

  document.addEventListener('click', (e) => {
    const seg = e.target.closest('#product-filter [data-filter]');
    if (seg) {
      ui.productFilter = seg.dataset.filter;
      $$('#product-filter button').forEach((b) => b.classList.toggle('on', b === seg));
      renderProducts();
      return;
    }
    const orderSeg = e.target.closest('#order-filter [data-filter]');
    if (orderSeg) {
      ui.orderFilter = orderSeg.dataset.filter;
      $$('#order-filter button').forEach((b) => b.classList.toggle('on', b === orderSeg));
      renderOrders();
      return;
    }
    const action = e.target.closest('[data-action]');
    if (action) handleAction(action.dataset.action, action.dataset.id);
  });

  const company = $('#company-form');
  company.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = company.company.value.trim();
    if (!name) { toast('Enter a company name.', 'error'); return; }
    store.update((s) => { s.company = name; });
    toast('Company details saved');
  });

  /* ---------- Boot ---------- */
  initTheme({ button: $('[data-theme-toggle]') });
  initShell();

  const category = $('#product-category');
  category.innerHTML = ['<option value="all">All categories</option>', ...CATEGORIES.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`)].join('');
  category.addEventListener('change', (e) => {
    ui.productCategory = e.target.value;
    renderProducts();
  });

  const search = $('#global-search');
  search.addEventListener('input', (e) => {
    ui.query = e.target.value;
    if (ui.view === 'products' || ui.view === 'orders') render();
    else router.go('products');
  });

  const router = initRouter(['dashboard', 'products', 'orders', 'warehouses', 'settings'], (view) => {
    ui.view = view;
    render();
  });
});
