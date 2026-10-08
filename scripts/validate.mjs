import { access, readFile } from "node:fs/promises";
const required = ["Dockerfile","Dockerfile.worker","Dockerfile.static","services/static/40-beanboard-config.sh","services/static/public/index.html","compose.yaml",".env.example","neoapp.env.example"];
for (const file of required) await access(new URL(`../${file}`, import.meta.url));
const html = await readFile(new URL("../services/static/public/index.html", import.meta.url), "utf8");
for (const id of ["queue","roasts","orderDialog","adminDialog"]) if (!html.includes(`id=\"${id}\"`)) throw new Error(`Missing UI element ${id}`);
const server = await readFile(new URL("../services/api/server.mjs", import.meta.url), "utf8");
for (const value of ["/api/cron/daily-summary", "CRON_TOKEN", "cronAuthorized"]) if (!server.includes(value)) throw new Error(`Missing Scheduled Job API support: ${value}`);
JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
console.log(`BeanBoard validation passed (${required.length} deployment artifacts).`);
