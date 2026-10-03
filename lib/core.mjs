import { randomUUID } from "node:crypto";

export const seedRoasts = [
  { id: "ethiopia", name: "Ethiopia Yirgacheffe", origin: "Gedeo, Ethiopia", process: "Washed", notes: "Jasmine · bergamot · peach", type: "single", price: 18, stock: "In stock" },
  { id: "colombia", name: "Colombia El Paraíso", origin: "Cauca, Colombia", process: "Thermal shock", notes: "Lychee · rose · cacao", type: "single", price: 20, stock: "Low" },
  { id: "nightshift", name: "Night Shift Espresso", origin: "Brazil · Guatemala", process: "Natural / washed", notes: "Dark chocolate · praline", type: "espresso", price: 16, stock: "In stock" },
  { id: "sumatra", name: "Sumatra Kerinci", origin: "Jambi, Indonesia", process: "Honey", notes: "Tamarind · spice · syrup", type: "single", price: 19, stock: "In stock" }
];

export const seedOrders = [
  { id: "BB-104", customer: "Maya", drink: "Oat flat white", notes: "Extra hot", status: "brewing", createdAt: new Date(Date.now() - 7 * 60_000).toISOString() },
  { id: "BB-105", customer: "Theo", drink: "Ethiopia V60", notes: "", status: "queued", createdAt: new Date(Date.now() - 4 * 60_000).toISOString() }
];

export function cleanText(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function createOrder(input = {}) {
  const customer = cleanText(input.customer, 60);
  const drink = cleanText(input.drink, 100);
  if (!customer || !drink) throw new Error("Customer and drink are required");
  return {
    id: `BB-${randomUUID().slice(0, 6).toUpperCase()}`,
    customer,
    drink,
    notes: cleanText(input.notes, 160),
    status: "queued",
    createdAt: new Date().toISOString()
  };
}

export function publicState(orders, roasts, events) {
  const active = orders.filter((order) => !["ready", "completed", "cancelled"].includes(order.status));
  return {
    shop: { open: true, mood: active.length > 4 ? "Busy & Buzzing" : "Cozy & Flowing", seatsUsed: 68, closingTime: "4:00 PM" },
    stats: { activeOrders: active.length, waitMinutes: Math.max(3, active.length * 3), brewer: "Julian Vance", grinder: "Ethiopia Yirgacheffe" },
    orders: orders.slice(0, 50), roasts, events: events.slice(0, 30), updatedAt: new Date().toISOString()
  };
}
