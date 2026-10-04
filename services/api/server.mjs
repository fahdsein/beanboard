import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createOrder, publicState, seedOrders, seedRoasts, cleanText } from "../../lib/core.mjs";
import { loadOrders, saveOrder, updateOrderStatus, openDatabase } from "../../lib/database.mjs";
import { openQueue, publishOrder } from "../../lib/queue.mjs";
import { ensureBucket, storeReceipt } from "../../lib/storage.mjs";

const port = Number(process.env.PORT || 3000);
const startedAt = Date.now();
const roasts = structuredClone(seedRoasts);
let orders = await loadOrders(structuredClone(seedOrders)).catch((error) => {
  console.warn(`Database unavailable at startup; using memory: ${error.message}`);
  return structuredClone(seedOrders);
});
const events = [{ time: new Date().toISOString(), type: "system", message: "BeanBoard API started" }];
let queue;

function safeEqual(actual, expected) {
  const a = Buffer.from(actual || ""); const b = Buffer.from(expected || "");
  return a.length === b.length && timingSafeEqual(a, b);
}
function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const accepted = [process.env.ADMIN_TOKEN, process.env.WORKER_TOKEN].filter(Boolean);
  return !accepted.length || accepted.some((expected) => safeEqual(supplied, expected));
}
function addEvent(type, message, details = {}) {
  events.unshift({ time: new Date().toISOString(), type, message: cleanText(message, 220), details });
  events.length = Math.min(events.length, 100);
}
function cors(request) {
  const allowed = process.env.CORS_ORIGIN;
  const origin = request.headers.origin;
  return { "Access-Control-Allow-Origin": !allowed ? "*" : origin === allowed ? origin : "null", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", Vary: "Origin" };
}
function send(request, response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cors(request) });
  response.end(JSON.stringify(data));
}
async function body(request) {
  let raw = "";
  for await (const chunk of request) { raw += chunk; if (raw.length > 32_768) throw new Error("Request body is too large"); }
  return raw ? JSON.parse(raw) : {};
}
async function getQueue() {
  if (!process.env.NATS_URL) return null;
  queue ||= await openQueue("beanboard-api");
  return queue;
}
async function probes() {
  const result = { database: "not_configured", queue: "not_configured", storage: "not_configured" };
  try { const db = await openDatabase(); if (db) { await db.query("SELECT 1"); result.database = "ready"; } } catch { result.database = "unavailable"; }
  try { if (process.env.NATS_URL) { await getQueue(); result.queue = "ready"; } } catch { result.queue = "unavailable"; }
  try { if (process.env.S3_ENDPOINT) { await ensureBucket(); result.storage = "ready"; } } catch { result.storage = "unavailable"; }
  return result;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  try {
    if (request.method === "OPTIONS") return send(request, response, 204, {});
    if (request.method === "GET" && url.pathname === "/") return send(request, response, 200, {
      name: "BeanBoard API",
      status: "ok",
      health: "/health",
      readiness: "/ready"
    });
    if (request.method === "GET" && url.pathname === "/health") return send(request, response, 200, { status: "ok", service: "beanboard-api" });
    if (request.method === "GET" && url.pathname === "/ready") {
      const dependencies = await probes();
      const ok = !Object.values(dependencies).includes("unavailable");
      return send(request, response, ok ? 200 : 503, { status: ok ? "ready" : "degraded", dependencies });
    }
    if (request.method === "GET" && url.pathname === "/api/state") return send(request, response, 200, publicState(orders, roasts, events));
    if (request.method === "GET" && url.pathname === "/api/summary") return send(request, response, 200, { uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), ...(await probes()), activeOrders: orders.filter((item) => !["ready", "completed", "cancelled"].includes(item.status)).length });

    if (request.method === "POST" && url.pathname === "/api/orders") {
      const order = createOrder(await body(request));
      orders.unshift(order); await saveOrder(order).catch((error) => addEvent("warning", `Database save delayed: ${error.message}`));
      const acknowledgement = await publishOrder(await getQueue(), order).catch((error) => { addEvent("warning", `Queue publish unavailable: ${error.message}`); return null; });
      addEvent("order", `${order.customer} joined the queue`, { orderId: order.id });
      return send(request, response, 201, { order, queued: Boolean(acknowledgement) });
    }
    const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (request.method === "PATCH" && orderMatch) {
      if (!authorized(request)) return send(request, response, 401, { error: "unauthorized" });
      const input = await body(request); const status = cleanText(input.status, 20);
      if (!["queued", "brewing", "ready", "completed", "cancelled"].includes(status)) return send(request, response, 400, { error: "invalid_status" });
      const order = orders.find((item) => item.id === decodeURIComponent(orderMatch[1]));
      if (!order) return send(request, response, 404, { error: "order_not_found" });
      order.status = status; await updateOrderStatus(order.id, status);
      let receipt = null; if (status === "completed") receipt = await storeReceipt(order).catch((error) => { addEvent("warning", `Receipt storage failed: ${error.message}`); return null; });
      addEvent("order", `${order.id} marked ${status}`, { orderId: order.id, receipt });
      return send(request, response, 200, { order, receipt });
    }
    const roastMatch = url.pathname.match(/^\/api\/roasts\/([^/]+)$/);
    if (request.method === "PATCH" && roastMatch) {
      if (!authorized(request)) return send(request, response, 401, { error: "unauthorized" });
      const roast = roasts.find((item) => item.id === decodeURIComponent(roastMatch[1]));
      if (!roast) return send(request, response, 404, { error: "roast_not_found" });
      const input = await body(request); roast.stock = cleanText(input.stock, 30) || roast.stock;
      addEvent("inventory", `${roast.name} stock changed to ${roast.stock}`);
      return send(request, response, 200, { roast });
    }
    if (request.method === "POST" && url.pathname === "/api/events") {
      if (!authorized(request)) return send(request, response, 401, { error: "unauthorized" });
      const input = await body(request); addEvent(input.type || "service", input.message || "Service event", input.details || {});
      return send(request, response, 201, { accepted: true });
    }
    return send(request, response, 404, { error: "not_found" });
  } catch (error) {
    console.error(error); return send(request, response, 400, { error: cleanText(error.message, 200) });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`BeanBoard API listening on ${port}`));
function shutdown() { server.close(async () => { await queue?.nc?.drain().catch(() => {}); process.exit(0); }); }
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
