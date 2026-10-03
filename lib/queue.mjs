import { connect } from "@nats-io/transport-node";
import { AckPolicy, DeliverPolicy, RetentionPolicy, StorageType, jetstream, jetstreamManager } from "@nats-io/jetstream";
import { enabled } from "./database.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const queueConfig = () => ({
  stream: process.env.NATS_STREAM || "BEANBOARD_ORDERS",
  subject: process.env.NATS_SUBJECT || "beanboard.orders",
  consumer: process.env.NATS_CONSUMER || "beanboard-baristas"
});

export async function openQueue(name) {
  if (!process.env.NATS_URL) return null;
  const nc = await connect({ servers: process.env.NATS_URL.split(","), name, token: process.env.NATS_TOKEN, user: process.env.NATS_USER, pass: process.env.NATS_PASSWORD });
  return { nc, js: jetstream(nc), jsm: await jetstreamManager(nc), config: queueConfig() };
}

export async function ensureQueue(queue) {
  if (!queue) return;
  const { stream, subject, consumer } = queue.config;
  try { await queue.jsm.streams.info(stream); }
  catch (error) {
    if (!enabled(process.env.NATS_MANAGE_RESOURCES)) throw error;
    await queue.jsm.streams.add({ name: stream, subjects: [subject], retention: RetentionPolicy.Workqueue, storage: StorageType.File });
  }
  try { await queue.jsm.consumers.info(stream, consumer); }
  catch (error) {
    if (!enabled(process.env.NATS_MANAGE_RESOURCES)) throw error;
    await queue.jsm.consumers.add(stream, { durable_name: consumer, ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, filter_subject: subject, max_deliver: 3 });
  }
}

export async function publishOrder(queue, order) {
  if (!queue) return null;
  await ensureQueue(queue);
  return queue.js.publish(queue.config.subject, encoder.encode(JSON.stringify(order)), { msgID: order.id });
}
export const decodeOrder = (message) => JSON.parse(decoder.decode(message.data));
