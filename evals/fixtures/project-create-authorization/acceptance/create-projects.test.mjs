import assert from "node:assert/strict";
import { readFileSync, writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { installRuntimeCallProof } from "../../../harness/runtime-call-proof.mjs";

Object.freeze(assert);
const expectedControlTests = 7;
const completionChallenge = readFileSync(0, "utf8").trim();
if (!/^[0-9a-f]{64}$/u.test(completionChallenge)) {
  throw new Error("A valid tracer completion challenge is required");
}
let completedControlTests = 0;
function controlTest(name, callback) {
  test(name, async (context) => {
    await callback(context);
    completedControlTests += 1;
  });
}
after(() => {
  if (completedControlTests === expectedControlTests) {
    writeSync(
      1,
      `\nFRONT_NOT_END_ACCEPTANCE_COMPLETED ${completionChallenge} ${expectedControlTests}\n`,
    );
  }
});

const workspace = process.env.FRONT_NOT_END_WORKSPACE;
if (!workspace) {
  throw new Error("FRONT_NOT_END_WORKSPACE must point to the completed tracer workspace");
}

const projectServicePath = path.join(workspace, "src", "project-service.mjs");
const platformCreateProjectPath = path.join(workspace, "src", "platform-create-project.mjs");
const packagePath = path.join(workspace, "package.json");
const runtimeCallProof = await installRuntimeCallProof({
  exportName: "createProject",
  helperURL: pathToFileURL(platformCreateProjectPath),
});
after(() => runtimeCallProof.dispose());
const { ProjectService } = await import(pathToFileURL(projectServicePath));

function createRepository() {
  const calls = [];
  const records = new Map();
  const repository = {
    findById: async () => null,
    createOnce: async (input) => {
      runtimeCallProof.assertRepositoryCall(repository);
      calls.push(input);
      const key = `${input.tenantId}:${input.operationId}`;
      if (!records.has(key)) {
        records.set(key, { id: `project-${records.size + 1}`, ...input });
      }
      return records.get(key);
    },
  };
  return {
    calls,
    records,
    repository,
  };
}

controlTest("authorized duplicate submissions create one scoped project", async () => {
  const state = createRepository();
  const service = new ProjectService({
    projects: state.repository,
    requestContext: {
      tenantId: "workspace-1",
      permissions: ["project:create"],
    },
  });

  const input = {
    name: "  Invoices  ",
    operationId: "operation-1",
    tenantId: "workspace-2",
    permissions: [],
  };
  const [first, retry] = await Promise.all([
    service.createProject(input),
    service.createProject(input),
  ]);

  assert.deepEqual(first, retry);
  assert.equal(state.records.size, 1);
  assert.deepEqual(state.calls, [
    { tenantId: "workspace-1", operationId: "operation-1", name: "Invoices" },
    { tenantId: "workspace-1", operationId: "operation-1", name: "Invoices" },
  ]);
});

controlTest("different operation identifiers create distinct scoped projects", async () => {
  const state = createRepository();
  const service = new ProjectService({
    projects: state.repository,
    requestContext: {
      tenantId: "workspace-1",
      permissions: ["project:create"],
    },
  });

  const first = await service.createProject({
    name: "Invoices",
    operationId: "operation-1",
  });
  const second = await service.createProject({
    name: "Receipts",
    operationId: "operation-2",
  });

  assert.notDeepEqual(first, second);
  assert.equal(state.records.size, 2);
  assert.deepEqual(state.calls, [
    { tenantId: "workspace-1", operationId: "operation-1", name: "Invoices" },
    { tenantId: "workspace-1", operationId: "operation-2", name: "Receipts" },
  ]);
});

controlTest("request context selects each workspace", async () => {
  const state = createRepository();
  const workspaceOneService = new ProjectService({
    projects: state.repository,
    requestContext: {
      tenantId: "workspace-1",
      permissions: ["project:create"],
    },
  });
  const workspaceTwoService = new ProjectService({
    projects: state.repository,
    requestContext: {
      tenantId: "workspace-2",
      permissions: ["project:create"],
    },
  });

  const first = await workspaceOneService.createProject({
    name: "Invoices",
    operationId: "operation-1",
  });
  const second = await workspaceTwoService.createProject({
    name: "Invoices",
    operationId: "operation-1",
  });

  assert.notDeepEqual(first, second);
  assert.equal(state.records.size, 2);
  assert.deepEqual(state.calls, [
    { tenantId: "workspace-1", operationId: "operation-1", name: "Invoices" },
    { tenantId: "workspace-2", operationId: "operation-1", name: "Invoices" },
  ]);
});

controlTest("unauthorized creation has no repository side effect", async () => {
  const state = createRepository();
  const service = new ProjectService({
    projects: state.repository,
    requestContext: { tenantId: "workspace-1", permissions: [] },
  });

  await assert.rejects(
    async () => service.createProject({
      name: "Invoices",
      operationId: "operation-1",
      tenantId: "workspace-1",
      permissions: ["project:create"],
    }),
    { code: "FORBIDDEN" },
  );
  assert.equal(state.calls.length, 0);
  assert.equal(state.records.size, 0);
});

controlTest("createProject inherits the existing input bounds", async () => {
  const state = createRepository();
  const service = new ProjectService({
    projects: state.repository,
    requestContext: {
      tenantId: "workspace-1",
      permissions: ["project:create"],
    },
  });

  await assert.rejects(
    async () => service.createProject({ name: "   ", operationId: "operation-1" }),
    RangeError,
  );
  await assert.rejects(
    async () => service.createProject({ name: "Invoices", operationId: "" }),
    TypeError,
  );
  await assert.rejects(
    async () => service.createProject({ name: "p".repeat(81), operationId: "operation-1" }),
    RangeError,
  );
  await assert.rejects(
    async () => service.createProject({ name: "Invoices", operationId: "o".repeat(129) }),
    TypeError,
  );
  assert.equal(state.calls.length, 0);
});

controlTest("the change adds no dependency", async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.deepEqual(packageJson.devDependencies ?? {}, {});
});

controlTest("existing project details keep their request-context scope", async () => {
  const calls = [];
  const projects = {
    findById: async (...args) => {
      calls.push(args);
      return { id: args[1] };
    },
    createOnce: async () => null,
  };
  const service = new ProjectService({
    projects,
    requestContext: { tenantId: "workspace-1", permissions: [] },
  });

  assert.deepEqual(await service.getProject("project-9"), { id: "project-9" });
  assert.deepEqual(calls, [["workspace-1", "project-9"]]);
});
