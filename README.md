# BeanBoard on NEO App — Beginner Deployment Guide

BeanBoard is a complete café queue and roast-board demo designed to exercise every NEO App component type. The customer-facing display is fully responsive; customers can place orders, baristas can update them, and the dashboard refreshes live service state.

## Components

| NEO App type | BeanBoard role | Dockerfile / binding |
|---|---|---|
| Static Site | Customer display and barista control | `Dockerfile.static` |
| Web Service | REST API, health checks, queue and inventory state | `Dockerfile` |
| Worker | Consumes orders and moves them from queued → brewing → ready | `Dockerfile.worker` |
| Scheduled Job | Calls the Web Service on a schedule | HTTP `POST` to `/api/cron/daily-summary` |
| NEO DB | Persists orders in PostgreSQL | Bind `DATABASE_URL` to Web Service |
| NEO Queue | NATS JetStream order delivery | Bind the same queue to Web Service and Worker |
| Object Storage | Stores completed-order JSON receipts | Bind S3-compatible variables to Web Service |

The Scheduled Job is different from the other applications: NEO does not build it from this repository. NEO runs `curl` on a Kubernetes CronJob schedule and calls a protected endpoint on the BeanBoard Web Service.

## Local run

```powershell
Set-Location 'demo-example\beanboard'
Copy-Item .env.example .env
npm install
npm test
npm run validate
docker compose up --build
```

Open `http://localhost:8080`. The local display automatically uses `http://localhost:3000`. The local S3-compatible development endpoint is exposed at `http://localhost:9001`.

## Beginner deployment guide

Deploy the components in this order. Wait until each step is ready before continuing.

### Step 1 — Create the managed resources

In one NEO App project, create:

1. **NEO DB / PostgreSQL** for orders.
2. **NEO Queue / NATS JetStream** for order delivery.
3. **Object Storage** for completed-order receipts.

Prepare three different strong random values. Enter them as protected variables in NEO; never commit them to Git:

```env
ADMIN_TOKEN=<protects-barista-actions>
WORKER_TOKEN=<protects-worker-calls>
CRON_TOKEN=<protects-scheduled-job-calls>
```

### Step 2 — Deploy the Web Service

Create a **Web Service** from this repository:

| NEO field | Value |
|---|---|
| Build method | Build File / Dockerfile |
| Dockerfile | `Dockerfile` |
| Start command | Leave empty |
| Container port | `3000` |
| Health path | `/health` |
| Readiness path | `/ready` if available |
| Public access | Enabled |
| Initial replicas | `1` |

Attach NEO DB as `DATABASE_URL`, NEO Queue as `NATS_URL`, and add the Web Service variables from `neoapp.env.example`. Add the Object Storage connection as protected `S3_*` variables. Add `ADMIN_TOKEN`, `WORKER_TOKEN`, and `CRON_TOKEN` as three different protected values.

Set `DATABASE_AUTO_MIGRATE=true` for this demo so the Web Service can create its table. After deployment:

1. Open `<web-service-url>/health`; it should return HTTP `200`.
2. Open `<web-service-url>/ready`; the dependencies should report ready.
3. Copy the base URL, for example `https://beanboard-api-example.app.biznetgio.dev`.

Use only the base URL for `API_URL`. Do not add `/api`, `/health`, or another path.

### Step 3 — Deploy the Worker

Create a **Worker** from the same repository:

| NEO field | Value |
|---|---|
| Dockerfile | `Dockerfile.worker` |
| Start command | Leave empty; if required, use `npm run worker` |
| Port, domain, health path | None |
| Initial replicas | `1` |

Attach the same NEO Queue and add:

```env
API_URL=https://<your-web-service-domain>
WORKER_TOKEN=<same-value-as-the-Web-Service>
NATS_URL=<attached-NEO-Queue>
NATS_STREAM=BEANBOARD_ORDERS
NATS_SUBJECT=beanboard.orders
NATS_CONSUMER=beanboard-baristas
NATS_MANAGE_RESOURCES=false
```

### Step 4 — Configure the HTTP Scheduled Job

Open **New → Scheduled Jobs** in NEO. This form does not use GitHub, a Dockerfile, a build command, or a Start Command. NEO's own CronJob container calls the BeanBoard Web Service with `curl`.

First use a five-minute test schedule:

| NEO field | Value |
|---|---|
| Scheduled Job name | `beanboard-daily-summary` |
| Run every N seconds | `0` |
| Schedule (cron) | `*/5 * * * *` |
| Timezone | `Asia/Jakarta` |
| Concurrency | `Forbid` |
| Timeout seconds | `60` |
| Run mode | `HTTP endpoint` |
| Endpoint URL | `https://<your-web-service-domain>/api/cron/daily-summary` |
| Method | `POST` |

Use the generated **Web Service** public domain in Endpoint URL—not the Static Site domain, GitHub URL, or NEO dashboard URL.

Add these request headers:

| Header name | Header value |
|---|---|
| `Authorization` | `Bearer <your-CRON_TOKEN>` |
| `Content-Type` | `application/json` |

The value after `Bearer ` must exactly match the protected `CRON_TOKEN` on the Web Service. If the form provides a request-body field, enter:

```json
{}
```

Do not attach NEO DB, Queue, or Object Storage to this Scheduled Job. It calls the Web Service, and the Web Service owns those connections.

Use **Run now** if available, or wait up to five minutes. A successful request returns HTTP `200` with `accepted: true`; the Scheduled Job should show **Succeeded**, and the Web Service logs should contain `BeanBoard scheduled report accepted`.

After the test succeeds, daily at midnight is:

```text
0 0 * * *
```

Keep `Run every N seconds` at `0` when using the cron expression. `Asia/Jakarta` is UTC+7 and matches Bangkok time.

Common failures:

| Result | Check |
|---|---|
| HTTP `401` | Header starts with `Bearer ` and its token matches `CRON_TOKEN` |
| HTTP `404` | Endpoint ends with `/api/cron/daily-summary` and the newest Web Service code is deployed |
| HTTP `503` with `cron_not_configured` | Add `CRON_TOKEN` to the Web Service and redeploy it |
| Timeout | Open the Web Service `/health` URL and confirm public networking works |

### Step 5 — Deploy the Static Site

Create a **Static Site** from the same repository:

| NEO field | Value |
|---|---|
| Dockerfile | `Dockerfile.static` |
| Port | `8080` |
| Health path | `/health` |
| Public access | Enabled |

Add `BEANBOARD_API_URL=https://<your-web-service-domain>`. Then set the Web Service's `CORS_ORIGIN` to the exact Static Site origin and redeploy the Web Service.

### Step 6 — Complete the end-to-end test

1. Open the Static Site and submit an order.
2. Confirm the Worker changes it from queued to brewing and then ready.
3. Confirm the Web Service `/ready` endpoint remains healthy.
4. Run the Scheduled Job and confirm it becomes **Succeeded**.
5. Check the Scheduled Job logs for `BeanBoard scheduled report accepted`.
6. Confirm the Cron event reaches the Web Service.

## Environment variables

| Variable | Component | Purpose |
|---|---|---|
| `PORT=3000` | Web Service | Public HTTP port |
| `CORS_ORIGIN` | Web Service | Exact Static Site origin |
| `ADMIN_TOKEN` | Web Service + browser operator | Protects barista updates; do not expose it in `config.js` |
| `WORKER_TOKEN` | Web Service + Worker | Authenticates Worker updates |
| `CRON_TOKEN` | Web Service + NEO request header | Authenticates the HTTP Scheduled Job |
| `DATABASE_URL` | Web Service | NEO DB PostgreSQL connection string |
| `DATABASE_AUTO_MIGRATE=true` | Web Service | Creates the BeanBoard order table; enable only for this demo database |
| `NATS_URL`, `NATS_STREAM`, `NATS_SUBJECT`, `NATS_CONSUMER` | Web Service + Worker | NEO Queue connection and resource names |
| `NATS_TOKEN` or `NATS_USER` / `NATS_PASSWORD` | Web Service + Worker | Queue credentials supplied by the binding |
| `NATS_MANAGE_RESOURCES=false` | Web Service + Worker | Keep false for NEO-managed streams; local Compose uses true |
| `API_URL` | Worker | Web Service base URL |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | Web Service | Object Storage target |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Web Service | Object Storage credentials |
| `S3_FORCE_PATH_STYLE` | Web Service | Use the value required by the storage binding |
| `BEANBOARD_API_URL` | Static Site | Public BeanBoard Web Service URL written into `config.js` at container startup |

Use strong, different values for `ADMIN_TOKEN`, `WORKER_TOKEN`, and `CRON_TOKEN`. Never place credentials in the Static Site configuration or Git. Start from `neoapp.env.example`, but enter protected values directly in NEO App.

## API surface

- `GET /health` — liveness
- `GET /ready` — dependency readiness for DB, queue, and storage
- `GET /api/state` — public display state
- `POST /api/orders` — place an order
- `PATCH /api/orders/:id` — protected barista/worker status update
- `PATCH /api/roasts/:id` — protected inventory update
- `GET /api/summary` — service summary for Cron
- `POST /api/cron/daily-summary` — protected one-request Scheduled Job action
- `POST /api/events` — protected Worker/service event ingestion

## Verification

```powershell
npm ci
npm test
npm run validate
docker compose config
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/ready
Invoke-RestMethod http://localhost:3000/api/state
```

For a static-only preview, open `services/static/public/index.html`; it will render the interface and show the API as offline until a Web Service URL is configured.
