import { S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { enabled } from "./database.mjs";

let client;
export function storageClient() {
  if (!process.env.S3_ENDPOINT) return null;
  client ||= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: enabled(process.env.S3_FORCE_PATH_STYLE),
    credentials: process.env.S3_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY || "" } : undefined
  });
  return client;
}
export async function ensureBucket() {
  const s3 = storageClient();
  if (!s3) return null;
  const Bucket = process.env.S3_BUCKET || "beanboard-receipts";
  try { await s3.send(new HeadBucketCommand({ Bucket })); } catch { await s3.send(new CreateBucketCommand({ Bucket })); }
  return { s3, Bucket };
}
export async function storeReceipt(order) {
  const target = await ensureBucket();
  if (!target) return null;
  const Key = `receipts/${order.id}.json`;
  await target.s3.send(new PutObjectCommand({ Bucket: target.Bucket, Key, Body: JSON.stringify(order, null, 2), ContentType: "application/json" }));
  return { bucket: target.Bucket, key: Key };
}
