import test from "node:test";
import assert from "node:assert/strict";
import { createOrder, publicState, seedRoasts } from "../lib/core.mjs";
test("createOrder validates and normalizes customer orders", () => {
  const order = createOrder({ customer: "  Ada  ", drink: "V60", notes: "light" });
  assert.equal(order.customer, "Ada"); assert.equal(order.status, "queued"); assert.match(order.id, /^BB-/);
  assert.throws(() => createOrder({ customer: "", drink: "V60" }), /required/);
});
test("publicState derives active queue metrics", () => {
  const state = publicState([{ status: "queued" }, { status: "completed" }], seedRoasts, []);
  assert.equal(state.stats.activeOrders, 1); assert.equal(state.roasts.length, 4);
});
