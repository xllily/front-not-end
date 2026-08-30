import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { runTracerAcceptance } from "./run-tracer-acceptance.mjs";
import { createTracerSnapshot } from "./tracer-sandbox.mjs";

const execFile = promisify(execFileCallback);
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

async function installAssertTamperingService(workspace) {
  const source = `import agentAssert from "node:assert/strict";

agentAssert.deepEqual = () => {};
agentAssert.equal = () => {};
agentAssert.match = () => {};
agentAssert.rejects = async () => {};

export class ProjectService {
  async getProject() {
    return { id: "wrong-project" };
  }

  async listProjects() {
    return { items: [], nextCursor: null };
  }
}
`;
  await writeFile(path.join(workspace, "src", "project-service.mjs"), source);
}

async function installStackForgingListService(workspace) {
  const source = `try {
  Error.prepareStackTrace = () => "platform-query-page.mjs";
} catch {}

function decodeCursor(cursor) {
  if (cursor == null) return null;
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some((value) => typeof value !== "string")) {
    throw new TypeError("Invalid cursor");
  }
  return { createdAt: parsed[0], id: parsed[1] };
}

export class ProjectService {
  constructor({ projects, requestContext }) {
    this.projects = projects;
    this.requestContext = requestContext;
  }

  async getProject(projectId) {
    return this.projects.findById(this.requestContext.tenantId, projectId);
  }

  async listProjects({ query = null, cursor = null, limit = 25 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Invalid page size");
    const { items, next = null } = await this.projects.queryPage({
      tenantId: this.requestContext.tenantId,
      query,
      after: decodeCursor(cursor),
      limit,
    });
    const nextCursor = next == null
      ? null
      : Buffer.from(JSON.stringify([next.createdAt, next.id]), "utf8").toString("base64url");
    return { items, nextCursor };
  }
}
`;
  await writeFile(path.join(workspace, "src", "project-service.mjs"), source);
}

async function installSourceUrlForgingProjectCreateService(workspace) {
  const source = `function forbidden() {
  const error = new Error("Project creation is not allowed");
  error.code = "FORBIDDEN";
  return error;
}

export class ProjectService {
  constructor({ projects, requestContext }) {
    this.projects = projects;
    this.requestContext = requestContext;
  }

  async getProject(projectId) {
    return this.projects.findById(this.requestContext.tenantId, projectId);
  }

  createProject({ name, operationId } = {}) {
    if (!this.requestContext.permissions.includes("project:create")) throw forbidden();
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
      throw new RangeError("Invalid project name");
    }
    if (typeof operationId !== "string" || operationId.length < 1 || operationId.length > 128) {
      throw new TypeError("Invalid operation identifier");
    }
    return this.projects.createOnce({
      tenantId: this.requestContext.tenantId,
      operationId,
      name: name.trim(),
    });
  }
}

//# sourceURL=file:///workspace/src/platform-create-project.mjs
`;
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

test("denies Agent-produced code access to host network services", async () => {
  const workspace = await createWorkspace();
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.end("control-only");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    await installSolvedService(
      workspace,
      `await fetch("http://127.0.0.1:${port}/control-canary");\n`,
    );

    await assert.rejects(
      runTracerAcceptance({ workspace }),
      (error) => /fetch failed|ECONNREFUSED|ENETUNREACH|EPERM/u.test(
        `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      ),
    );
    assert.equal(requests, 0);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("rejects descendant symlinks before Agent-produced code starts", async () => {
  const workspace = await createWorkspace();
  const outsidePath = path.join(path.dirname(workspace), "front-not-end-symlink-canary.txt");
  await writeFile(outsidePath, "control-only");
  try {
    await symlink(outsidePath, path.join(workspace, "src", "host-control-canary.txt"));
    await installSolvedService(
      workspace,
      'import { readFileSync as readControlCanary } from "node:fs";\n' +
        'readControlCanary(new URL("./host-control-canary.txt", import.meta.url), "utf8");\n',
    );

    await assert.rejects(
      runTracerAcceptance({ workspace }),
      /unsupported symbolic link/u,
    );
    assert.equal(await readFile(outsidePath, "utf8"), "control-only");
  } finally {
    await rm(outsidePath, { force: true });
  }
});

test("rejects a zero exit before the control tests complete", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(workspace, "process.exit(0);\n");

  await assert.rejects(
    runTracerAcceptance({ workspace }),
    /did not complete all control tests/u,
  );
});

test("rejects Agent-produced attempts to replace control assertions", async () => {
  const workspace = await createWorkspace();
  await installAssertTamperingService(workspace);

  await assert.rejects(
    runTracerAcceptance({ workspace }),
    (error) => error.code !== 0 && /deepEqual|read only|not extensible/u.test(error.stderr),
  );
});

test("rejects forged platform reuse through Error.prepareStackTrace", async () => {
  const workspace = await createWorkspace();
  await installStackForgingListService(workspace);

  await assert.rejects(
    runTracerAcceptance({ workspace }),
    (error) => error.code === 1 && /runtime path proof/u.test(
      `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
    ),
  );
});

test("rejects forged platform reuse through a sourceURL", async () => {
  const workspace = await createProjectCreateWorkspace();
  await installSourceUrlForgingProjectCreateService(workspace);

  await assert.rejects(
    runTracerAcceptance({
      workspace,
      caseName: "project-create-authorization",
    }),
    (error) => error.code === 1 && /runtime path proof/u.test(
      `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
    ),
  );
});

test("keeps the completion challenge out of Agent-visible module identities", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(
    workspace,
    `import { writeSync } from "node:fs";
const resolvedHelperURL = import.meta.resolve("./platform-query-page.mjs");
const leakedChallenge = resolvedHelperURL.match(/[0-9a-f]{64}/u)?.[0];
if (!leakedChallenge) throw new Error("completion challenge unavailable");
writeSync(1, \`\\nFRONT_NOT_END_ACCEPTANCE_COMPLETED \${leakedChallenge} 4\\n\`);
process.exit(0);
`,
  );

  await assert.rejects(
    runTracerAcceptance({ workspace }),
    (error) => {
      assert.notEqual(error.code, 0);
      assert.match(
        `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
        /completion challenge unavailable/u,
      );
      return true;
    },
  );
});

test("blocks sensitive built-ins through non-workspace module relays", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(
    workspace,
    `const relayURL = "data:text/javascript," + encodeURIComponent(
  'export { registerHooks } from "node:module";',
);
await import(relayURL);
throw new Error("module relay escaped");
`,
  );

  await assert.rejects(
    runTracerAcceptance({ workspace }),
    (error) => {
      assert.notEqual(error.code, 0);
      assert.match(
        `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
        /Agent modules cannot import node:module/u,
      );
      return true;
    },
  );
});

test("blocks ambient CommonJS access to the module hook API", async () => {
  const workspace = await createWorkspace();
  await writeFile(
    path.join(workspace, "src", "module-relay.cjs"),
    `if (typeof module.constructor.registerHooks === "function") {
  throw new Error("CommonJS module hook escaped");
}
`,
  );
  await installSolvedService(workspace, 'await import("./module-relay.cjs");\n');

  await assert.rejects(
    runTracerAcceptance({ workspace }),
    (error) => {
      assert.notEqual(error.code, 0);
      assert.match(
        `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
        /Agent workspace cannot load CommonJS modules/u,
      );
      return true;
    },
  );
});

test("rejects excessive snapshot entries before sandbox execution", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(workspace);
  await Promise.all(Array.from(
    { length: 513 },
    (_value, index) => mkdir(path.join(workspace, "src", `empty-${index}`)),
  ));

  await assert.rejects(
    runTracerAcceptance({ workspace }),
    /excessive entry count/u,
  );
});

test("makes snapshots readable by the fixed container user under a restrictive umask", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(workspace);
  const previousUmask = process.umask(0o077);
  let snapshot;
  try {
    snapshot = await createTracerSnapshot({
      controlEntries: [
        "fixtures/existing-list-search-reuse/acceptance/list-projects.test.mjs",
        "harness/runtime-call-proof.mjs",
      ],
      controlRoot: fileURLToPath(new URL("../", import.meta.url)),
      workspace,
    });

    const pathsAndModes = [
      [snapshot.workspace, 0o755],
      [path.join(snapshot.workspace, "src"), 0o755],
      [path.join(snapshot.workspace, "src", "project-service.mjs"), 0o444],
      [path.join(snapshot.control, "fixtures"), 0o755],
      [
        path.join(
          snapshot.control,
          "fixtures/existing-list-search-reuse/acceptance/list-projects.test.mjs",
        ),
        0o444,
      ],
    ];
    for (const [snapshotPath, expectedMode] of pathsAndModes) {
      const info = await stat(snapshotPath);
      assert.equal(info.mode & 0o777, expectedMode, snapshotPath);
    }
  } finally {
    process.umask(previousUmask);
    await snapshot?.dispose();
  }
});

test("escapes terminal control sequences from Agent-produced output", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(
    workspace,
    'process.stdout.write("\\u001b]52;c;dGVzdA==\\u0007\\u001b[2J\\runsafe\\b\\u009b");\n',
  );

  const result = await runTracerAcceptance({ workspace });

  assert.doesNotMatch(result.stdout, /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u);
  assert.match(result.stdout, /\\u001b/u);
});

test("force-kills a sandbox that ignores graceful termination", async () => {
  const workspace = await createWorkspace();
  await installSolvedService(
    workspace,
    'process.on("SIGTERM", () => {});\n' +
      'setInterval(() => {}, 1_000);\n' +
      'await new Promise(() => {});\n',
  );
  const startedAt = Date.now();
  let timeoutError;

  await assert.rejects(
    runTracerAcceptance({ workspace, timeoutMs: 250 }),
    (error) => {
      timeoutError = error;
      return error.code === "ETIMEDOUT" && error.signal === "SIGKILL";
    },
  );

  assert.ok(Date.now() - startedAt < 5_000);
  assert.match(timeoutError.sandboxContainerId, /^[0-9a-f]{64}$/u);
  const containers = await execFile(
    "docker",
    ["ps", "--all", "--quiet", "--filter", `id=${timeoutError.sandboxContainerId}`],
    { encoding: "utf8" },
  );
  assert.equal(containers.stdout.trim(), "");
});

test("escapes control sequences in rejected case names", async () => {
  const workspace = await createWorkspace();
  let rejectedError;

  await assert.rejects(
    runTracerAcceptance({ workspace, caseName: "unknown\u001b[2J\r" }),
    (error) => {
      rejectedError = error;
      return /Unknown tracer case/u.test(error.message);
    },
  );

  assert.doesNotMatch(
    rejectedError.message,
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u,
  );
  assert.match(rejectedError.message, /\\u001b/u);
});
