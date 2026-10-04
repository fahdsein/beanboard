# BeanBoard for NEO App

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

Open `http://localhost:8080`. The local display automatically uses `http://localhost:3000`. The local S3-compatible development endpoint is exposed at `http://localhost:9001`.

## NEO App deployment order

1. Create a **NEO DB**, a **NEO Queue**, and an **Object Storage** resource.
2. Deploy the **Web Service** with root `Dockerfile`, port `3000`, health path `/health` (the default `/` also returns 200), and readiness path `/ready`.
3. Attach NEO DB as `DATABASE_URL` and NEO Queue as `NATS_URL`. Add the Web Service variables from `neoapp.env.example` individually after creation and verify their saved names before redeploying.
4. Add the Object Storage binding values as protected `S3_*` variables. Keep access and secret keys out of logs and screenshots.
5. Deploy the **Worker** with `Dockerfile.worker`; attach the same queue as `NATS_URL`, set `API_URL` to the Web Service URL, and use the same protected `WORKER_TOKEN`.
6. Create the **Cron** using `Dockerfile.cron`. Set `API_URL` and the same protected `WORKER_TOKEN`. Run it on the desired NEO schedule; its container executes once and exits successfully.
7. Deploy the **Static Site** with `Dockerfile.static`, port `8080`, health path `/health`, and `BEANBOARD_API_URL` set to the public Web Service URL. The container writes `config.js` safely at startup.
8. Set `CORS_ORIGIN` on the Web Service to the exact Static Site origin, then redeploy the Web Service.

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
