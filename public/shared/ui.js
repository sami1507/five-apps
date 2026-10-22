/* Shared helpers for the five apps: DOM, formatting, storage, modals, charts.
   Plain browser script (no build step), exposed as window.UI. */
(function () {
  'use strict';

  /* ---------- DOM ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- Dates (local time, never UTC-shifted) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => toISO();
  const parseISO = (iso) => new Date(`${iso}T00:00:00`);
  const addDays = (iso, days) => { const d = parseISO(iso); d.setDate(d.getDate() + days); return toISO(d); };
  const addMonths = (iso, months) => { const d = parseISO(iso); d.setMonth(d.getMonth() + months); return toISO(d); };
  const daysBetween = (from, to) => Math.round((parseISO(to) - parseISO(from)) / 86400000);
  const monthKey = (iso) => String(iso || '').slice(0, 7);
  const monthLabel = (key) => parseISO(`${key}-01`).toLocaleDateString('en-US', { month: 'short' });
  /** The last n month keys ending with the current month, oldest first. */
  const lastMonths = (n) => Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (n - 1 - i));
    return toISO(d).slice(0, 7);
  });
  const fmtDate = (iso, short = false) => {
    if (!iso) return '—';
    return parseISO(iso).toLocaleDateString('en-US', short ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  };

  /* ---------- Numbers ---------- */
  const money = (value, currency = '$', decimals = 0) => {
    const n = Number(value) || 0;
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return (n < 0 ? '-' : '') + currency + s;
  };
  const num = (value, decimals = 0) => (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: decimals });
  const pct = (value, decimals = 1) => `${(Number(value) || 0).toFixed(decimals)}%`;
  const compact = (value, prefix = '') => {
    const a = Math.abs(Number(value) || 0);
    const sign = Number(value) < 0 ? '-' : '';
    if (a >= 1e6) return `${sign}${prefix}${(a / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (a >= 1e3) return `${sign}${prefix}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`;
    return `${sign}${prefix}${Math.round(a)}`;
  };
  const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

  /* ---------- Icons (stroke icons, 24px grid) ---------- */
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/>',
    kanban: '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    download: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v3h16v-3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    wallet: '<rect x="2" y="6" width="20" height="14" rx="2.5"/><path d="M16 13h2M2 10h20"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    sparkle: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    trend: '<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  };
  const icon = (name, cls = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ico ${cls}" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ---------- Form building blocks ---------- */
  const field = (label, control, { full = false, hint = '' } = {}) =>
    `<label class="field${full ? ' full' : ''}"><span>${esc(label)}</span>${control}${hint ? `<small class="hint muted">${esc(hint)}</small>` : ''}</label>`;
  const input = (name, value = '', attrs = '') =>
    `<input class="input" name="${esc(name)}" value="${esc(value)}" ${attrs}>`;
  const select = (name, options, value = '', attrs = '') =>
    `<select class="input" name="${esc(name)}" ${attrs}>${options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  const textarea = (name, value = '', attrs = '') =>
    `<textarea class="input" name="${esc(name)}" ${attrs}>${esc(value)}</textarea>`;

  /* ---------- UI bits ---------- */
  const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
  const avatar = (name = '?', size = '') => {
    const initials = String(name).trim().split(/\s+/).map((p) => p[0] || '').join('').slice(0, 2).toUpperCase() || '?';
    let hash = 0;
    for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return `<span class="avatar ${size}" style="--h:${Math.abs(hash) % 360}" title="${esc(name)}">${esc(initials)}</span>`;
  };
  const hbar = (label, value, max, display = value, color = '') => {
    const width = max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0;
    return `<div class="hbar"><div class="hbar-top"><span>${esc(label)}</span><strong>${esc(display)}</strong></div>` +
      `<div class="hbar-track"><span style="width:${width.toFixed(1)}%${color ? `;background:${color}` : ''}"></span></div></div>`;
  };
  const progress = (ratio, color = '') => {
    const width = Math.min(100, Math.max(0, ratio * 100));
    return `<div class="progress"><span style="width:${width.toFixed(1)}%${color ? `;background:${color}` : ''}"></span></div>`;
  };
  const emptyState = (iconName, title, text = '', action = '') =>
    `<div class="empty">${icon(iconName, 'ico-lg')}<h4>${esc(title)}</h4>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;

  /* ---------- Storage (localStorage, JSON, safe) ---------- */
  /**
   * Keeps an app's data. When the backend is running (window.Store.mode === 'remote') the data is the
   * server's copy and every change is synced; otherwise it is kept in browser storage under the given key.
   * Both modes expose the same API, so the apps do not need to know which one is in use.
   */
  function createStore(key, seed) {
    const remote = !!(window.Store && window.Store.mode === 'remote');
    let data = remote ? window.Store.takeSnapshot() : null;
    if (remote && !data) {
      data = seed();
      window.Store.init(data);
    }
    if (!remote) {
      try { data = JSON.parse(localStorage.getItem(key)); } catch (_) { data = null; }
      if (!data || typeof data !== 'object') data = seed();
    }
    const save = () => {
      if (remote) return;
      try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {
        toast('Browser storage is unavailable, so changes will not persist.', 'warning');
      }
    };
    save();
    return {
      get: () => data,
      update(mutator) {
        if (!remote) {
          mutator(data);
          save();
          return;
        }
        const before = JSON.parse(JSON.stringify(data));
        mutator(data);
        window.Store.sync(before, data);
      },
      reset() {
        if (remote) {
          window.Store.reset();
          return;
        }
        data = seed();
        save();
      },
    };
  }

  /* ---------- Theme ---------- */
  function initTheme({ button = null, storageKey = 'theme', fallback = null } = {}) {
    let saved = null;
    try { saved = localStorage.getItem(storageKey); } catch (_) { saved = null; }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const apply = (theme) => {
      document.documentElement.dataset.theme = theme;
      if (button) {
        button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
        button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      }
    };
    apply(saved || fallback || (prefersDark ? 'dark' : 'light'));
    if (button) {
      button.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(storageKey, next); } catch (_) { /* ignore */ }
        apply(next);
      });
    }
  }

  /* ---------- Shell: icons, mobile sidebar ---------- */
  function initShell() {
    $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
    const sidebar = $('.sidebar');
    const backdrop = $('.backdrop');
    const toggle = $('.menu-btn');
    const setOpen = (open) => {
      if (sidebar) sidebar.classList.toggle('open', open);
      if (backdrop) backdrop.classList.toggle('show', open);
    };
    if (toggle) toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
    if (backdrop) backdrop.addEventListener('click', () => setOpen(false));
    return { closeSidebar: () => setOpen(false) };
  }

  /* ---------- Hash router: one [data-view] section visible at a time ---------- */
  function initRouter(views, onChange) {
    const fallback = views[0];
    const show = () => {
      const requested = decodeURIComponent(location.hash.replace('#', '')) || fallback;
      const view = views.includes(requested) ? requested : fallback;
      $$('[data-view]').forEach((el) => { el.hidden = el.dataset.view !== view; });
      $$('[data-nav]').forEach((el) => {
        const active = el.dataset.nav === view;
        el.classList.toggle('active', active);
        if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
      });
      const sidebar = $('.sidebar');
      const backdrop = $('.backdrop');
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('show');
      if (onChange) onChange(view);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', show);
    show();
    return { go: (name) => { location.hash = name; } };
  }

  /* ---------- Toast ---------- */
  function toast(message, type = 'success') {
    let host = $('#toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'toast-host';
      host.setAttribute('role', 'status');
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.classList.add('leave'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  /* ---------- Modal ---------- */
  function showFormError(form, message) {
    let el = $('.form-error', form);
    if (!el) {
      el = document.createElement('div');
      el.className = 'form-error';
      $('.modal-body', form).prepend(el);
    }
    el.textContent = message;
  }

  /**
   * Opens a form modal. onSubmit(values, api) returns an error string to keep the
   * modal open, or nothing to close it. onDismiss runs when cancelled (Esc, X, backdrop).
   */
  function openModal({ title, body, submitLabel = 'Save', size = '', footerLeft = '', onMount, onSubmit, onDismiss }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <form class="modal-form" autocomplete="off" novalidate>
          <header class="modal-head">
            <h2>${esc(title)}</h2>
            <button type="button" class="icon-btn sm" data-close aria-label="Close">${icon('x')}</button>
          </header>
          <div class="modal-body">${body}</div>
          <footer class="modal-foot">
            ${footerLeft ? `<div class="modal-foot-left">${footerLeft}</div>` : ''}
            <button type="button" class="btn ghost" data-close>Cancel</button>
            <button type="submit" class="btn primary">${esc(submitLabel)}</button>
          </footer>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    const form = $('form', backdrop);
    let finished = false;
    const close = () => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    };
    const dismiss = () => {
      if (finished) return;
      close();
      if (onDismiss) onDismiss();
    };
    const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-close]')) dismiss();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const error = onSubmit ? onSubmit(values, { form, close }) : null;
      if (error) { showFormError(form, error); return; }
      close();
    });
    if (onMount) onMount({ form, close, body: $('.modal-body', backdrop) });
    setTimeout(() => {
      const first = $('input:not([type="hidden"]), select, textarea', form);
      if (first) first.focus();
    }, 30);
    return { form, close };
  }

  /** Resolves true when confirmed, false when cancelled. */
  function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Delete' } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      openModal({
        title,
        size: 'sm',
        submitLabel: confirmLabel,
        body: `<p>${esc(message)}</p>`,
        onMount: ({ form }) => { $('.btn.primary', form).classList.add('solid-danger'); },
        onSubmit: () => { answered = true; resolve(true); },
        onDismiss: () => { if (!answered) resolve(false); },
      });
    });
  }

  /* ---------- Export ---------- */
  function downloadFile(filename, content, type = 'text/csv') {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  /** columns: [{ key, label, value?: (row) => any }] */
  function toCSV(rows, columns) {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => cell(c.label)).join(',')];
    rows.forEach((row) => lines.push(columns.map((c) => cell(c.value ? c.value(row) : row[c.key])).join(',')));
    return '﻿' + lines.join('\r\n');
  }

  /* ---------- Charts (inline SVG, theme-aware via CSS variables) ---------- */
  /* Chart scale: four equal steps of a round number, so the axis reads 15k / 30k / 45k / 60k. */
  const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const niceMax = (x) => {
    if (x <= 0) return 4;
    const step = Math.max(1, x / 4); // never fractional steps: small counts get whole-number ticks
    if (x <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(step)));
    const n = step / p;
    const m = NICE_STEPS.find((c) => c >= n) || 10;
    return m * p * 4;
  };

  /** Grouped bars. series: [{ name, color, values: [] }] */
  function barChart(labels, series, { height = 240, format = (v) => v, prefix = '', label = 'Bar chart' } = {}) {
    const W = 640, H = height;
    const pad = { t: 14, r: 10, b: 30, l: 46 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
    const groupW = innerW / Math.max(labels.length, 1);
    const barW = Math.min(26, (groupW * 0.72) / Math.max(series.length, 1));
    let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">`;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + innerH - (innerH * i) / 4;
      out += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/>`;
      out += `<text class="axis" x="${pad.l - 8}" y="${y + 4}" text-anchor="end">${esc(compact((max * i) / 4, prefix))}</text>`;
    }
    labels.forEach((lab, i) => {
      const gx = pad.l + i * groupW + groupW / 2;
      series.forEach((s, j) => {
        const v = Number(s.values[i]) || 0;
        const h = (innerH * v) / max;
        const x = gx - (series.length * barW) / 2 + j * barW + 2;
        out += `<rect class="bar" x="${x.toFixed(1)}" y="${(pad.t + innerH - h).toFixed(1)}" width="${(barW - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="4" style="fill:${s.color}"><title>${esc(s.name)} · ${esc(lab)}: ${esc(format(v))}</title></rect>`;
      });
      out += `<text class="axis" x="${gx.toFixed(1)}" y="${H - 9}" text-anchor="middle">${esc(lab)}</text>`;
    });
    return out + '</svg>';
  }

  /** Donut. segments: [{ label, value, color, display }] */
  function donut(segments, { center = '', sub = '' } = {}) {
    const r = 54, c = 2 * Math.PI * r, total = sum(segments.map((s) => s.value)) || 1;
    let offset = 0;
    const arcs = segments.filter((s) => s.value > 0).map((s) => {
      const len = (c * s.value) / total;
      const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke-width="18" style="stroke:${s.color}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)"><title>${esc(s.label)}: ${esc(s.display ?? s.value)}</title></circle>`;
      offset += len;
      return el;
    }).join('');
    return `<svg viewBox="0 0 140 140" class="donut" role="img" aria-label="${esc(sub)}">` +
      `<circle cx="70" cy="70" r="${r}" fill="none" stroke-width="18" style="stroke:var(--surface-2)"/>${arcs}` +
      `<text class="donut-val" x="70" y="67" text-anchor="middle">${esc(center)}</text>` +
      `<text class="donut-label" x="70" y="84" text-anchor="middle">${esc(sub)}</text></svg>`;
  }

  /** Tiny area-less line for stat cards. */
  function sparkline(values, color = '') {
    const w = 120, h = 34;
    if (!values.length) return '';
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    const step = values.length > 1 ? w / (values.length - 1) : w;
    const pts = values.map((v, i) => [i * step, h - 4 - ((v - min) / range) * (h - 8)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${color || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  window.UI = {
    $, $$, esc, uid,
    toISO, today, parseISO, addDays, addMonths, daysBetween, monthKey, monthLabel, lastMonths, fmtDate,
    money, num, pct, compact, sum,
    icon, badge, avatar, hbar, progress, emptyState,
    field, input, select, textarea,
    createStore, initTheme, initShell, initRouter,
    toast, openModal, confirmDialog,
    downloadFile, toCSV,
    barChart, donut, sparkline,
  };
})();
