import { openQueue, ensureQueue, decodeOrder } from "../../lib/queue.mjs";

const apiUrl = process.env.API_URL;
if (!apiUrl || !process.env.NATS_URL) throw new Error("API_URL and NATS_URL are required");
const queue = await openQueue(process.env.WORKER_NAME || "beanboard-worker");
await ensureQueue(queue);
const consumer = await queue.js.consumers.get(queue.config.stream, queue.config.consumer);
const messages = await consumer.consume({ max_messages: Number(process.env.WORKER_CONCURRENCY || 2) });

async function call(path, method, payload) {
  const response = await fetch(new URL(path, apiUrl), { method, headers: { "Content-Type": "application/json", ...(process.env.WORKER_TOKEN ? { Authorization: `Bearer ${process.env.WORKER_TOKEN}` } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
}
console.log(`BeanBoard worker consuming ${queue.config.subject}`);
for await (const message of messages) {
  let order;
  try {
    order = decodeOrder(message);
    await call(`/api/orders/${encodeURIComponent(order.id)}`, "PATCH", { status: "brewing" });
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.BREW_TIME_MS || 2500)));
    await call(`/api/orders/${encodeURIComponent(order.id)}`, "PATCH", { status: "ready" });
    message.ack();
  } catch (error) {
    console.error(`Order ${order?.id || "unknown"} failed: ${error.message}`); message.nak(1500);
  }
}
