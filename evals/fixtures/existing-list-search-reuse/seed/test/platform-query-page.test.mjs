import assert from "node:assert/strict";
import test from "node:test";

import { decodeCursor, encodeCursor, queryPage } from "../src/platform-query-page.mjs";

test("cursor round trips the stable key", () => {
  const key = { createdAt: "2026-08-20T00:00:00.000Z", id: "project-1" };
  assert.deepEqual(decodeCursor(encodeCursor(key)), key);
});

test("queryPage owns tenant scope, public cursor shape, and page limits", async () => {
  const calls = [];
  const next = { createdAt: "2026-08-20T00:00:00.000Z", id: "project-1" };
  const repository = {
    queryPage: async (input) => (calls.push(input), { items: [{ id: "project-2" }], next }),
  };

  const page = await queryPage(repository, "tenant-1", { query: "invoice", limit: 10 });

  assert.deepEqual(calls, [{ tenantId: "tenant-1", query: "invoice", after: null, limit: 10 }]);
  assert.deepEqual(page, {
    items: [{ id: "project-2" }],
    nextCursor: encodeCursor(next),
  });
});
