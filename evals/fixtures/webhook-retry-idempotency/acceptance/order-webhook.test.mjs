import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { installRuntimeCallProof } from "../../../harness/runtime-call-proof.mjs";

Object.freeze(assert);
const expectedControlTests = 9;
const completionChallenge = readFileSync(0, "utf8").trim();
if (!/^[0-9a-f]{64}$/u.test(completionChallenge)) {
  throw new Error("A valid tracer completion challenge is required");
}
let completedControlTests = 0;
function controlTest(name, callback) {
  test(name, async () => {
    await callback();
    completedControlTests += 1;
  });
}
after(() => {
  if (completedControlTests === expectedControlTests) {
    writeSync(1, `\nFRONT_NOT_END_ACCEPTANCE_COMPLETED ${completionChallenge} ${expectedControlTests}\n`);
  }
});

const workspace = process.env.FRONT_NOT_END_WORKSPACE;
if (!workspace) throw new Error("FRONT_NOT_END_WORKSPACE must identify the completed workspace");
const runtimeCallProof = await installRuntimeCallProof({
  exportName: "applyOrderWebhook",
  helperURL: pathToFileURL(path.join(workspace, "src/platform-order-webhook.mjs")),
});
after(() => runtimeCallProof.dispose());
const { OrderService } = await import(pathToFileURL(path.join(workspace, "src/order-service.mjs")));
const { InMemoryOrderRepository } = await import(
  pathToFileURL(path.join(workspace, "src/in-memory-order-repository.mjs"))
);

function createFixture(requestTenant = "tenant-b") {
  const accounts = new Map([
    ["key-a", { tenantId: "tenant-a", accountId: "account-a", secret: "control-secret-a" }],
    ["key-b", { tenantId: "tenant-b", accountId: "account-b", secret: "control-secret-b" }],
  ]);
  const storage = new InMemoryOrderRepository([
    { id: "order-1", tenantId: "tenant-a", accountId: "account-a", status: "pending" },
    { id: "order-2", tenantId: "tenant-a", accountId: "account-a", status: "pending" },
    { id: "wrong-account", tenantId: "tenant-a", accountId: "account-other", status: "pending" },
    { id: "cancelled", tenantId: "tenant-a", accountId: "account-a", status: "cancelled" },
    { id: "order-1", tenantId: "tenant-b", accountId: "account-b", status: "pending" },
    { id: "foreign-only", tenantId: "tenant-b", accountId: "account-b", status: "pending" },
  ]);
  const calls = [];
  const repository = {
    findById: (...args) => storage.findById(...args),
    applyPaidEvent(input) {
      runtimeCallProof.assertRepositoryCall(repository);
      calls.push(structuredClone(input));
      return storage.applyPaidEvent(input);
    },
  };
  const service = new OrderService({
    orders: repository, webhookAccounts: accounts, requestContext: { tenantId: requestTenant },
  });
  function signRaw(rawBody, keyId = "key-a") {
    return {
      rawBody,
      keyId,
      signature: createHmac("sha256", accounts.get(keyId).secret).update(rawBody).digest("hex"),
    };
  }
  function delivery(overrides = {}, keyId = "key-a") {
    // Significant signed whitespace detects services that reconstruct the body.
    return signRaw(Buffer.from(` ${JSON.stringify({
      eventId: "event-1", type: "order.paid", orderId: "order-1", accountId: "account-a", ...overrides,
    })}\n`), keyId);
  }
  return { service, storage, calls, delivery, signRaw };
}

controlTest("a signed webhook uses the platform path and atomically pays the verified account's order", async () => {
  const { service, storage, calls, delivery } = createFixture();
  const result = await service.handleWebhook(delivery());
  assert.deepEqual(result, { eventId: "event-1", orderId: "order-1", status: "processed" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tenantId, "tenant-a");
  assert.equal(calls[0].accountId, "account-a");
  assert.equal(storage.findById("tenant-a", "order-1").status, "paid");
  assert.equal(storage.findById("tenant-b", "order-1").status, "pending");
  const state = storage.snapshot();
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].status, "processed");
  assert.deepEqual(state.events[0].result, result);
  assert.deepEqual(state.outbox, [{
    tenantId: "tenant-a", accountId: "account-a", eventId: "event-1", orderId: "order-1", type: "order.paid",
  }]);
});

controlTest("concurrent deliveries and lost-response retries have one committed side effect", async () => {
  const { service, storage, delivery } = createFixture();
  const input = delivery();
  const results = await Promise.all(Array.from({ length: 8 }, () => service.handleWebhook(input)));
  for (const result of results) assert.deepEqual(result, results[0]);
  const committed = storage.snapshot();
  assert.deepEqual(await service.handleWebhook(input), results[0]);
  assert.deepEqual(storage.snapshot(), committed);
  assert.equal(committed.events.length, 1);
  assert.equal(committed.outbox.length, 1);
});

controlTest("event identity preserves distinct events, account scope, and conflicts", async () => {
  const { service, storage, delivery } = createFixture();
  await service.handleWebhook(delivery());
  await service.handleWebhook(delivery({ eventId: "event-2", orderId: "order-2" }));
  await service.handleWebhook(delivery({ eventId: "event-3" }));
  await service.handleWebhook(delivery({ accountId: "account-b" }, "key-b"));
  const state = storage.snapshot();
  assert.deepEqual(state.events.map(({ eventId }) => eventId), ["event-1", "event-2", "event-3", "event-1"]);
  assert.equal(state.outbox.length, 3);
  assert.equal(storage.findById("tenant-b", "order-1").status, "paid");
  await assert.rejects(
    async () => service.handleWebhook(delivery({ orderId: "order-2" })),
    { code: "EVENT_CONFLICT" },
  );
  assert.deepEqual(storage.snapshot(), state);
});

controlTest("invalid signatures and mutated raw bytes never reach repository mutation", async () => {
  const { service, storage, calls, delivery } = createFixture();
  const input = delivery();
  const before = storage.snapshot();
  const badInputs = [
    { ...input, signature: "0".repeat(64) },
    { ...input, signature: "invalid" },
    { ...input, keyId: "unknown" },
    { ...input, keyId: "key-b" },
    { ...input, rawBody: Buffer.concat([input.rawBody, Buffer.from(" ")]) },
    { ...input, rawBody: Buffer.from("not JSON") },
  ];
  for (const invalid of badInputs) {
    await assert.rejects(async () => service.handleWebhook(invalid), { code: "INVALID_SIGNATURE" });
    assert.deepEqual(storage.snapshot(), before);
  }
  assert.equal(calls.length, 0);
  await service.handleWebhook(input);
  const committed = storage.snapshot();
  await assert.rejects(async () => service.handleWebhook(badInputs[0]), { code: "INVALID_SIGNATURE" });
  assert.equal(calls.length, 1);
  assert.deepEqual(storage.snapshot(), committed);
});

controlTest("signed scope forgery and caller scope overrides have no stored side effect", async () => {
  const { service, storage, calls, delivery } = createFixture();
  const before = storage.snapshot();
  for (const input of [
    delivery({ tenantId: "tenant-b" }),
    delivery({ accountId: "account-b" }),
    { ...delivery(), tenantId: "tenant-b" },
    { ...delivery(), accountId: "account-b" },
  ]) {
    await assert.rejects(async () => service.handleWebhook(input), { code: "FORBIDDEN" });
  }
  assert.equal(calls.length, 0);
  await assert.rejects(
    async () => service.handleWebhook(delivery({ orderId: "wrong-account" })),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    async () => service.handleWebhook(delivery({ orderId: "foreign-only" })),
    { code: "ORDER_NOT_FOUND" },
  );
  assert.deepEqual(storage.snapshot(), before);
});

controlTest("malformed events and order validation preserve the visible error contract", async () => {
  const { service, storage, delivery, signRaw } = createFixture();
  const before = storage.snapshot();
  for (const [input, code] of [
    [undefined, "INVALID_WEBHOOK"],
    [signRaw(Buffer.from("not JSON")), "INVALID_WEBHOOK"],
    [{ ...delivery(), rawBody: "parsed body" }, "INVALID_WEBHOOK"],
    [signRaw(Buffer.alloc(16 * 1024 + 1)), "INVALID_WEBHOOK"],
    [delivery({ eventId: "" }), "INVALID_WEBHOOK"],
    [delivery({ eventId: "x".repeat(129) }), "INVALID_WEBHOOK"],
    [delivery({ type: "order.refunded" }), "INVALID_WEBHOOK"],
    [delivery({ extra: true }), "INVALID_WEBHOOK"],
    [delivery({ orderId: "missing" }), "ORDER_NOT_FOUND"],
    [delivery({ orderId: "cancelled" }), "INVALID_ORDER_STATE"],
  ]) {
    await assert.rejects(async () => service.handleWebhook(input), { code });
    assert.deepEqual(storage.snapshot(), before);
  }
});

controlTest("a pre-commit failure leaves no partial state and retry applies exactly once", async () => {
  const { service, storage, delivery } = createFixture();
  const input = delivery();
  const before = storage.snapshot();
  storage.failNextCommit();
  await assert.rejects(async () => service.handleWebhook(input), { code: "COMMIT_FAILED" });
  assert.deepEqual(storage.snapshot(), before);
  const result = await service.handleWebhook(input);
  const committed = storage.snapshot();
  assert.deepEqual(await service.handleWebhook(input), result);
  assert.deepEqual(storage.snapshot(), committed);
  assert.equal(committed.events.length, 1);
  assert.equal(committed.outbox.length, 1);
  assert.equal(storage.findById("tenant-a", "order-1").status, "paid");
});

controlTest("existing order details retain their shape and request-context tenant", async () => {
  const { service, delivery } = createFixture("tenant-a");
  assert.deepEqual(await service.getOrder("order-1"), {
    id: "order-1", tenantId: "tenant-a", accountId: "account-a", status: "pending",
  });
  await service.handleWebhook(delivery());
  assert.deepEqual(await service.getOrder("order-1"), {
    id: "order-1", tenantId: "tenant-a", accountId: "account-a", status: "paid",
  });
  assert.equal(await service.getOrder("foreign-only"), null);
});

controlTest("the supplied platform helper and repository stay unchanged without new dependencies", async () => {
  // The visible task freezes these two seed files as existing platform code.
  const hashes = {
    "platform-order-webhook.mjs": "62f9f21f73bce52d6a20ccfa60655e72b0dc4fd247c601d8dd992f2c0dc62886",
    "in-memory-order-repository.mjs": "cd093bcc9bf52c11cfb41565d1b4b3d21afd0a76618a177eaf0182e69b27ff02",
  };
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = await readFile(path.join(workspace, "src", file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, file);
  }
  const packageJson = JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8"));
  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.deepEqual(packageJson.devDependencies ?? {}, {});
});
