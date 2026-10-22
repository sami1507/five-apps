/* DocPilot: upload documents, read them page by page and ask questions with cited answers.
   Retrieval runs entirely in the browser (BM25 over passages). With a Claude API key in Settings,
   the top passages are sent to Claude, which answers with [n] citations that link back to the source. */
window.Store.ready.then(function () {
  'use strict';

  const U = window.UI;
  const {
    $, $$, esc, icon, num, badge, sum, uid, fmtDate, emptyState, toast, confirmDialog,
    initTheme, initShell, initRouter, createStore,
  } = U;

  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const AI_KEY = 'docpilot-ai';
  const SUPPORTED = ['PDF', 'TXT', 'MD', 'MARKDOWN', 'CSV', 'JSON'];
  const MAX_MB = 25;
  const CHUNK_TARGET = 620;
  const SECTION_TARGET = 2400;
  const DEFAULT_MODEL = 'claude-sonnet-5-5';
  const SYSTEM = 'You answer questions about the user\'s documents using only the numbered excerpts provided. '
    + 'Cite the excerpts you rely on with their bracketed numbers, such as [2]. '
    + 'If the excerpts do not answer the question, say so plainly. Reply in the language of the question.';
  const QUICK = {
    summary: { label: 'Summarize', question: 'Summarize the key points of these documents as short bullet points.' },
    numbers: { label: 'Dates & numbers', question: 'List the important dates, amounts and figures mentioned.' },
    conclusions: { label: 'Conclusions', question: 'What are the main conclusions or recommendations?' },
  };
  const STOPWORDS = new Set(('a an and are as at be been but by can did do does for from has have had he her his i if in '
    + 'into is it its of on or our she so that the their them then there these they this to was we were what when where '
    + 'which who will with would you your not no yes about than more also any all').split(' '));

  /* ---------- AI settings ---------- */
  const loadAI = () => { try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch (_) { return {}; } };
  const saveAI = (cfg) => { try { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); } catch (_) { toast('Could not save settings in this browser.', 'error'); } };
  let ai = loadAI();
  const modelName = () => ((ai.model || DEFAULT_MODEL) === 'claude-haiku-5-5' ? 'Haiku 5.5' : 'Sonnet 5.5');

  /* ---------- Persistence: the backend when it is running, otherwise IndexedDB ---------- */
  const persist = (() => {
    if (window.Store && window.Store.mode === 'remote') {
      // Documents live on the server. Each change is synced by the shared store layer.
      const store = createStore('doc-assistant', () => ({ documents: [] }));
      return {
        load: () => Promise.resolve(store.get().documents.slice()),
        save: (doc) => store.update((s) => {
          s.documents = s.documents.filter((d) => d.id !== doc.id);
          s.documents.unshift(doc);
        }),
        remove: (id) => store.update((s) => { s.documents = s.documents.filter((d) => d.id !== id); }),
        clear: () => store.update((s) => { s.documents = []; }),
      };
    }

    let db = null;
    let usable = typeof indexedDB !== 'undefined';
    const open = () => new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open('docpilot', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('documents', { keyPath: 'id' });
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
    const run = async (mode, make) => {
      const database = await open();
      return new Promise((resolve, reject) => {
        const tx = database.transaction('documents', mode);
        const req = make(tx.objectStore('documents'));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    };
    const guard = async (fn, fallback) => {
      if (!usable) return fallback;
      try { return await fn(); } catch (_) {
        usable = false;
        toast('Browser storage is unavailable, so documents last only until you reload.', 'warning');
        return fallback;
      }
    };
    return {
      load: () => guard(() => run('readonly', (s) => s.getAll()).then((rows) => rows || []), []),
      save: (doc) => guard(() => run('readwrite', (s) => s.put(doc)), undefined),
      remove: (id) => guard(() => run('readwrite', (s) => s.delete(id)), undefined),
      clear: () => guard(() => run('readwrite', (s) => s.clear()), undefined),
    };
  })();

  /* ---------- State ---------- */
  const state = {
    view: 'dashboard',
    docs: [],
    activeDocId: null,
    scope: 'active',
    messages: [],
    busy: false,
    asked: 0,
    filter: '',
  };
  const activeDoc = () => state.docs.find((d) => d.id === state.activeDocId) || null;
  const filteredDocs = () => {
    const q = state.filter.trim().toLowerCase();
    return state.docs.filter((d) => !q || d.name.toLowerCase().includes(q));
  };

  /* ---------- Extraction ---------- */
  const fileExt = (name) => (name.split('.').pop() || '').toUpperCase();
  const formatBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  const nowIso = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  let pdfLibPromise = null;
  function loadPdfJs() {
    if (!pdfLibPromise) {
      pdfLibPromise = new Promise((resolve, reject) => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
          return resolve(window.pdfjsLib);
        }
        const script = document.createElement('script');
        script.src = PDFJS_URL;
        script.async = true;
        script.onload = () => {
          if (!window.pdfjsLib) { pdfLibPromise = null; return reject(new Error('the PDF reader failed to start.')); }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
          resolve(window.pdfjsLib);
        };
        script.onerror = () => { pdfLibPromise = null; reject(new Error('the PDF reader could not load. Check your connection and try again.')); };
        document.head.appendChild(script);
      });
    }
    return pdfLibPromise;
  }

  async function extractPdf(file) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
      pages.push({ n: i, text });
    }
    return { pageLabel: 'Page', pages };
  }

  /** Groups paragraphs into sections of roughly `target` characters, so plain files get page-like anchors. */
  function splitSections(text, target = SECTION_TARGET) {
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const sections = [];
    let buffer = '';
    paragraphs.forEach((p) => {
      if (buffer && buffer.length + p.length > target) {
        sections.push(buffer);
        buffer = p;
      } else {
        buffer = buffer ? `${buffer}\n\n${p}` : p;
      }
    });
    if (buffer) sections.push(buffer);
    return sections.map((t, i) => ({ n: i + 1, text: t }));
  }

  async function extractText(file, ext) {
    const raw = await file.text();
    let text = raw;
    if (ext === 'JSON') {
      try { text = JSON.stringify(JSON.parse(raw), null, 2); } catch (_) { text = raw; }
    }
    return { pageLabel: 'Section', pages: splitSections(text) };
  }

  /** Splits text into passages of about `target` characters, breaking at sentence ends (including Arabic ؟). */
  function chunkText(text, target = CHUNK_TARGET) {
    const pieces = text.split(/(?<=[.!?؟])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    const out = [];
    let buffer = '';
    pieces.forEach((piece) => {
      if (buffer && buffer.length + piece.length + 1 > target) {
        out.push(buffer);
        buffer = piece;
      } else {
        buffer = buffer ? `${buffer} ${piece}` : piece;
      }
    });
    if (buffer) out.push(buffer);
    return out;
  }

  async function processFile(file) {
    const ext = fileExt(file.name);
    const id = uid();
    const { pageLabel, pages } = ext === 'PDF' ? await extractPdf(file) : await extractText(file, ext);
    const chunks = [];
    pages.forEach((p) => chunkText(p.text).forEach((text) => {
      chunks.push({ id: `${id}:${chunks.length}`, page: p.n, text });
    }));
    if (!chunks.length) {
      throw new Error(ext === 'PDF' ? 'no selectable text was found. Scanned PDFs need OCR first.' : 'the file is empty.');
    }
    const wordCount = chunks.reduce((n, c) => n + c.text.split(/\s+/).length, 0);
    return {
      id,
      name: file.name,
      ext,
      size: file.size,
      uploadedAt: nowIso(),
      pageLabel,
      pageCount: pages.length,
      wordCount,
      chunks,
    };
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      const ext = fileExt(file.name);
      if (!SUPPORTED.includes(ext)) {
        toast(`${file.name} is not a supported type. Use PDF, TXT, MD, CSV or JSON.`, 'error');
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        toast(`${file.name} is larger than ${MAX_MB} MB.`, 'error');
        continue;
      }
      toast(`Reading ${file.name}…`);
      try {
        const doc = await processFile(file);
        state.docs.unshift(doc);
        state.activeDocId = doc.id;
        await persist.save(doc);
        toast(`${doc.name} is ready: ${doc.pageCount} ${doc.pageLabel.toLowerCase()}${doc.pageCount === 1 ? '' : 's'}, ${num(doc.chunks.length)} passages.`);
      } catch (err) {
        toast(`${file.name}: ${err.message}`, 'error');
      }
    }
    renderAll();
  }

  /* ---------- Retrieval ---------- */
  const tokenize = (text) => (String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  function buildCorpus() {
    const docs = state.scope === 'all' ? state.docs : [activeDoc()].filter(Boolean);
    return docs.flatMap((d) => d.chunks.map((c) => ({
      id: c.id,
      docId: d.id,
      docName: d.name,
      label: `${d.pageLabel} ${c.page}`,
      page: c.page,
      text: c.text,
    })));
  }

  /** BM25 ranking of passages for a free-text query. */
  function retrieve(query, corpus, k) {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !corpus.length) return [];
    const k1 = 1.4;
    const b = 0.75;
    const docs = corpus.map((c) => {
      const tokens = tokenize(c.text);
      const tf = new Map();
      tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      return { c, tf, len: tokens.length };
    });
    const N = docs.length;
    const avgLen = sum(docs.map((d) => d.len)) / N || 1;
    const df = new Map(terms.map((t) => [t, docs.filter((d) => d.tf.has(t)).length]));
    return docs
      .map((d) => {
        let score = 0;
        terms.forEach((t) => {
          const f = d.tf.get(t) || 0;
          if (!f) return;
          const n = df.get(t);
          const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
          score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
        });
        return { c: d.c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.c);
  }

  /** The most information-dense passages, returned in document order. */
  function summaryPassages(corpus, k) {
    if (!corpus.length) return [];
    const sets = corpus.map((c) => new Set(tokenize(c.text)));
    const df = new Map();
    sets.forEach((set) => set.forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
    const N = corpus.length;
    const scored = corpus.map((c, i) => {
      const toks = [...sets[i]];
      const score = toks.length ? sum(toks.map((t) => Math.log(1 + N / df.get(t)))) / Math.sqrt(toks.length + 1) : 0;
      return { c, i, score };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.c);
  }

  /** Passages with the most dates, amounts and figures. */
  function numberPassages(corpus, k) {
    const withCounts = corpus
      .map((c, i) => ({ c, i, n: (c.text.match(/\d+([.,:/-]\d+)*/g) || []).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, k)
      .sort((a, b) => a.i - b.i);
    return withCounts.map((x) => x.c);
  }

  const CONCLUSION_QUERY = 'conclusion conclusions recommendation recommendations result results findings summary';

  /* ---------- Answers ---------- */
  function localAnswer(question, corpus, kind) {
    if (kind === 'summary') {
      const hits = summaryPassages(corpus, 4);
      return { text: 'The most informative passages, in document order:', citations: hits, inline: false, meta: 'Local search' };
    }
    if (kind === 'numbers') {
      const hits = numberPassages(corpus, 5);
      return { text: hits.length ? 'Passages with dates and figures:' : 'No dates or figures were found in these documents.', citations: hits, inline: false, meta: 'Local search' };
    }
    if (kind === 'conclusions') {
      const hits = retrieve(CONCLUSION_QUERY, corpus, 3);
      const fallback = hits.length ? hits : summaryPassages(corpus, 3);
      return { text: 'Passages that look like conclusions or recommendations:', citations: fallback, inline: false, meta: 'Local search' };
    }
    const hits = retrieve(question, corpus, 3);
    if (!hits.length) {
      return {
        text: 'I could not find that in your documents. Try other keywords, or add a Claude API key in Settings for broader answers.',
        citations: [],
        inline: false,
        meta: 'Local search',
      };
    }
    return {
      text: hits.length === 1 ? 'The most relevant passage is:' : `The ${hits.length} most relevant passages are:`,
      citations: hits,
      inline: false,
      meta: 'Local search',
    };
  }

  async function claudeAnswer(question, corpus, kind) {
    let hits;
    let prompt = question;
    if (kind === 'summary') hits = summaryPassages(corpus, 8);
    else if (kind === 'numbers') hits = numberPassages(corpus, 8);
    else if (kind === 'conclusions') hits = retrieve(CONCLUSION_QUERY, corpus, 6);
    else hits = retrieve(question, corpus, 6);
    if (!hits.length) {
      return { text: 'The documents in scope do not contain relevant passages for that question.', citations: [], inline: false, meta: 'Claude' };
    }
    const context = hits.map((c, i) => `[${i + 1}] ${c.docName}, ${c.label}\n${c.text}`).join('\n\n');
    prompt = `Excerpts:\n\n${context}\n\nQuestion: ${prompt}`;
    const text = await window.AI.ask({
      apiKey: ai.apiKey,
      model: ai.model || DEFAULT_MODEL,
      system: SYSTEM,
      prompt,
      maxTokens: 800,
    });
    return { text, citations: hits, inline: true, meta: `Claude · ${modelName()}` };
  }

  async function ask(label, kind = null) {
    if (state.busy) return;
    const corpus = buildCorpus();
    if (!corpus.length) {
      toast(state.docs.length ? 'Pick a document, or switch the scope to “All docs”.' : 'Upload a document first.', 'warning');
      return;
    }
    const pending = { role: 'assistant', text: '', citations: [], pending: true };
    state.messages.push({ role: 'user', text: label });
    state.messages.push(pending);
    state.asked += 1;
    state.busy = true;
    renderChat();
    try {
      const question = kind ? QUICK[kind].question : label;
      const result = ai.apiKey ? await claudeAnswer(question, corpus, kind) : localAnswer(label, corpus, kind);
      Object.assign(pending, result, { pending: false });
    } catch (err) {
      Object.assign(pending, { text: `Could not get an answer: ${err.message}`, citations: [], pending: false, meta: 'Error' });
    }
    state.busy = false;
    renderChat();
  }

  /* ---------- Rendering helpers ---------- */
  const statCard = (label, value, foot, iconName) => `
    <article class="card stat">
      <div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon(iconName)}</span></div>
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-foot"><span>${esc(foot)}</span></div>
    </article>`;

  const fileTile = (doc) => `<span class="file-tile ${doc.ext === 'PDF' ? 'pdf' : ''}">${esc(doc.ext.slice(0, 4))}</span>`;
  const docMeta = (doc) => `${num(doc.pageCount)} ${doc.pageLabel.toLowerCase()}${doc.pageCount === 1 ? '' : 's'} · ${num(doc.wordCount)} words`;

  /* ---------- Views ---------- */
  function renderStorage() {
    const n = state.docs.length;
    $('#storage-docs').textContent = `${n} document${n === 1 ? '' : 's'}`;
  }

  function renderDashboard() {
    const docs = state.docs;
    const pages = sum(docs.map((d) => d.pageCount));
    const passages = sum(docs.map((d) => d.chunks.length));
    const words = sum(docs.map((d) => d.wordCount));
    $('#dash-stats').innerHTML = [
      statCard('Documents', num(docs.length), `${num(words)} words in total`, 'file'),
      statCard('Pages read', num(pages), 'Extracted from your files', 'book'),
      statCard('Passages indexed', num(passages), 'Searchable units with citations', 'layers'),
      statCard('Questions asked', num(state.asked), state.asked ? 'This session' : 'Ask in “Ask & read”', 'sparkle'),
    ].join('');

    const rows = filteredDocs().slice().sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    $('#dash-docs').innerHTML = `
      <div class="card-head">
        <div>
          <h3>Library</h3>
          <div class="card-sub">${num(rows.length)} of ${num(docs.length)} documents</div>
        </div>
        <button type="button" class="btn sm primary" data-action="upload"><span data-icon="upload"></span>Upload</button>
      </div>
      <div class="table-wrap">
        ${rows.length ? `
          <table class="table">
            <thead>
              <tr><th>Document</th><th>Type</th><th class="num">Pages</th><th class="num hide-md">Words</th><th class="hide-md">Uploaded</th><th>Status</th><th class="actions"></th></tr>
            </thead>
            <tbody>
              ${rows.map((d) => `
                <tr class="clickable" data-open-doc="${esc(d.id)}">
                  <td>
                    <div class="doc-cell">
                      ${fileTile(d)}
                      <div><strong>${esc(d.name)}</strong><small>${esc(formatBytes(d.size))}</small></div>
                    </div>
                  </td>
                  <td>${esc(d.ext)}</td>
                  <td class="num">${num(d.pageCount)}</td>
                  <td class="num hide-md">${num(d.wordCount)}</td>
                  <td class="hide-md">${esc(fmtDate(d.uploadedAt.slice(0, 10), true))}</td>
                  <td>${badge('Indexed', 'success')}</td>
                  <td class="actions">
                    <button type="button" class="btn sm" data-action="open-doc" data-id="${esc(d.id)}">Open</button>
                    <button type="button" class="icon-btn sm danger" data-action="delete-doc" data-id="${esc(d.id)}" aria-label="Delete document">${icon('trash')}</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : emptyState('file', docs.length ? 'No documents match' : 'No documents yet',
          docs.length ? 'Clear the filter to see everything.' : 'Upload a PDF or text file to start asking questions.')}
      </div>`;
  }

  function renderDocList() {
    const docs = filteredDocs();
    $('#doc-list').innerHTML = docs.length ? docs.map((d) => `
      <button type="button" class="doc-item ${d.id === state.activeDocId ? 'active' : ''}" data-doc="${esc(d.id)}">
        ${fileTile(d)}
        <span style="min-width: 0;"><strong>${esc(d.name)}</strong><small>${esc(docMeta(d))}</small></span>
      </button>`).join('')
      : `<p class="muted small" style="padding: 10px;">${state.docs.length ? 'No documents match the filter.' : 'No documents yet. Upload one to begin.'}</p>`;
  }

  function renderViewer() {
    const host = $('#viewer');
    const doc = activeDoc();
    if (!doc) {
      host.innerHTML = `<div class="viewer-empty">${emptyState('file', 'No document open', 'Pick one from the list, or upload a new file.',
        '<button type="button" class="btn primary" data-action="upload"><span data-icon="upload"></span>Upload</button>')}</div>`;
      return;
    }
    const byPage = new Map();
    doc.chunks.forEach((c) => {
      if (!byPage.has(c.page)) byPage.set(c.page, []);
      byPage.get(c.page).push(c);
    });
    const pageNumbers = Array.from({ length: doc.pageCount }, (_, i) => i + 1);
    host.innerHTML = `
      <header class="viewer-head">
        <h2>${esc(doc.name)}</h2>
        <div class="meta-row">
          <span class="meta-chip">${icon('file')}${esc(doc.ext)} · ${esc(formatBytes(doc.size))}</span>
          <span class="meta-chip">${icon('calendar')}Uploaded ${esc(fmtDate(doc.uploadedAt.slice(0, 10), true))}</span>
        </div>
        <div class="stats-strip">
          <div><strong>${num(doc.pageCount)}</strong><small>${esc(doc.pageLabel)}s processed</small></div>
          <div><strong>${num(doc.wordCount)}</strong><small>Words</small></div>
          <div><strong>${num(doc.chunks.length)}</strong><small>Passages indexed</small></div>
          <div><strong>Ready</strong><small>Search status</small></div>
        </div>
      </header>
      <div class="pages">
        ${pageNumbers.map((n) => {
          const chunks = byPage.get(n) || [];
          return `
            <div class="page-block">
              <div class="page-label">${esc(doc.pageLabel)} ${n}</div>
              ${chunks.length ? chunks.map((c) => `<div class="chunk" id="chunk-${esc(c.id)}">${esc(c.text)}</div>`).join('')
    : '<div class="muted small">No selectable text on this page.</div>'}
            </div>`;
        }).join('')}
      </div>`;
  }

  function renderMessage(m) {
    if (m.role === 'user') return `<div class="msg user"><div class="bubble">${esc(m.text)}</div></div>`;
    if (m.pending) return `<div class="msg assistant"><div class="bubble"><span class="thinking"><i></i><i></i><i></i></span></div></div>`;
    let body = esc(m.text);
    if (m.inline) {
      body = body.replace(/\[(\d+)\]/g, (match, n) => {
        const c = m.citations[Number(n) - 1];
        return c ? `<button type="button" class="cite" data-chunk="${esc(c.id)}">[${n}]</button>` : match;
      });
    }
    const cites = m.citations.length ? `
      <div class="citations">
        ${m.citations.map((c, i) => `
          <button type="button" class="citation" data-chunk="${esc(c.id)}">
            <span class="citation-head"><span class="citation-num">${i + 1}</span>${esc(c.docName)} · ${esc(c.label)}</span>
            <p>${esc(c.text)}</p>
          </button>`).join('')}
      </div>` : '';
    return `<div class="msg assistant"><div class="bubble">${body}</div>${cites}${m.meta ? `<div class="msg-meta">${esc(m.meta)}</div>` : ''}</div>`;
  }

  function renderChat() {
    $('#chat-mode').textContent = ai.apiKey
      ? `Answers by Claude (${modelName()}), with citations`
      : 'Local search · add a Claude key in Settings for fluent answers';
    $$('#scope [data-scope]').forEach((b) => b.classList.toggle('on', b.dataset.scope === state.scope));
    const log = $('#chat-log');
    if (!state.messages.length) {
      log.innerHTML = emptyState('sparkle', state.docs.length ? 'Ask your first question' : 'Upload a document to start',
        state.docs.length ? 'Try “Summarize”, or ask about a name, a date or a figure. Click any citation to jump to the source.' : 'PDF, TXT, MD, CSV and JSON files are read entirely in this browser.');
      return;
    }
    log.innerHTML = state.messages.map(renderMessage).join('');
    log.scrollTop = log.scrollHeight;
  }

  function renderSettings() {
    $('#ai-key').placeholder = ai.apiKey ? 'A key is saved in this browser' : 'sk-ant-…';
    $('#ai-model').value = ai.model || DEFAULT_MODEL;
  }

  function renderWorkspace() {
    renderDocList();
    renderViewer();
    renderChat();
  }

  function renderAll() {
    renderStorage();
    if (state.view === 'dashboard') renderDashboard();
    if (state.view === 'workspace') renderWorkspace();
    if (state.view === 'settings') renderSettings();
    if (state.view !== 'workspace') renderDocList();
  }

  /* ---------- Actions ---------- */
  function setActive(id) {
    state.activeDocId = id;
    renderDocList();
    renderViewer();
  }

  function focusChunk(chunkId) {
    const doc = state.docs.find((d) => d.chunks.some((c) => c.id === chunkId));
    if (!doc) return;
    if (doc.id !== state.activeDocId) setActive(doc.id);
    const el = document.getElementById(`chunk-${chunkId}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1800);
  }

  function openChunk(chunkId) {
    if (state.view !== 'workspace') {
      router.go('workspace');
      setTimeout(() => focusChunk(chunkId), 150);
    } else {
      focusChunk(chunkId);
    }
  }

  async function deleteDoc(id) {
    const doc = state.docs.find((d) => d.id === id);
    if (!doc) return;
    const ok = await confirmDialog({
      title: 'Delete document?',
      message: `“${doc.name}” and its search index will be removed from this browser.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    state.docs = state.docs.filter((d) => d.id !== id);
    if (state.activeDocId === id) state.activeDocId = state.docs[0] ? state.docs[0].id : null;
    await persist.remove(id);
    toast('Document deleted');
    renderAll();
  }

  async function deleteAll() {
    if (!state.docs.length) { toast('There are no documents to delete.', 'warning'); return; }
    const ok = await confirmDialog({
      title: 'Delete all documents?',
      message: 'Every document, its extracted text and its search index will be removed from this browser.',
      confirmLabel: 'Delete all',
    });
    if (!ok) return;
    state.docs = [];
    state.activeDocId = null;
    state.messages = [];
    await persist.clear();
    toast('All documents deleted');
    renderAll();
  }

  function handleAction(action, id) {
    switch (action) {
      case 'upload': return $('#file-input').click();
      case 'open-doc': setActive(id); router.go('workspace'); return;
      case 'delete-doc': return deleteDoc(id);
      case 'delete-all': return deleteAll();
      default: return undefined;
    }
  }

  /* ---------- Events ---------- */
  document.addEventListener('click', (e) => {
    const cite = e.target.closest('[data-chunk]');
    if (cite) { openChunk(cite.dataset.chunk); return; }
    const prompt = e.target.closest('[data-prompt]');
    if (prompt) { const kind = prompt.dataset.prompt; ask(QUICK[kind].label, kind); return; }
    const scope = e.target.closest('#scope [data-scope]');
    if (scope) { state.scope = scope.dataset.scope; renderChat(); return; }
    const docItem = e.target.closest('[data-doc]');
    if (docItem) { setActive(docItem.dataset.doc); return; }
    const row = e.target.closest('[data-open-doc]');
    if (row && !e.target.closest('button')) { setActive(row.dataset.openDoc); router.go('workspace'); return; }
    const action = e.target.closest('[data-action]');
    if (action) handleAction(action.dataset.action, action.dataset.id);
  });

  const fileInput = $('#file-input');
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  });

  const dropzone = $('#dropzone');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (type === 'drop') handleFiles(e.dataTransfer.files);
  }));

  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const box = $('#question');
    const question = box.value.trim();
    if (!question) return;
    box.value = '';
    ask(question);
  });
  $('#question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#composer').requestSubmit();
    }
  });

  $('#ai-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('#ai-key').value.trim();
    if (key && !/^sk-/.test(key)) { toast('That does not look like a Claude API key.', 'error'); return; }
    ai = { apiKey: key || ai.apiKey || '', model: $('#ai-model').value };
    saveAI(ai);
    $('#ai-key').value = '';
    renderSettings();
    renderChat();
    toast('Answer engine settings saved');
  });
  $('#ai-clear').addEventListener('click', () => {
    ai = { apiKey: '', model: ai.model || DEFAULT_MODEL };
    saveAI(ai);
    renderSettings();
    renderChat();
    toast('API key removed');
  });

  const search = $('#global-search');
  search.addEventListener('input', (e) => {
    state.filter = e.target.value;
    if (state.view === 'dashboard') renderDashboard();
    else renderDocList();
  });

  /* ---------- Boot ---------- */
  initTheme({ button: $('[data-theme-toggle]'), fallback: 'dark' });
  initShell();

  let router = null;
  persist.load().then((docs) => {
    state.docs = docs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    state.activeDocId = state.docs[0] ? state.docs[0].id : null;
    router = initRouter(['dashboard', 'workspace', 'settings'], (view) => {
      state.view = view;
      renderAll();
    });
  });
});
