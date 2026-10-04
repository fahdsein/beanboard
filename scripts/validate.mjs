import { access, readFile } from "node:fs/promises";
const required = ["Dockerfile","Dockerfile.worker","Dockerfile.cron","Dockerfile.static","services/static/40-beanboard-config.sh","services/static/public/index.html","compose.yaml",".env.example","neoapp.env.example"];
for (const file of required) await access(new URL(`../${file}`, import.meta.url));
const html = await readFile(new URL("../services/static/public/index.html", import.meta.url), "utf8");
for (const id of ["queue","roasts","orderDialog","adminDialog"]) if (!html.includes(`id=\"${id}\"`)) throw new Error(`Missing UI element ${id}`);
JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
console.log(`BeanBoard validation passed (${required.length} deployment artifacts).`);
