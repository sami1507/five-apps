'use strict';

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (the same convention the browser apps use). */
function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local date-time as YYYY-MM-DDTHH:MM. */
function stampKey(date = new Date()) {
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Adds whole days to a YYYY-MM-DD string and returns a YYYY-MM-DD string. */
function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Negative when `to` is earlier. */
function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
}

const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

module.exports = { dayKey, stampKey, addDays, daysBetween, sum, round2, pad };
