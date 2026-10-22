# Architecture

This document explains how the five apps are put together and why. The short version: a dependency-free Node.js server stores each app's data as a validated JSON document; the browser apps are plain HTML, CSS and JavaScript that sync their changes to it.

## Components

```
┌──────────────────────────── browser ────────────────────────────┐
│  public/<app>/index.html + app.js        (the five apps)         │
│        │  UI.createStore(key, seed)                              │
│        ▼                                                         │
│  public/shared/ui.js      state API: get() / update() / reset()  │
│  public/shared/store.js   sync layer: load, diff, batch, retry   │
│        │  remote mode                  │ local mode (file:// or  │
│        ▼                               ▼  no server)             │
└────────┼───────────────────────────────────── localStorage ──────┘
         │ HTTP/JSON (same origin)
┌────────┼──────────────────────── server (Node.js, no deps) ───────┐
│  server/app.js         routing, static files, headers, logging    │
│  server/service.js     init / sync / reset / summary / feeds      │
│  server/schema.js      field-level validation (types, limits)     │
│  server/apps/*.js      per-app schema, business rules, summary    │
│  server/lib/*.js       calendar (.ics), dates, arithmetic         │
│  server/store.js       one JSON document per app, atomic writes   │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
                         data/<app>.json
```

## Request flow

1. **Startup.** `store.js` calls `GET /api/<app>/state`. If the server answers with the document, the app starts from it. If the server answers `404`, the app has no data yet: it seeds its sample data and sends it with `POST /init`. If nothing answers, the app switches to browser storage.
2. **A change.** The app mutates its in-memory copy through `store.update(fn)`. The store clones the data before and after, computes the difference (upserts, deletes and settings), and queues it. After 25 ms the queue is sent as one `POST /sync`. Batches are sent in order, so a slow response cannot overtake a later change.
3. **Validation.** The server applies the batch to a private copy of the document, validates the whole document against the app's schema, runs the app's business rules, and only then writes. Any failure returns `422` with the paths of the problems, and the stored file is untouched.
4. **Feedback.** A small badge in the sidebar shows *Saving…*, *All changes saved* or *Changes not saved*. Failures also raise a toast with the first problems.

## Why these choices

**No framework, no runtime dependencies.** The apps are small and the goal is to show the fundamentals. The server uses only `node:http`, `node:fs` and `node:test`, so there is nothing to install beyond Node.js 20 or newer.

**One JSON document per app.** Each app's data is a single object of collections and settings. Writing a document atomically (a temporary file renamed over the old one) is simple and safe; a crash never leaves half a file. The store keeps the document in memory and is the only code that touches the disk.

**Synchronous file operations.** Node runs JavaScript on one thread, and the store's reads and writes are synchronous. Two requests cannot interleave in the middle of a read-modify-write cycle, so no locks are needed.

**Validation on the server, always.** The browser validates for a good experience, but the server does not trust it. The schema DSL (`server/schema.js`) checks types, ranges, enums, dates (including impossible ones such as 30 February), email addresses, list lengths and duplicate ids. Unknown fields are dropped rather than stored.

**Business rules next to the data.** Some rules involve more than one record: a deal must point at a real contact, a transaction's category must match its type, budgets apply only to expense categories, a document may hold at most 8 million characters. Each app declares these in `invariants(doc)`, so they run on every write and are tested.

**Atomic batches.** A user action often changes several records (deleting a contact also unlinks its deals). The client sends them together, and the server applies them together, so the stored data is never left half-updated.

**Graceful fallback.** The same frontend works from the server, from a folder opened in the browser, or with no server at all. This matters for demos: the apps still run if the laptop has no Node.js.

## Security

- **Content Security Policy.** Scripts may come only from the app's own origin and from cdnjs (PDF.js). Inline scripts are not allowed, which is why registration and icon code live in external files. Frames may only be embedded from the same origin.
- **Headers.** `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`, and a restrictive `Permissions-Policy`.
- **Path traversal.** Static files are resolved inside the `public/` folder; requests that escape it get `403`. Tests cover encoded traversal attempts.
- **Input limits.** Bodies are limited to 30 MB, batches to 500 operations, and every text field has a maximum length.
- **Secrets.** The server stores no credentials. The optional Claude API key used by DocPilot and Ledgerly stays in the browser's local storage and is sent only to Anthropic, directly from the browser.
- **Error detail.** Validation errors describe the field; unexpected errors return a generic message and are logged on the server.

## Trade-offs and what I would change next

These are deliberate limits of a demo, and I would revisit them before a multi-user product:

- **Single user, no authentication.** Anyone who can reach the server can read and change the data. Adding sessions or OAuth is the first thing to do before exposing it.
- **Last write wins.** There are no version numbers, so two open tabs editing the same record can overwrite each other. Adding a `version` field and returning `409` on mismatch is a small change.
- **JSON file storage.** It is fine for one person's data, but a database (SQLite or PostgreSQL) would give indexes, concurrent writers and migrations.
- **Whole-document reads.** `GET /state` returns everything. Pagination and per-collection reads would matter with large datasets.
- **Browser-side search and extraction.** DocPilot extracts text in the browser and ranks passages there, so the server stores text but does not search it.

## Testing

`npm test` runs the Node.js test runner over three layers:

- **Unit tests** for validation (`schema.test.js`), persistence (`store.test.js`) and the calendar format (`calendar.test.js`).
- **Business-rule tests** (`services.test.js`) that exercise every app's invariants and summaries, plus batch atomicity and rollback.
- **HTTP tests** (`api.test.js`) that start the real server on a random port with a temporary data directory: initialise, sync, reject an invalid change, restart and confirm the data survived, reset, serve the frontend with its headers, and refuse traversal.
