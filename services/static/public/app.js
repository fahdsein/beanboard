const cfg = window.BEANBOARD_CONFIG || {};
const $ = (id) => document.getElementById(id);
const api = (cfg.apiUrl || new URLSearchParams(location.search).get("api") || localStorage.getItem("beanboard-api") || (location.port === "8080" ? "http://localhost:3000" : "")).replace(/\/$/, "");
let state = { orders: [], roasts: [], events: [], stats: {} };
let filter = "all";

function toast(message) { $("toast").textContent = message; $("toast").classList.add("show"); setTimeout(() => $("toast").classList.remove("show"), 2800); }
function escape(value) { const span = document.createElement("span"); span.textContent = value ?? ""; return span.innerHTML; }
function elapsed(value) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value)) / 60000)); return minutes ? `${minutes} min ago` : "just now"; }
async function request(path, options) { const response = await fetch(`${api}${path}`, { cache: "no-store", ...options }); const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data; }

function render() {
  $("mood").textContent = state.shop?.mood || "Cozy & Flowing"; $("seats").textContent = `${state.shop?.seatsUsed ?? 68}% seated`;
  $("wait").textContent = state.stats?.waitMinutes ?? "—"; $("queueCount").textContent = `${state.stats?.activeOrders ?? 0} active orders`; $("queueBadge").textContent = `${state.stats?.activeOrders ?? 0} ACTIVE`;
  $("brewer").textContent = state.stats?.brewer || "Julian Vance"; $("grinder").textContent = state.stats?.grinder || "Ethiopia Yirgacheffe";
  const active = state.orders.filter((item) => !["completed", "cancelled"].includes(item.status));
  $("queue").innerHTML = active.length ? active.map((order) => `<article class="order"><span class="ticket">${escape(order.id.slice(-3))}</span><div><strong>${escape(order.customer)}</strong><span>${escape(order.drink)} · ${elapsed(order.createdAt)}</span></div><span class="status ${escape(order.status)}">${escape(order.status)}</span></article>`).join("") : '<div class="empty">The bar is clear. Your cup can be next.</div>';
  const roasts = state.roasts.filter((item) => filter === "all" || item.type === filter);
  $("roasts").innerHTML = roasts.map((roast) => `<article class="roast"><div class="roast-top"><div><span class="tag">${escape(roast.process.toUpperCase())}</span><h3>${escape(roast.name)}</h3><span class="origin">${escape(roast.origin)}</span></div></div><p class="notes">${escape(roast.notes)}</p><footer><strong>$${escape(roast.price)}</strong><button data-roast="${escape(roast.name)}">ORDER A CUP</button></footer></article>`).join("");
  $("drink").innerHTML = [...state.roasts.map((r) => `${r.name} pour-over`), "Flat white", "Cappuccino", "Cold brew", "Matcha latte"].map((name) => `<option>${escape(name)}</option>`).join("");
  renderAdmin();
}
function renderAdmin() { $("adminOrders").innerHTML = state.orders.map((order) => `<div class="admin-row"><div><strong>${escape(order.id)} · ${escape(order.customer)}</strong><small>${escape(order.drink)}</small></div><select data-order="${escape(order.id)}">${["queued","brewing","ready","completed","cancelled"].map((s) => `<option ${s===order.status?"selected":""}>${s}</option>`).join("")}</select></div>`).join(""); }
async function refresh() {
  if (!api) { $("connection").className = "pill offline"; $("connection").innerHTML = "<i></i> API URL NEEDED"; return; }
  try { state = await request("/api/state"); $("connection").className = "pill live"; $("connection").innerHTML = "<i></i> LIVE"; render();
    const summary = await request("/ready"); document.querySelectorAll("[data-service]").forEach((el) => { const value = summary.dependencies?.[el.dataset.service]; el.className = value === "unavailable" ? "bad" : value === "not_configured" ? "na" : ""; el.title = value || "ready"; });
  } catch (error) { $("connection").className = "pill offline"; $("connection").innerHTML = "<i></i> OFFLINE"; console.error(error); }
}
function openOrder(roast) { $("orderDialog").showModal(); if (roast) [...$("drink").options].find((o) => o.text.startsWith(roast))?.setAttribute("selected", "selected"); setTimeout(() => $("customer").focus(), 20); }
$("orderButton").onclick = $("queueOrderButton").onclick = () => openOrder();
$("adminButton").onclick = () => $("adminDialog").showModal();
document.querySelectorAll("[data-close]").forEach((button) => button.onclick = () => button.closest("dialog").close());
document.querySelectorAll("[data-filter]").forEach((button) => button.onclick = () => { filter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("active", b === button)); render(); });
$("roasts").onclick = (event) => { const button = event.target.closest("[data-roast]"); if (button) openOrder(button.dataset.roast); };
$("orderForm").onsubmit = async (event) => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { const payload = Object.fromEntries(new FormData(event.currentTarget)); const result = await request("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); $("orderDialog").close(); event.currentTarget.reset(); toast(`${result.order.id} added — we’ll start brewing soon.`); await refresh(); } catch (error) { toast(error.message); } finally { button.disabled = false; } };
$("adminOrders").onchange = async (event) => { if (!event.target.matches("[data-order]")) return; try { await request(`/api/orders/${encodeURIComponent(event.target.dataset.order)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${$("adminToken").value}` }, body: JSON.stringify({ status: event.target.value }) }); toast("Order updated"); await refresh(); } catch (error) { toast(error.message); await refresh(); } };
setInterval(() => { $("clock").textContent = new Date().toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }); }, 1000);
refresh(); setInterval(refresh, 10000);
