import assert from "node:assert/strict";
import test from "node:test";

import { decodeCursor, encodeCursor, queryPage } from "../src/platform-query-page.mjs";

test("cursor round trips the stable key", () => {
  const key = { createdAt: "2026-08-20T00:00:00.000Z", id: "project-1" };
  assert.deepEqual(decodeCursor(encodeCursor(key)), key);
});

test("queryPage owns tenant scope and page limits", async () => {
  const calls = [];
  const repository = { queryPage: async (input) => (calls.push(input), { items: [], next: null }) };
  await queryPage(repository, "tenant-1", { query: "invoice", limit: 10 });
  assert.deepEqual(calls, [{ tenantId: "tenant-1", query: "invoice", after: null, limit: 10 }]);
});
