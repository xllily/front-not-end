import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createTracerSnapshot } from "./tracer-sandbox.mjs";

const execFile = promisify(execFileCallback);
const acceptancePath = fileURLToPath(new URL("./run-tracer-acceptance.mjs", import.meta.url));
const acceptanceUrl = pathToFileURL(acceptancePath).href;
const sandboxUrl = pathToFileURL(
  path.join(process.cwd(), "evals/harness/tracer-sandbox.mjs"),
).href;

test("preserves a partial snapshot failure when its cleanup also fails", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "front-not-end-partial-snapshot-"));
  const controlledTemp = await mkdtemp(path.join(tmpdir(), "front-not-end-locked-temp-"));
  const previousTemp = process.env.TMPDIR;
  try {
    await mkdir(path.join(workspace, "src"));
    await writeFile(path.join(workspace, "package.json"), '{"type":"module"}\n');
    await Promise.all(Array.from({ length: 100 }, (_value, index) =>
      writeFile(path.join(workspace, "src", `file-${String(index).padStart(3, "0")}.mjs`), "")
    ));
    await symlink("/tmp/agent-controlled", path.join(workspace, "src", "zz-escape"));
    process.env.TMPDIR = controlledTemp;

    const snapshotResult = createTracerSnapshot({
      controlEntries: ["package.json"],
      controlRoot: workspace,
      workspace,
    }).then(
      () => ({ error: null }),
      (error) => ({ error }),
    );

    const deadline = Date.now() + 2000;
    while (true) {
      const entries = await readdir(controlledTemp);
      if (entries.some((entry) => entry.startsWith("front-not-end-sandbox-"))) break;
      if (Date.now() >= deadline) throw new Error("Snapshot root was not created in time");
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    await chmod(controlledTemp, 0o555);
    const { error } = await snapshotResult;
    assert.match(error?.message ?? "", /unsupported symbolic link/u);
    assert.equal(error?.cleanupError?.code, "EACCES");
  } finally {
    if (previousTemp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTemp;
    await chmod(controlledTemp, 0o700);
    await rm(controlledTemp, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

test("pins cleanup to the verified endpoint and preserves the create failure", async () => {
  const fakeBin = await mkdtemp(path.join(tmpdir(), "front-not-end-fake-docker-"));
  try {
    const dockerPath = path.join(fakeBin, "docker");
    await writeFile(
      dockerPath,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== "--host" || args[1] !== "unix:///tmp/verified-docker.sock") {
  process.stderr.write("unpinned Docker endpoint\\n");
  process.exit(9);
}
if (args[2] === "create") {
  process.stderr.write("primary create failure\\n");
  process.exit(7);
}
if (args[2] === "rm") {
  process.stderr.write("secondary cleanup failure\\n");
  process.exit(8);
}
process.stderr.write("unexpected Docker operation\\n");
process.exit(10);
`,
      { mode: 0o755 },
    );
    await chmod(dockerPath, 0o755);
    const program = `
import { runTracerSandbox } from ${JSON.stringify(sandboxUrl)};
try {
  await runTracerSandbox({
    caseName: "test-case",
    challenge: "0123456789abcdef0123456789abcdef",
    control: "/tmp/control",
    controlTest: "acceptance.test.mjs",
    dockerEndpoint: "unix:///tmp/verified-docker.sock",
    inheritedEnvironment: {},
    timeoutMs: 1000,
    workspace: "/tmp/workspace",
  });
  process.exitCode = 2;
} catch (error) {
  process.stdout.write(JSON.stringify({
    cleanupStderr: error.cleanupError?.stderr ?? null,
    stderr: error.stderr ?? null,
  }));
}
`;
    const result = await execFile(
      process.execPath,
      ["--input-type=module", "--eval", program],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
      },
    );
    const failure = JSON.parse(result.stdout);

    assert.match(failure.stderr, /primary create failure/u);
    assert.match(failure.cleanupStderr, /secondary cleanup failure/u);
  } finally {
    await rm(fakeBin, { recursive: true, force: true });
  }
});

test("preserves timeout as primary when the emergency kill command fails", async () => {
  const fakeBin = await mkdtemp(path.join(tmpdir(), "front-not-end-fake-docker-"));
  try {
    const dockerPath = path.join(fakeBin, "docker");
    await writeFile(
      dockerPath,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== "--host" || args[1] !== "unix:///tmp/verified-docker.sock") {
  process.stderr.write("unpinned Docker endpoint\\n");
  process.exit(9);
}
if (args[2] === "create") {
  process.stdout.write("${"d".repeat(64)}\\n");
} else if (args[2] === "start") {
  setInterval(() => {}, 1000);
} else if (args[2] === "kill") {
  process.stderr.write("secondary kill failure\\n");
  process.exit(8);
} else if (args[2] === "rm") {
  process.exit(0);
} else {
  process.exit(10);
}
`,
      { mode: 0o755 },
    );
    await chmod(dockerPath, 0o755);
    const program = `
import { runTracerSandbox } from ${JSON.stringify(sandboxUrl)};
try {
  await runTracerSandbox({
    caseName: "test-case",
    challenge: "0123456789abcdef0123456789abcdef",
    control: "/tmp/control",
    controlTest: "acceptance.test.mjs",
    dockerEndpoint: "unix:///tmp/verified-docker.sock",
    inheritedEnvironment: {},
    timeoutMs: 25,
    workspace: "/tmp/workspace",
  });
  process.exitCode = 2;
} catch (error) {
  process.stdout.write(JSON.stringify({
    cleanupStderr: error.cleanupError?.stderr ?? null,
    code: error.code ?? null,
    signal: error.signal ?? null,
  }));
}
`;
    const result = await execFile(
      process.execPath,
      ["--input-type=module", "--eval", program],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
      },
    );
    const failure = JSON.parse(result.stdout);

    assert.equal(failure.code, "ETIMEDOUT");
    assert.equal(failure.signal, "SIGKILL");
    assert.match(failure.cleanupStderr, /secondary kill failure/u);
  } finally {
    await rm(fakeBin, { recursive: true, force: true });
  }
});

test("preserves output-limit failure when the emergency kill command fails", async () => {
  const fakeBin = await mkdtemp(path.join(tmpdir(), "front-not-end-fake-docker-"));
  try {
    const dockerPath = path.join(fakeBin, "docker");
    await writeFile(
      dockerPath,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== "--host" || args[1] !== "unix:///tmp/verified-docker.sock") process.exit(9);
if (args[2] === "create") {
  process.stdout.write("${"a".repeat(64)}\\n");
} else if (args[2] === "start") {
  process.stdout.write("x".repeat(1024 * 1024 + 65536));
  setInterval(() => {}, 1000);
} else if (args[2] === "kill") {
  process.stderr.write("secondary kill failure\\n");
  process.exit(8);
} else if (args[2] === "rm") {
  process.exit(0);
} else {
  process.exit(10);
}
`,
      { mode: 0o755 },
    );
    await chmod(dockerPath, 0o755);
    const program = `
import { runTracerSandbox } from ${JSON.stringify(sandboxUrl)};
try {
  await runTracerSandbox({
    caseName: "test-case",
    challenge: "0123456789abcdef0123456789abcdef",
    control: "/tmp/control",
    controlTest: "acceptance.test.mjs",
    dockerEndpoint: "unix:///tmp/verified-docker.sock",
    inheritedEnvironment: {},
    timeoutMs: 2000,
    workspace: "/tmp/workspace",
  });
  process.exitCode = 2;
} catch (error) {
  process.stdout.write(JSON.stringify({
    cleanupStderr: error.cleanupError?.stderr ?? null,
    code: error.code ?? null,
    signal: error.signal ?? null,
  }));
}
`;
    const result = await execFile(
      process.execPath,
      ["--input-type=module", "--eval", program],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
      },
    );
    const failure = JSON.parse(result.stdout);

    assert.equal(failure.code, "ERR_TRACER_OUTPUT_LIMIT");
    assert.equal(failure.signal, "SIGKILL");
    assert.match(failure.cleanupStderr, /secondary kill failure/u);
  } finally {
    await rm(fakeBin, { recursive: true, force: true });
  }
});

test("preserves the sandbox failure when snapshot disposal also fails", async () => {
  const fakeBin = await mkdtemp(path.join(tmpdir(), "front-not-end-fake-docker-"));
  const workspace = await mkdtemp(path.join(tmpdir(), "front-not-end-dispose-workspace-"));
  const stateRoot = path.join(fakeBin, "state");
  let snapshotRoot;
  try {
    await mkdir(stateRoot);
    await mkdir(path.join(workspace, "src"));
    await writeFile(path.join(workspace, "package.json"), '{"type":"module"}\n');
    await writeFile(path.join(workspace, "src", "project-service.mjs"), "export {};\n");
    const dockerPath = path.join(fakeBin, "docker");
    await writeFile(
      dockerPath,
      `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const stateRoot = process.env.FNE_FAKE_DOCKER_STATE;
const command = args[2];
if (args[0] !== "--host" || !stateRoot) process.exit(9);
if (command === "create") {
  const isPreflight = args.includes("--label=dev.front-not-end.preflight=true");
  const containerId = (isPreflight ? "e" : "f").repeat(64);
  fs.writeFileSync(path.join(stateRoot, containerId), JSON.stringify(args));
  if (!isPreflight) {
    const mount = args.find((argument) => argument.startsWith("--mount=") && argument.includes("dst=/workspace"));
    const snapshotWorkspace = mount.match(/(?:^|,)src=([^,]+)(?:,|$)/)[1];
    const snapshotRoot = path.dirname(snapshotWorkspace);
    fs.chmodSync(snapshotRoot, 0o555);
    fs.writeFileSync(path.join(stateRoot, "snapshot-root"), snapshotRoot);
  }
  process.stdout.write(containerId + "\\n");
} else if (command === "start") {
  const containerId = args.at(-1);
  if (containerId.startsWith("e")) {
    const created = JSON.parse(fs.readFileSync(path.join(stateRoot, containerId), "utf8"));
    const mount = created.find((argument) => argument.startsWith("--mount=") && argument.includes("dst=/preflight"));
    const markerRoot = mount.match(/(?:^|,)src=([^,]+)(?:,|$)/)[1];
    process.stdout.write(JSON.stringify({
      cgroupVersion: 2,
      cpu: { path: "/sys/fs/cgroup/cpu.max", value: "100000 100000" },
      marker: fs.readFileSync(path.join(markerRoot, "marker"), "utf8"),
      memory: { path: "/sys/fs/cgroup/memory.max", value: "268435456" },
      nodeVersion: "v22.23.2",
      pids: { path: "/sys/fs/cgroup/pids.max", value: "32" },
    }));
  } else {
    process.stderr.write("primary sandbox start failure\\n");
    process.exit(7);
  }
} else if (command === "rm") {
  process.exit(0);
} else {
  process.exit(10);
}
`,
      { mode: 0o755 },
    );
    await chmod(dockerPath, 0o755);

    const program = `
import { runTracerAcceptance } from ${JSON.stringify(acceptanceUrl)};
try {
  await runTracerAcceptance({ workspace: ${JSON.stringify(workspace)} });
  process.exitCode = 2;
} catch (error) {
  process.stdout.write(JSON.stringify({
    cleanupCode: error.cleanupError?.code ?? null,
    code: error.code ?? null,
    message: error.message,
  }));
}
`;
    const result = await execFile(
      process.execPath,
      ["--input-type=module", "--eval", program],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DOCKER_HOST: "unix:///tmp/verified-docker.sock",
          FNE_FAKE_DOCKER_STATE: stateRoot,
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    const failure = JSON.parse(result.stdout);

    assert.equal(failure.code, 7);
    assert.match(failure.message, /Tracer acceptance exited with code 7/u);
    assert.equal(failure.cleanupCode, "ERR_TRACER_SNAPSHOT_CLEANUP");
  } finally {
    try {
      snapshotRoot = (await readFile(path.join(stateRoot, "snapshot-root"), "utf8")).trim();
      await chmod(snapshotRoot, 0o700);
    } catch {}
    if (snapshotRoot) await rm(snapshotRoot, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});
