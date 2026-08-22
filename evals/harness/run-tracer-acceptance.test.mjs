import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runTracerAcceptance } from "./run-tracer-acceptance.mjs";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/existing-list-search-reuse/seed/", import.meta.url),
);
const projectCreateFixtureRoot = fileURLToPath(
  new URL("../fixtures/project-create-authorization/seed/", import.meta.url),
);
const workspaces = [];

async function createWorkspace() {
  const workspace = await mkdtemp(path.join(tmpdir(), "front-not-end-tracer-"));
  workspaces.push(workspace);
  await cp(fixtureRoot, workspace, { recursive: true });
  return workspace;
}

async function installSolvedService(workspace, prefix = "") {
  const platformSource = `export function encodeCursor({ createdAt, id }) {
  return Buffer.from(JSON.stringify([createdAt, id]), "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
  if (cursor == null) return null;
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some((value) => typeof value !== "string")) {
    throw new TypeError("Invalid cursor");
  }
  return { createdAt: parsed[0], id: parsed[1] };
}

export async function queryPage(repository, tenantId, { query = null, cursor = null, limit = 25 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Invalid page size");
  const { items, next = null } = await repository.queryPage({
    tenantId,
    query,
    after: decodeCursor(cursor),
    limit,
  });
  return { items, nextCursor: next == null ? null : encodeCursor(next) };
}
`;
  const source = `${prefix}import { queryPage } from "./platform-query-page.mjs";

export class ProjectService {
  constructor({ projects, requestContext }) {
    this.projects = projects;
    this.requestContext = requestContext;
  }

  async getProject(projectId) {
    return this.projects.findById(this.requestContext.tenantId, projectId);
  }

  async listProjects(input = {}) {
    return queryPage(this.projects, this.requestContext.tenantId, input);
  }
}
`;
  await writeFile(path.join(workspace, "src", "platform-query-page.mjs"), platformSource);
  await writeFile(path.join(workspace, "src", "project-service.mjs"), source);
}

async function createProjectCreateWorkspace() {
  const workspace = await mkdtemp(path.join(tmpdir(), "front-not-end-project-create-tracer-"));
  workspaces.push(workspace);
  await cp(projectCreateFixtureRoot, workspace, { recursive: true });
  return workspace;
}

async function installSolvedProjectCreateService(workspace) {
  const source = `import { createProject as createPlatformProject } from "./platform-create-project.mjs";

export class ProjectService {
  constructor({ projects, requestContext }) {
    this.projects = projects;
    this.requestContext = requestContext;
  }

  async getProject(projectId) {
    return this.projects.findById(this.requestContext.tenantId, projectId);
  }

  createProject(input) {
    return createPlatformProject(this.projects, this.requestContext, input);
  }
}
`;
  await writeFile(path.join(workspace, "src", "project-service.mjs"), source);
}

async function installAsyncSolvedProjectCreateService(workspace) {
  const source = `import { createProject as createPlatformProject } from "./platform-create-project.mjs";

export class ProjectService {
  constructor({ projects, requestContext }) {
    this.projects = projects;
    this.requestContext = requestContext;
  }

  async getProject(projectId) {
    return this.projects.findById(this.requestContext.tenantId, projectId);
  }

  async createProject(input) {
    return createPlatformProject(this.projects, this.requestContext, input);
  }
}
`;
  await writeFile(path.join(workspace, "src", "project-service.mjs"), source);
}

async function installCollapsingOperationProjectCreateService(workspace) {
  const source = `import { createProject as createPlatformProject } from "./platform-create-project.mjs";

export class ProjectService {
  constructor({ projects, requestContext }) {
    this.projects = projects;
    this.requestContext = requestContext;
  }

  async getProject(projectId) {
    return this.projects.findById(this.requestContext.tenantId, projectId);
  }

  createProject(input) {
    const operationId =
      typeof input?.operationId === "string" &&
      input.operationId.length >= 1 &&
      input.operationId.length <= 128
        ? "operation-1"
        : input?.operationId;
    return createPlatformProject(this.projects, this.requestContext, {
      ...input,
      operationId,
    });
  }
}
`;
  await writeFile(path.join(workspace, "src", "project-service.mjs"), source);
}

async function installHardCodedWorkspaceProjectCreateService(workspace) {
  const source = `import { createProject as createPlatformProject } from "./platform-create-project.mjs";

export class ProjectService {
  constructor({ projects, requestContext }) {
    this.projects = projects;
    this.requestContext = requestContext;
  }

  async getProject(projectId) {
    return this.projects.findById(this.requestContext.tenantId, projectId);
  }

  createProject(input) {
    return createPlatformProject(
      this.projects,
      { ...this.requestContext, tenantId: "workspace-1" },
      input,
    );
  }
}
`;
  await writeFile(path.join(workspace, "src", "project-service.mjs"), source);
}

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })),
  );
});

test("accepts a solution that uses the existing scoped paging capability", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(workspace);

  const result = await runTracerAcceptance({ workspace });

  assert.match(result.stdout, /stable consecutive pages/u);
  assert.doesNotMatch(result.stdout, /not ok/u);
});

test("rejects the unchanged seed", async () => {
  const workspace = await createWorkspace();

  await assert.rejects(
    runTracerAcceptance({ workspace }),
    (error) =>
      error.code === 1 && /listProjects/u.test(`${error.stdout}\n${error.stderr}`),
  );
});

test("accepts a project create solution that reuses authorization and idempotency", async () => {
  const workspace = await createProjectCreateWorkspace();
  await installSolvedProjectCreateService(workspace);

  const result = await runTracerAcceptance({
    workspace,
    caseName: "project-create-authorization",
  });

  assert.match(result.stdout, /authorized duplicate submissions/u);
  assert.doesNotMatch(result.stdout, /not ok/u);
});

test("accepts an async project create service", async () => {
  const workspace = await createProjectCreateWorkspace();
  await installAsyncSolvedProjectCreateService(workspace);

  const result = await runTracerAcceptance({
    workspace,
    caseName: "project-create-authorization",
  });

  assert.match(result.stdout, /authorized duplicate submissions/u);
  assert.doesNotMatch(result.stdout, /not ok/u);
});

test("rejects a service that collapses distinct operation identifiers", async () => {
  const workspace = await createProjectCreateWorkspace();
  await installCollapsingOperationProjectCreateService(workspace);

  await assert.rejects(
    runTracerAcceptance({
      workspace,
      caseName: "project-create-authorization",
    }),
    (error) =>
      error.code === 1 &&
      /different operation identifiers/u.test(`${error.stdout}\n${error.stderr}`),
  );
});

test("rejects a service that hard-codes the workspace", async () => {
  const workspace = await createProjectCreateWorkspace();
  await installHardCodedWorkspaceProjectCreateService(workspace);

  await assert.rejects(
    runTracerAcceptance({
      workspace,
      caseName: "project-create-authorization",
    }),
    (error) =>
      error.code === 1 &&
      /request context selects each workspace/u.test(`${error.stdout}\n${error.stderr}`),
  );
});

test("rejects the unchanged project create seed", async () => {
  const workspace = await createProjectCreateWorkspace();

  await assert.rejects(
    runTracerAcceptance({ workspace, caseName: "project-create-authorization" }),
    (error) =>
      error.code === 1 && /createProject/u.test(`${error.stdout}\n${error.stderr}`),
  );
});

test("rejects tracer cases outside the acceptance allowlist", async () => {
  const workspace = await createWorkspace();

  await assert.rejects(
    runTracerAcceptance({ workspace, caseName: "../../control" }),
    /Unknown tracer case/u,
  );
});

test("does not pass control secrets to Agent-produced code", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(
    workspace,
    'if (process.env.FNE_CONTROL_SECRET) throw new Error("control secret leaked");\n',
  );

  await runTracerAcceptance({
    workspace,
    inheritedEnvironment: { FNE_CONTROL_SECRET: "should-not-cross" },
  });
});

test("denies Agent-produced code access outside the completed workspace", async () => {
  const workspace = await createWorkspace();
  const outsidePath = path.join(path.dirname(workspace), "front-not-end-control-canary.txt");
  await writeFile(outsidePath, "control-only");
  try {
    await installSolvedService(
      workspace,
      `import { readFileSync } from "node:fs";\nreadFileSync(${JSON.stringify(outsidePath)});\n`,
    );

    await assert.rejects(
      runTracerAcceptance({ workspace }),
      (error) => /ERR_ACCESS_DENIED|Access to this API has been restricted/u.test(error.stderr),
    );
    assert.equal(await readFile(outsidePath, "utf8"), "control-only");
  } finally {
    await rm(outsidePath, { force: true });
  }
});
