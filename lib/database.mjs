import pg from "pg";
const { Pool } = pg;

let pool;
export function enabled(value) { return /^(1|true|yes|on)$/i.test(String(value || "")); }

export async function openDatabase() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000 });
  if (enabled(process.env.DATABASE_AUTO_MIGRATE)) {
    await pool.query(`CREATE TABLE IF NOT EXISTS beanboard_orders (
      id text PRIMARY KEY, customer text NOT NULL, drink text NOT NULL, notes text NOT NULL DEFAULT '',
      status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  return pool;
}

export async function loadOrders(fallback) {
  const db = await openDatabase();
  if (!db) return fallback;
  const result = await db.query("SELECT id, customer, drink, notes, status, created_at AS \"createdAt\" FROM beanboard_orders ORDER BY created_at DESC LIMIT 100");
  return result.rows.length ? result.rows : fallback;
}

export async function saveOrder(order) {
  const db = await openDatabase();
  if (!db) return order;
  await db.query(`INSERT INTO beanboard_orders (id, customer, drink, notes, status, created_at)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, updated_at=now()`,
    [order.id, order.customer, order.drink, order.notes, order.status, order.createdAt]);
  return order;
}

export async function updateOrderStatus(id, status) {
  const db = await openDatabase();
  if (db) await db.query("UPDATE beanboard_orders SET status=$2, updated_at=now() WHERE id=$1", [id, status]);
}
