/* Connects an app to the backend in /server when the server is running.
 *
 *   - At startup the app's document is loaded from /api/<app>/state. window.Store.ready resolves afterwards.
 *   - Each change made through UI.createStore is turned into a batch of operations
 *     (upsert, delete, setting) and sent to /api/<app>/sync. The server validates the whole batch
 *     and applies it atomically, so an invalid change never reaches the stored data.
 *   - When the page is opened from disk (file://) or no server answers, the app keeps working
 *     from browser storage and this module stays out of the way.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var appKey = root.getAttribute('data-app') || '';
  var online = /^https?:$/.test(location.protocol) && appKey !== '';
  var base = '/api/' + appKey;
  var MAX_OPS = 500;

  var state = {
    mode: 'local',
    snapshot: null,
    chain: Promise.resolve(),
    queue: [],
    timer: null,
    badge: null,
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function notify(message, tone) {
    if (window.UI && window.UI.toast) window.UI.toast(message, tone || 'success');
  }

  function ensureBadge() {
    if (state.badge) return state.badge;
    var host = document.querySelector('.sidebar') || document.body;
    var el = document.createElement('div');
    el.className = 'store-status';
    el.setAttribute('role', 'status');
    host.appendChild(el);
    state.badge = el;
    return el;
  }

  var LABELS = {
    remote: 'Saved on the local server',
    saving: 'Saving…',
    saved: 'All changes saved',
    error: 'Changes not saved',
    local: 'Stored in this browser',
  };

  function setStatus(kind) {
    var el = ensureBadge();
    el.dataset.state = kind;
    el.textContent = LABELS[kind] || '';
  }

  function describeFailure(body, status) {
    var message = (body && body.error) || 'HTTP ' + status;
    if (body && body.details && body.details.length) {
      var first = body.details.slice(0, 3).map(function (d) { return d.path + ' ' + d.message; });
      message += ': ' + first.join('; ');
    }
    return message;
  }

  /** Operations that turn `before` into `after`, for the top-level collections and settings of an app. */
  function diff(before, after) {
    var ops = [];
    var keys = Object.keys(after);
    Object.keys(before).forEach(function (key) {
      if (keys.indexOf(key) === -1) keys.push(key);
    });
    keys.forEach(function (key) {
      var prev = before[key];
      var next = after[key];
      if (Array.isArray(prev) || Array.isArray(next)) {
        var prevMap = new Map((prev || []).map(function (r) { return [r.id, r]; }));
        var nextMap = new Map((next || []).map(function (r) { return [r.id, r]; }));
        prevMap.forEach(function (_, id) {
          if (!nextMap.has(id)) ops.push({ op: 'delete', collection: key, id: id });
        });
        nextMap.forEach(function (record, id) {
          var old = prevMap.get(id);
          if (!old || JSON.stringify(old) !== JSON.stringify(record)) {
            ops.push({ op: 'upsert', collection: key, record: record });
          }
        });
      } else if (JSON.stringify(prev) !== JSON.stringify(next)) {
        ops.push({ op: 'setting', key: key, value: next });
      }
    });
    return ops;
  }

  function post(path, body) {
    var options = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) options.body = JSON.stringify(body);
    return fetch(base + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (payload) {
        if (!res.ok) throw new Error(describeFailure(payload, res.status));
        return payload;
      });
    });
  }

  function sendBatch(ops) {
    setStatus('saving');
    return post('/sync', { ops: ops })
      .then(function () { setStatus('saved'); })
      .catch(function (err) {
        setStatus('error');
        notify('Not saved: ' + err.message, 'error');
      });
  }

  function flush() {
    var ops = state.queue.splice(0, state.queue.length);
    for (var i = 0; i < ops.length; i += MAX_OPS) {
      (function (chunk) {
        state.chain = state.chain.then(function () { return sendBatch(chunk); });
      })(ops.slice(i, i + MAX_OPS));
    }
  }

  function enqueue(ops) {
    if (!ops.length) return;
    state.queue.push.apply(state.queue, ops);
    clearTimeout(state.timer);
    // Small delay so a burst of changes from one user action travels as a single request.
    state.timer = setTimeout(flush, 25);
  }

  function loadRemote() {
    return fetch(base + '/state', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 404) {
          // The server is up but this app has no data yet; the app will send its starting document.
          state.mode = 'remote';
          state.snapshot = null;
          return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json().then(function (doc) {
          state.mode = 'remote';
          state.snapshot = doc;
        });
      })
      .catch(function () {
        state.mode = 'local';
        state.snapshot = null;
      });
  }

  var ready = (online ? loadRemote() : Promise.resolve()).then(function () {
    if (state.mode !== 'remote') state.mode = 'local';
    setStatus(state.mode);
  });

  window.Store = {
    ready: ready,
    get mode() { return state.mode; },

    /** Returns the snapshot loaded at startup (once). */
    takeSnapshot: function () {
      var snapshot = state.snapshot;
      state.snapshot = null;
      return snapshot;
    },

    /** Sends the starting document when the server has no data for this app yet. */
    init: function (doc) {
      state.chain = state.chain.then(function () {
        setStatus('saving');
        return post('/init', clone(doc))
          .then(function () { setStatus('saved'); })
          .catch(function (err) {
            setStatus('error');
            notify('Could not start the app on the server: ' + err.message, 'error');
          });
      });
    },

    /** Records the difference between two snapshots of the app's data. */
    sync: function (before, after) {
      enqueue(diff(before, after));
    },

    /** Clears the app's stored data on the server, then reloads so it starts from its sample data. */
    reset: function () {
      return post('/reset')
        .then(function () { location.reload(); })
        .catch(function (err) { notify('Could not reset: ' + err.message, 'error'); });
    },
  };
})();
