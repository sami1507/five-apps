# API reference

The backend exposes a small JSON API. Every app has its own document, stored on the server and validated on every write. Base URL: `http://localhost:3000` (set `PORT` to change it).

## Conventions

- Bodies and responses are JSON (`application/json; charset=utf-8`) unless noted.
- Dates are `YYYY-MM-DD`, date-times are `YYYY-MM-DDTHH:MM` in the server's local time. An empty string is allowed for optional dates.
- Records carry a string `id` (letters, digits, `-` and `_`, up to 80 characters).
- Errors use one shape:

```json
{
  "error": "Validation failed: 1 problem",
  "details": [{ "path": "ops[0].record.stock", "message": "must be between 0 and 10000000" }]
}
```

| Status | Meaning |
| ------ | ------- |
| 200 / 201 | Success |
| 400 | The body is not valid JSON, or the request is malformed |
| 404 | Unknown app or endpoint, or the app has no data yet |
| 405 | Wrong HTTP method for the endpoint |
| 409 | Conflict: the app is already initialised |
| 413 | Body or batch too large |
| 422 | Validation failed (field-level or business rule). Nothing was written |
| 500 | Unexpected error (logged on the server) |

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/health` | Liveness check: `{ status, time, apps }` |
| GET | `/api/apps` | The five apps and whether each one has data yet |
| GET | `/api/{app}/state` | The app's full document |
| POST | `/api/{app}/init` | Store the starting document (once) |
| POST | `/api/{app}/sync` | Apply a batch of changes atomically |
| POST | `/api/{app}/reset` | Delete the app's data |
| GET | `/api/{app}/summary` | Key figures computed on the server |
| GET | `/api/job-tracker/calendar.ics` | Calendar feed (follow-ups and upcoming interviews) |

`{app}` is one of `crm`, `inventory`, `job-tracker`, `finance`, `doc-assistant`.

### Changing data: `POST /api/{app}/sync`

A batch is a list of operations. The whole batch is validated and applied as one unit: if any operation fails, nothing is stored.

```json
{
  "ops": [
    { "op": "upsert", "collection": "contacts", "record": { "id": "c9", "name": "Grace Hopper", "company": "Navy", "email": "", "phone": "", "status": "Lead", "owner": "Sarah Lee", "source": "Referral", "createdAt": "2026-10-16" } },
    { "op": "delete", "collection": "activities", "id": "a4" },
    { "op": "setting", "key": "budgets", "value": { "Groceries": 450 } }
  ]
}
```

Response (200):

```json
{ "applied": 3, "upserted": 1, "deleted": 1, "settings": 1 }
```

- `upsert` creates the record, or replaces the record with the same `id`.
- `delete` removes a record by `id`. Deleting a record that does not exist is not an error.
- `setting` replaces a document-level setting (for example a map of budgets).

A batch holds at most 500 operations.

### Starting an app: `POST /api/{app}/init`

Send the app's full document. Unknown fields are rejected. Missing collections are stored as empty lists. Responds `201` with the stored document, or `409` if the app already has data.

### Resetting: `POST /api/{app}/reset`

Deletes the app's document. The next `state` request returns `404` until the app is initialised again. The browser apps do this from **Settings → Restore demo data**.

## Apps

### Pulse CRM (`crm`)

Collections: `contacts`, `deals`, `activities`.

Rules:
- A deal's `contactId` must refer to an existing contact, or be empty.
- Won and lost deals must have a `closedAt` date.
- Activities that name a `dealId` or `contactId` must refer to existing records.

Summary: `contacts`, `newContactsThisMonth`, `openDeals`, `openValue`, `weightedPipeline`, `wonDeals`, `wonValue`, `winRate`.

### Inventix (`inventory`)

Collections: `zones`, `products`, `orders`, `purchases`. Setting: `company`.

Rules:
- Stock is a whole number that cannot be negative. Quantities on orders and purchases must be positive.
- A product's `zoneId` must refer to an existing zone, or be empty.
- Active orders (pending, shipped, delivered) hold stock; cancelled and returned orders release it. The browser applies these movements; the server enforces the stock floor.

Summary: `products`, `lowStock`, `outOfStock`, `inventoryValue`, `activeOrders`, `activeRevenue`, `unitsSold`, `unitsReturned`, `ordersByStatus`.

### Hireboard (`job-tracker`)

Collections: `jobs`. Each job holds its `interviews` and `activity` timeline.

Rules:
- Every interview needs a date.
- Interview times use `HH:MM`.

Summary: `applications`, `active`, `applied`, `offers`, `followUpsDue` (due within three days, overdue included), `overdueFollowUps`, `upcomingInterviews`, `interviewRate`, `responseRate`.

Calendar feed: `GET /api/job-tracker/calendar.ics` returns a `text/calendar` file with one event per follow-up of an active application and one per interview not yet completed. It opens in Google Calendar, Outlook and Apple Calendar.

### Ledgerly (`finance`)

Collections: `accounts`, `transactions`. Setting: `budgets` (a map of expense category to monthly limit).

Rules:
- A transaction's `accountId` must refer to an existing account.
- The category must match the type: income categories for `income`, expense categories for `expense`.
- Budgets apply only to expense categories.

Summary: `income`, `expenses`, `net`, `savingsRate`, `netWorth`, `liquidCash`, `spentThisMonth`, `budgetsOverLimit`, `balances`.

### DocPilot (`doc-assistant`)

Collections: `documents`. Each document holds its extracted text as `chunks` (passages with page numbers).

Rules:
- Each document may hold at most 8,000,000 characters of text.
- Passages are limited to 20,000 characters each.

Summary: `documents`, `pages`, `passages`, `words`, `uploadedBytes`.

## Examples

```bash
# Health
curl http://localhost:3000/api/health

# Read the CRM document
curl http://localhost:3000/api/crm/state

# Ask for the finance summary
curl http://localhost:3000/api/finance/summary

# Download the calendar feed
curl -o hireboard.ics http://localhost:3000/api/job-tracker/calendar.ics

# Try an invalid change (returns 422 and changes nothing)
curl -X POST http://localhost:3000/api/inventory/sync \
  -H "Content-Type: application/json" \
  -d '{"ops":[{"op":"upsert","collection":"products","record":{"id":"p1","sku":"X","name":"X","category":"Fruits","price":1,"cost":1,"stock":-5,"reorder":1,"zoneId":""}}]}'
```
