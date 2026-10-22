'use strict';

const { S } = require('../schema');
const { round2, sum, dayKey } = require('../lib/util');

const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investments', 'Other income'];
const EXPENSE_CATEGORIES = ['Housing', 'Groceries', 'Utilities', 'Transport', 'Dining', 'Shopping', 'Health', 'Entertainment', 'Subscriptions', 'Education'];
const ACCOUNT_TYPES = ['Checking', 'Savings', 'Cash', 'Credit card', 'Investment'];
const LIQUID_TYPES = ['Checking', 'Savings', 'Cash'];

const account = S.record({
  id: S.id,
  name: S.text(1, 120),
  type: S.enum(ACCOUNT_TYPES),
  opening: S.number(-1e9, 1e9),
});

const transaction = S.record({
  id: S.id,
  date: S.date,
  description: S.text(1, 200),
  category: S.enum([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]),
  type: S.enum(['income', 'expense']),
  amount: S.number(0.01, 1e9),
  accountId: S.text(1, 64),
  status: S.enum(['completed', 'pending']),
});

const signed = (t) => (t.type === 'income' ? t.amount : -t.amount);

module.exports = {
  key: 'finance',
  name: 'Ledgerly',
  description: 'Accounts, income and expense transactions, monthly budgets and a cash-flow summary.',
  schema: {
    collections: {
      accounts: S.list(account, 200),
      transactions: S.list(transaction, 100000),
    },
    settings: {
      budgets: S.map(S.number(0, 1e9)),
    },
  },

  invariants(doc) {
    const problems = [];
    const accountIds = new Set(doc.accounts.map((a) => a.id));
    doc.transactions.forEach((t, i) => {
      if (!accountIds.has(t.accountId)) {
        problems.push({ path: `transactions[${i}].accountId`, message: 'refers to an account that does not exist' });
      }
      const isIncomeCategory = INCOME_CATEGORIES.includes(t.category);
      if (isIncomeCategory !== (t.type === 'income')) {
        problems.push({ path: `transactions[${i}].category`, message: `"${t.category}" does not match the transaction type "${t.type}"` });
      }
    });
    Object.keys(doc.budgets || {}).forEach((category) => {
      if (!EXPENSE_CATEGORIES.includes(category)) {
        problems.push({ path: `budgets.${category}`, message: 'is not an expense category' });
      }
    });
    return problems;
  },

  summary(doc, now) {
    const today = dayKey(now);
    const month = today.slice(0, 7);
    const completed = doc.transactions.filter((t) => t.status === 'completed');
    const income = sum(doc.transactions.filter((t) => t.type === 'income').map((t) => t.amount));
    const expenses = sum(doc.transactions.filter((t) => t.type === 'expense').map((t) => t.amount));
    const spentThisMonth = (category) => sum(doc.transactions
      .filter((t) => t.type === 'expense' && t.date.startsWith(month) && (!category || t.category === category))
      .map((t) => t.amount));

    const budgets = doc.budgets || {};
    const overBudget = Object.keys(budgets).filter((category) => spentThisMonth(category) > budgets[category]);

    const balances = doc.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: round2(a.opening + sum(completed.filter((t) => t.accountId === a.id).map(signed))),
    }));

    return {
      asOf: today,
      transactions: doc.transactions.length,
      pending: doc.transactions.filter((t) => t.status === 'pending').length,
      income: round2(income),
      expenses: round2(expenses),
      net: round2(income - expenses),
      savingsRate: income ? round2(((income - expenses) / income) * 100) : 0,
      netWorth: round2(sum(balances.map((b) => b.balance))),
      liquidCash: round2(sum(doc.accounts.filter((a) => LIQUID_TYPES.includes(a.type))
        .map((a) => a.opening + sum(completed.filter((t) => t.accountId === a.id).map(signed))))),
      spentThisMonth: round2(spentThisMonth()),
      budgetsOverLimit: overBudget,
      balances,
    };
  },
};
