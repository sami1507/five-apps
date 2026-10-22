'use strict';

const { S } = require('../schema');
const { round2, sum, dayKey } = require('../lib/util');

const CATEGORIES = ['Beverages', 'Fruits', 'Vegetables', 'Dairy', 'Pantry', 'Health & Beauty'];
const ORDER_STATUSES = ['pending', 'shipped', 'delivered', 'returned', 'cancelled'];
// Orders in these states hold stock. Returned and cancelled orders release it.
const RESERVING_STATUSES = ['pending', 'shipped', 'delivered'];

const zone = S.record({
  id: S.id,
  name: S.text(1, 120),
  block: S.text(0, 60),
  capacity: S.integer(1, 1e7),
});

const product = S.record({
  id: S.id,
  sku: S.text(1, 40),
  name: S.text(1, 160),
  category: S.enum(CATEGORIES),
  price: S.number(0, 1e7),
  cost: S.number(0, 1e7),
  stock: S.integer(0, 1e7),
  reorder: S.integer(0, 1e7),
  zoneId: S.text(0, 64),
});

const orderLine = S.record({
  productId: S.text(0, 64),
  name: S.text(1, 160),
  qty: S.integer(1, 100000),
  price: S.number(0, 1e7),
});

const order = S.record({
  id: S.id,
  number: S.text(1, 20),
  customer: S.text(1, 120),
  date: S.date,
  status: S.enum(ORDER_STATUSES),
  items: S.list(orderLine, 50),
});

const purchase = S.record({
  id: S.id,
  date: S.date,
  productId: S.text(0, 64),
  qty: S.integer(1, 1e7),
  unitCost: S.number(0, 1e7),
});

module.exports = {
  key: 'inventory',
  name: 'Inventix',
  description: 'Products, warehouse zones and orders. Active orders reserve stock; cancelled and returned orders release it.',
  schema: {
    collections: {
      zones: S.list(zone, 500),
      products: S.list(product, 10000),
      orders: S.list(order, 20000),
      purchases: S.list(purchase, 50000),
    },
    settings: {
      company: S.text(1, 120),
    },
  },

  invariants(doc) {
    // Purchase and order lines keep their product id on purpose: history survives deleting a product.
    const problems = [];
    const zoneIds = new Set(doc.zones.map((z) => z.id));
    doc.products.forEach((p, i) => {
      if (p.zoneId && !zoneIds.has(p.zoneId)) {
        problems.push({ path: `products[${i}].zoneId`, message: 'refers to a zone that does not exist' });
      }
    });
    return problems;
  },

  summary(doc, now) {
    const active = doc.orders.filter((o) => RESERVING_STATUSES.includes(o.status));
    const activeLines = active.flatMap((o) => o.items);
    const returnedLines = doc.orders.filter((o) => o.status === 'returned').flatMap((o) => o.items);
    return {
      asOf: dayKey(now),
      products: doc.products.length,
      lowStock: doc.products.filter((p) => p.stock <= p.reorder).length,
      outOfStock: doc.products.filter((p) => p.stock === 0).length,
      inventoryValue: round2(sum(doc.products.map((p) => p.stock * p.cost))),
      activeOrders: active.length,
      activeRevenue: round2(sum(activeLines.map((l) => l.qty * l.price))),
      unitsSold: sum(activeLines.map((l) => l.qty)),
      unitsReturned: sum(returnedLines.map((l) => l.qty)),
      ordersByStatus: Object.fromEntries(ORDER_STATUSES.map((s) => [s, doc.orders.filter((o) => o.status === s).length])),
    };
  },
};
