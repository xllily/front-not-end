import assert from "node:assert/strict";
import { test } from "node:test";

import { createProject } from "../src/platform-create-project.mjs";

test("createProject enforces permission and delegates a normalized scoped mutation", async () => {
  const calls = [];
  const repository = {
    createOnce: async (input) => (calls.push(input), { id: "project-1", ...input }),
  };

  assert.throws(
    () => createProject(repository, { tenantId: "workspace-1", permissions: [] }, {
      name: "Invoices",
      operationId: "operation-1",
    }),
    { code: "FORBIDDEN" },
  );
  assert.equal(calls.length, 0);

  assert.deepEqual(
    await createProject(
      repository,
      { tenantId: "workspace-1", permissions: ["project:create"] },
      { name: "  Invoices  ", operationId: "operation-1" },
    ),
    {
      id: "project-1",
      tenantId: "workspace-1",
      operationId: "operation-1",
      name: "Invoices",
    },
  );
});
