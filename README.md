# BeanBoard on NEO App — Beginner Deployment Guide

BeanBoard is a complete café queue and roast-board demo designed to exercise every NEO App component type. The customer-facing display is fully responsive; customers can place orders, baristas can update them, and the dashboard refreshes live service state.

## Components

| NEO App type | BeanBoard role | Dockerfile / binding |
|---|---|---|
| Static Site | Customer display and barista control | `Dockerfile.static` |
| Web Service | REST API, health checks, queue and inventory state | `Dockerfile` |
| Worker | Consumes orders and moves them from queued → brewing → ready | `Dockerfile.worker` |
| Cron | Sends a scheduled café summary event | `Dockerfile.cron` |
| NEO DB | Persists orders in PostgreSQL | Bind `DATABASE_URL` to Web Service |
| NEO Queue | NATS JetStream order delivery | Bind the same queue to Web Service and Worker |
| Object Storage | Stores completed-order JSON receipts | Bind S3-compatible variables to Web Service |

All containers use the repository root as their Docker build context. Root-level Dockerfiles are intentional: they avoid nested-Dockerfile path loss in deployment portals. Health endpoints are `/`, `/health`, and `/ready`; the API listens on port `3000` and the static site on `8080`.

## Local run

```powershell
Set-Location 'demo-example\beanboard'
Copy-Item .env.example .env
npm install
npm test
npm run validate
docker compose up --build
```

The local Cron container performs one report and exits. Seeing that container in an exited-success state is expected; Docker Compose does not provide the repeating schedule that NEO/Kubernetes CronJob provides.

Open `http://localhost:8080`. The local display automatically uses `http://localhost:3000`. The local S3-compatible development endpoint is exposed at `http://localhost:9001`.

## Beginner deployment guide

Deploy the components in this order. Wait until each step is ready before continuing.

### Step 1 — Create the managed resources

In one NEO App project, create:

1. **NEO DB / PostgreSQL** for orders.
2. **NEO Queue / NATS JetStream** for order delivery.
3. **Object Storage** for completed-order receipts.

Prepare two different strong random values. Enter them as protected variables in NEO; never commit them to Git:

```env
ADMIN_TOKEN=<protects-barista-actions>
WORKER_TOKEN=<shared-by-web-worker-and-cron>
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

Attach NEO DB as `DATABASE_URL`, NEO Queue as `NATS_URL`, and add the Web Service variables from `neoapp.env.example`. Add the Object Storage connection as protected `S3_*` variables.

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

### Step 4 — Deploy the Scheduled Job / Cron

Create a **Scheduled Job / Cron** from the same repository. NEO wraps this component in a Kubernetes CronJob. Do not deploy it as a Web Service.

| NEO field | Value |
|---|---|
| Build method | Build File / Dockerfile |
| Dockerfile | `Dockerfile.cron` |
| Start command | Leave empty |
| Port, domain, health path | None |
| Test schedule | `*/5 * * * *` |
| Time zone, if available | `Asia/Bangkok` |

If the Start Command field is required, use:

```text
node services/cron/cron.mjs
```

Add only:

```env
API_URL=https://<your-web-service-domain>
WORKER_TOKEN=<same-value-as-the-Web-Service>
```

Do not attach NEO DB, Queue, or Object Storage to the Scheduled Job. It calls the Web Service, which owns those connections. Do not add `CRON_INTERVAL_MS`; NEO/Kubernetes owns the schedule.

If NEO exposes advanced CronJob settings, use:

| Setting | Recommended value |
|---|---|
| Concurrency policy | `Forbid` |
| Retry / backoff limit | `2` |
| Active deadline | `120` seconds |
| Successful history | `3` |
| Failed history | `3` |

Use **Run now** if available, or wait for the schedule. A successful run prints `BeanBoard scheduled report accepted` and finishes as **Succeeded**. A configuration, authentication, HTTP, or timeout error exits non-zero so Kubernetes can mark the Job **Failed** and apply its retry policy.

After testing, change the schedule if needed. Daily at midnight is:

```text
0 0 * * *
```

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
| `WORKER_TOKEN` | Web Service, Worker, Cron | Authenticates service-to-service updates |
| `DATABASE_URL` | Web Service | NEO DB PostgreSQL connection string |
| `DATABASE_AUTO_MIGRATE=true` | Web Service | Creates the BeanBoard order table; enable only for this demo database |
| `NATS_URL`, `NATS_STREAM`, `NATS_SUBJECT`, `NATS_CONSUMER` | Web Service + Worker | NEO Queue connection and resource names |
| `NATS_TOKEN` or `NATS_USER` / `NATS_PASSWORD` | Web Service + Worker | Queue credentials supplied by the binding |
| `NATS_MANAGE_RESOURCES=false` | Web Service + Worker | Keep false for NEO-managed streams; local Compose uses true |
| `API_URL` | Worker + Cron | Web Service base URL |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | Web Service | Object Storage target |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Web Service | Object Storage credentials |
| `S3_FORCE_PATH_STYLE` | Web Service | Use the value required by the storage binding |
| `BEANBOARD_API_URL` | Static Site | Public BeanBoard Web Service URL written into `config.js` at container startup |

Use strong, different values for `ADMIN_TOKEN` and `WORKER_TOKEN` in NEO. Never place credentials in the Static Site configuration. Start from `neoapp.env.example`, but enter protected values directly in NeoApp rather than committing them.

## API surface

- `GET /health` — liveness
- `GET /ready` — dependency readiness for DB, queue, and storage
- `GET /api/state` — public display state
- `POST /api/orders` — place an order
- `PATCH /api/orders/:id` — protected barista/worker status update
- `PATCH /api/roasts/:id` — protected inventory update
- `GET /api/summary` — service summary for Cron
- `POST /api/events` — protected worker/Cron event ingestion

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
