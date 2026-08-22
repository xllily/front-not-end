import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const workspace = process.env.FRONT_NOT_END_WORKSPACE;
if (!workspace) {
  throw new Error("FRONT_NOT_END_WORKSPACE must point to the completed tracer workspace");
}

const projectServicePath = path.join(workspace, "src", "project-service.mjs");
const packagePath = path.join(workspace, "package.json");
const { ProjectService } = await import(pathToFileURL(projectServicePath));

test("listProjects uses request-context scope and stable consecutive pages", async () => {
  const repositoryCalls = [];
  const secondPageKey = {
    createdAt: "2026-08-20T00:00:00.000Z",
    id: "project-2",
  };
  const projects = {
    findById: async () => null,
    queryPage: async (input) => {
      assert.match(new Error().stack, /platform-query-page\.mjs/u);
      repositoryCalls.push(input);
      if (input.after === null) {
        return {
          items: [{ id: "project-3" }, { id: "project-2" }],
          next: secondPageKey,
        };
      }
      return { items: [{ id: "project-1" }], next: null };
    },
  };
  const service = new ProjectService({
    projects,
    requestContext: { tenantId: "workspace-1" },
  });

  const first = await service.listProjects({
    query: "invoice",
    limit: 2,
    tenantId: "workspace-2",
  });
  const second = await service.listProjects({
    query: "invoice",
    limit: 2,
    cursor: first.nextCursor,
  });

  assert.deepEqual(
    [...first.items, ...second.items].map(({ id }) => id),
    ["project-3", "project-2", "project-1"],
  );
  assert.equal(new Set([...first.items, ...second.items].map(({ id }) => id)).size, 3);
  assert.deepEqual(repositoryCalls, [
    {
      tenantId: "workspace-1",
      query: "invoice",
      after: null,
      limit: 2,
    },
    {
      tenantId: "workspace-1",
      query: "invoice",
      after: secondPageKey,
      limit: 2,
    },
  ]);
});

test("listProjects inherits the existing cursor and page-size validation", async () => {
  const service = new ProjectService({
    projects: { queryPage: async () => ({ items: [], next: null }) },
    requestContext: { tenantId: "workspace-1" },
  });

  await assert.rejects(() => service.listProjects({ limit: 101 }), RangeError);
  await assert.rejects(() => service.listProjects({ cursor: "not-a-cursor" }));
});

test("the change adds no dependency", async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.deepEqual(packageJson.devDependencies ?? {}, {});
});

test("existing project details keep their request-context scope", async () => {
  const calls = [];
  const projects = {
    findById: async (...args) => {
      calls.push(args);
      return { id: args[1] };
    },
    queryPage: async () => ({ items: [], next: null }),
  };
  const service = new ProjectService({
    projects,
    requestContext: { tenantId: "workspace-1" },
  });

  assert.deepEqual(await service.getProject("project-9"), { id: "project-9" });
  assert.deepEqual(calls, [["workspace-1", "project-9"]]);
});
