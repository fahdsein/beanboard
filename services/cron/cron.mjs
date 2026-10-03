const apiUrl = process.env.API_URL;
if (!apiUrl) throw new Error("API_URL is required");
const interval = Math.max(Number(process.env.CRON_INTERVAL_MS || 86_400_000), 60_000);

async function report() {
  try {
    const summary = await fetch(new URL("/api/summary", apiUrl), { signal: AbortSignal.timeout(8000) }).then((res) => res.json());
    const response = await fetch(new URL("/api/events", apiUrl), { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.WORKER_TOKEN ? { Authorization: `Bearer ${process.env.WORKER_TOKEN}` } : {}) }, body: JSON.stringify({ type: "cron", message: `Scheduled café report: ${summary.activeOrders} active orders`, details: summary }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    console.log(`${new Date().toISOString()} BeanBoard scheduled report accepted`);
  } catch (error) { console.error(`${new Date().toISOString()} report failed: ${error.message}`); }
}
await report();
if (process.argv.includes("--run-once")) process.exit(0);
setInterval(report, interval);
