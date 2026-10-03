# BeanBoard for NEO App

BeanBoard is a complete café queue and roast-board demo designed to exercise every NEO App component type. The customer-facing display is fully responsive; customers can place orders, baristas can update them, and the dashboard refreshes live service state.

## Components

| NEO App type | BeanBoard role | Dockerfile / binding |
|---|---|---|
| Static Site | Customer display and barista control | `services/static/Dockerfile` |
| Web Service | REST API, health checks, queue and inventory state | `services/api/Dockerfile` |
| Worker | Consumes orders and moves them from queued → brewing → ready | `services/worker/Dockerfile` |
| Cron | Sends a scheduled café summary event | `services/cron/Dockerfile` |
| NEO DB | Persists orders in PostgreSQL | Bind `DATABASE_URL` to Web Service |
| NEO Queue | NATS JetStream order delivery | Bind the same queue to Web Service and Worker |
| Object Storage | Stores completed-order JSON receipts | Bind S3-compatible variables to Web Service |

All containers use the repository root as their Docker build context. Health endpoints are `/health` and `/ready`; the API listens on port `3000` and the static site on `8080`.

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

## NEO App deployment order

1. Create a **NEO DB**, a **NEO Queue**, and an **Object Storage** resource.
2. Deploy the **Web Service** with `services/api/Dockerfile`, port `3000`, health path `/health`, and readiness path `/ready`.
3. Bind all three managed resources to the Web Service and map the environment variables below.
4. Deploy the **Worker** with `services/worker/Dockerfile`; bind the same queue and set `API_URL` to the Web Service URL.
5. Create the **Cron** using `services/cron/Dockerfile`. Run it on the desired NEO schedule; its container executes once and exits successfully.
6. Deploy the **Static Site** with `services/static/Dockerfile`, port `8080`, and health path `/health`.
7. Set `CORS_ORIGIN` on the Web Service to the exact Static Site origin, then redeploy the Web Service.
8. Set the display's API URL before deploying by editing `services/static/public/config.js`, or open it with `?api=https://your-api.example` for a temporary test.

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

Use strong, different values for `ADMIN_TOKEN` and `WORKER_TOKEN` in NEO. Never place credentials in the Static Site configuration.

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
