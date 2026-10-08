const apiUrl = process.env.API_URL;
const workerToken = process.env.WORKER_TOKEN;

if (!apiUrl) throw new Error("API_URL is required");
if (!workerToken) throw new Error("WORKER_TOKEN is required");

async function request(path, options = {}) {
  const response = await fetch(new URL(path, apiUrl), {
    ...options,
    signal: AbortSignal.timeout(8_000)
  });

  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response;
}

async function main() {
  const summaryResponse = await request("/api/summary");
  const summary = await summaryResponse.json();

  await request("/api/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${workerToken}`
    },
    body: JSON.stringify({
      type: "cron",
      message: `Scheduled café report: ${summary.activeOrders} active orders`,
      details: summary
    })
  });

  console.log(`${new Date().toISOString()} BeanBoard scheduled report accepted`);
}

main().catch((error) => {
  console.error(`${new Date().toISOString()} BeanBoard scheduled report failed: ${error.message}`);
  process.exitCode = 1;
});
