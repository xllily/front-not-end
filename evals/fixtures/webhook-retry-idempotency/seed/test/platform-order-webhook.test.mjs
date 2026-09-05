import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { InMemoryOrderRepository } from "../src/in-memory-order-repository.mjs";
import { OrderService } from "../src/order-service.mjs";
import { applyOrderWebhook } from "../src/platform-order-webhook.mjs";

function fixture() {
  const accounts = new Map([
    ["key-a", { tenantId: "tenant-a", accountId: "account-a", secret: "fixture-secret-a" }],
    ["key-b", { tenantId: "tenant-b", accountId: "account-b", secret: "fixture-secret-b" }],
  ]);
  const orders = new InMemoryOrderRepository([
    { id: "order-1", tenantId: "tenant-a", accountId: "account-a", status: "pending" },
    { id: "order-2", tenantId: "tenant-a", accountId: "account-a", status: "pending" },
    { id: "other-account", tenantId: "tenant-a", accountId: "account-other", status: "pending" },
    { id: "cancelled", tenantId: "tenant-a", accountId: "account-a", status: "cancelled" },
    { id: "order-1", tenantId: "tenant-b", accountId: "account-b", status: "pending" },
  ]);
  return { accounts, orders };
}

function signed(event = {}, keyId = "key-a", secret = "fixture-secret-a") {
  const rawBody = Buffer.from(JSON.stringify({
    eventId: "event-1", type: "order.paid", orderId: "order-1", accountId: "account-a", ...event,
  }));
  return { rawBody, keyId, signature: createHmac("sha256", secret).update(rawBody).digest("hex") };
}

test("a verified delivery atomically records the result, paid order, and notification", () => {
  const { accounts, orders } = fixture();
  const result = applyOrderWebhook(orders, accounts, signed());
  assert.deepEqual(result, { eventId: "event-1", orderId: "order-1", status: "processed" });
  const state = orders.snapshot();
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].status, "processed");
  assert.deepEqual(state.events[0].result, result);
  assert.equal(orders.findById("tenant-a", "order-1").status, "paid");
  assert.equal(orders.findById("tenant-b", "order-1").status, "pending");
  assert.deepEqual(state.outbox, [{
    tenantId: "tenant-a", accountId: "account-a", eventId: "event-1", orderId: "order-1", type: "order.paid",
  }]);
  result.status = "changed by caller";
  state.outbox.length = 0;
  assert.equal(orders.snapshot().outbox.length, 1);
  assert.equal(orders.snapshot().events[0].result.status, "processed");
});

test("concurrent redeliveries and a lost-response retry return the same single committed result", async () => {
  const { accounts, orders } = fixture();
  const input = signed();
  const results = await Promise.all(Array.from({ length: 12 }, async () => (
    applyOrderWebhook(orders, accounts, input)
  )));
  results.forEach((result) => assert.deepEqual(result, results[0]));
  const committed = orders.snapshot();
  assert.deepEqual(applyOrderWebhook(orders, accounts, input), results[0]);
  assert.deepEqual(orders.snapshot(), committed);
  assert.equal(committed.events.length, 1);
  assert.equal(committed.outbox.length, 1);
});

test("distinct event IDs remain distinct while another paid event does not notify twice", () => {
  const { accounts, orders } = fixture();
  applyOrderWebhook(orders, accounts, signed());
  applyOrderWebhook(orders, accounts, signed({ eventId: "event-2", orderId: "order-2" }));
  applyOrderWebhook(orders, accounts, signed({ eventId: "event-3" }));
  assert.deepEqual(orders.snapshot().events.map((event) => event.eventId), ["event-1", "event-2", "event-3"]);
  assert.equal(orders.snapshot().outbox.length, 2);
});

test("the verified account scopes event identity and order selection", () => {
  const { accounts, orders } = fixture();
  applyOrderWebhook(orders, accounts, signed());
  applyOrderWebhook(orders, accounts, signed({ accountId: "account-b" }, "key-b", "fixture-secret-b"));
  assert.equal(orders.findById("tenant-b", "order-1").status, "paid");
  assert.equal(orders.snapshot().events.length, 2);
  assert.equal(orders.snapshot().outbox.length, 2);
});

test("invalid signatures and changed raw bytes are rejected before any repository access", () => {
  const { accounts } = fixture();
  let calls = 0;
  const repository = { applyPaidEvent: () => { calls += 1; } };
  const original = signed();
  for (const input of [
    { ...original, signature: "0".repeat(64) },
    { ...original, signature: "short" },
    { ...original, keyId: "unknown" },
    { ...original, keyId: "key-b" },
    { ...original, rawBody: Buffer.concat([original.rawBody, Buffer.from(" ")]) },
    { ...original, rawBody: Buffer.from("not json") },
  ]) {
    assert.throws(() => applyOrderWebhook(repository, accounts, input), { code: "INVALID_SIGNATURE" });
  }
  assert.equal(calls, 0);
});

test("signed forged scope, caller overrides, and foreign orders leave state unchanged", () => {
  const { accounts, orders } = fixture();
  const before = orders.snapshot();
  for (const input of [
    signed({ accountId: "account-b" }),
    signed({ tenantId: "tenant-b" }),
    signed({ orderId: "other-account" }),
    { ...signed(), tenantId: "tenant-b" },
    { ...signed(), accountId: "account-b" },
  ]) {
    assert.throws(() => applyOrderWebhook(orders, accounts, input), { code: "FORBIDDEN" });
    assert.deepEqual(orders.snapshot(), before);
  }
});

test("invalid payload, missing order, and invalid order state have no side effects", () => {
  const { accounts, orders } = fixture();
  const before = orders.snapshot();
  for (const [input, code] of [
    [undefined, "INVALID_WEBHOOK"],
    [{ ...signed(), rawBody: "parsed elsewhere" }, "INVALID_WEBHOOK"],
    [{ ...signed(), rawBody: Buffer.alloc(16 * 1024 + 1) }, "INVALID_WEBHOOK"],
    [signed({ eventId: "" }), "INVALID_WEBHOOK"],
    [signed({ eventId: "x".repeat(129) }), "INVALID_WEBHOOK"],
    [signed({ type: "order.refunded" }), "INVALID_WEBHOOK"],
    [signed({ extra: "unsupported" }), "INVALID_WEBHOOK"],
    [signed({ orderId: "missing" }), "ORDER_NOT_FOUND"],
    [signed({ orderId: "cancelled" }), "INVALID_ORDER_STATE"],
  ]) {
    assert.throws(() => applyOrderWebhook(orders, accounts, input), { code });
    assert.deepEqual(orders.snapshot(), before);
  }
});

test("event ID reuse with different signed bytes fails without modifying the first result", () => {
  const { accounts, orders } = fixture();
  applyOrderWebhook(orders, accounts, signed());
  const before = orders.snapshot();
  assert.throws(
    () => applyOrderWebhook(orders, accounts, signed({ orderId: "order-2" })),
    { code: "EVENT_CONFLICT" },
  );
  assert.deepEqual(orders.snapshot(), before);
});

test("a pre-commit failure leaves no partial state and the next delivery applies exactly once", () => {
  const { accounts, orders } = fixture();
  const before = orders.snapshot();
  orders.failNextCommit();
  assert.throws(() => applyOrderWebhook(orders, accounts, signed()), { code: "COMMIT_FAILED" });
  assert.deepEqual(orders.snapshot(), before);
  applyOrderWebhook(orders, accounts, signed());
  const committed = orders.snapshot();
  applyOrderWebhook(orders, accounts, signed());
  assert.deepEqual(orders.snapshot(), committed);
  assert.equal(committed.events.length, 1);
  assert.equal(committed.outbox.length, 1);
  assert.equal(orders.findById("tenant-a", "order-1").status, "paid");
});

test("the existing order-details service reads only its trusted tenant and preserves its shape", async () => {
  const { accounts, orders } = fixture();
  const service = new OrderService({
    orders, webhookAccounts: accounts, requestContext: { tenantId: "tenant-a" },
  });
  assert.deepEqual(await service.getOrder("order-1"), {
    id: "order-1", tenantId: "tenant-a", accountId: "account-a", status: "pending",
  });
  assert.equal(await service.getOrder("missing"), null);
});
