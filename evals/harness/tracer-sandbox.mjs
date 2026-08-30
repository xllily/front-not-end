import { execFile as execFileCallback, spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  opendir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const maxSnapshotBytes = 16 * 1024 * 1024;
const maxSnapshotEntries = 512;
const maxSnapshotFiles = 512;
const maxSnapshotDepth = 32;
const maxOutputBytes = 1024 * 1024;
const dockerControlTimeoutMs = 10_000;

export const tracerSandboxImage =
  "node:22.20.0-alpine@sha256:dbcedd8aeab47fbc0f4dd4bffa55b7c3c729a707875968d467aaaea42d6225af";

function snapshotError(kind, relativePath) {
  return new TypeError(`Tracer workspace contains unsupported ${kind}: ${relativePath}`);
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function recordSnapshotEntry(state, relativePath) {
  state.entries += 1;
  if (state.entries > maxSnapshotEntries) {
    throw snapshotError("excessive entry count", relativePath);
  }
}

async function createReadableDirectory(directoryPath) {
  await mkdir(directoryPath, { mode: 0o755, recursive: true });
  await chmod(directoryPath, 0o755);
}

async function readStableRegularFile(sourcePath, relativePath, state) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle = await open(sourcePath, constants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw snapshotError("non-regular file", relativePath);
    if (before.nlink !== 1) throw snapshotError("hard-linked file", relativePath);
    if (before.dev !== state.device) throw snapshotError("nested filesystem", relativePath);
    if (before.size > maxSnapshotBytes - state.bytes) {
      throw snapshotError("oversized content", relativePath);
    }

    const content = await handle.readFile();
    const after = await handle.stat();
    if (
      content.length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ino !== before.ino
    ) {
      throw snapshotError("concurrently modified file", relativePath);
    }

    state.bytes += content.length;
    state.files += 1;
    if (state.files > maxSnapshotFiles) {
      throw snapshotError("excessive file count", relativePath);
    }
    return content;
  } finally {
    await handle.close();
  }
}

async function copySnapshotEntry(sourcePath, destinationPath, relativePath, state, depth = 0) {
  if (depth > maxSnapshotDepth) {
    throw snapshotError("excessive directory depth", relativePath);
  }

  const sourceInfo = await lstat(sourcePath);
  if (sourceInfo.isSymbolicLink()) throw snapshotError("symbolic link", relativePath);
  if (sourceInfo.dev !== state.device) throw snapshotError("nested filesystem", relativePath);

  const canonicalSource = await realpath(sourcePath);
  if (!isContained(state.root, canonicalSource)) {
    throw snapshotError("path escape", relativePath);
  }

  if (sourceInfo.isDirectory()) {
    await createReadableDirectory(destinationPath);
    const directory = await opendir(sourcePath);
    const entries = [];
    for await (const entry of directory) {
      recordSnapshotEntry(state, path.join(relativePath, entry.name));
      entries.push(entry.name);
    }
    entries.sort((left, right) => left.localeCompare(right, "en"));
    for (const entryName of entries) {
      await copySnapshotEntry(
        path.join(sourcePath, entryName),
        path.join(destinationPath, entryName),
        path.join(relativePath, entryName),
        state,
        depth + 1,
      );
    }
    return;
  }

  if (!sourceInfo.isFile()) throw snapshotError("special file", relativePath);
  const content = await readStableRegularFile(sourcePath, relativePath, state);
  await writeFile(destinationPath, content, { mode: 0o444 });
  await chmod(destinationPath, 0o444);
}

async function createSnapshotTree(sourceRoot, destinationRoot, requestedEntries) {
  const canonicalRoot = await realpath(sourceRoot);
  const rootInfo = await lstat(canonicalRoot);
  const state = {
    bytes: 0,
    device: rootInfo.dev,
    entries: 0,
    files: 0,
    root: canonicalRoot,
  };
  await createReadableDirectory(destinationRoot);
  for (const entry of requestedEntries) {
    const sourceEntry = typeof entry === "string" ? entry : entry.source;
    const destinationEntry = typeof entry === "string" ? entry : entry.destination;
    const destinationPath = path.join(destinationRoot, destinationEntry);
    recordSnapshotEntry(state, sourceEntry);
    const destinationParent = path.dirname(destinationPath);
    const relativeParent = path.relative(destinationRoot, destinationParent);
    let currentParent = destinationRoot;
    for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
      currentParent = path.join(currentParent, segment);
      await createReadableDirectory(currentParent);
    }
    await copySnapshotEntry(
      path.join(canonicalRoot, sourceEntry),
      destinationPath,
      sourceEntry,
      state,
    );
  }
}

export async function createTracerSnapshot({ workspace, controlEntries, controlRoot }) {
  const snapshotRoot = await mkdtemp(path.join(tmpdir(), "front-not-end-sandbox-"));
  const workspaceSnapshot = path.join(snapshotRoot, "workspace");
  const controlSnapshot = path.join(snapshotRoot, "control");
  try {
    await createSnapshotTree(workspace, workspaceSnapshot, ["package.json", "src"]);
    await createSnapshotTree(controlRoot, controlSnapshot, controlEntries);
    return {
      control: controlSnapshot,
      dispose: () => rm(snapshotRoot, { recursive: true, force: true }),
      workspace: workspaceSnapshot,
    };
  } catch (error) {
    await rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

function outputError(message, { code, killed = false, signal = null, stderr, stdout }) {
  const error = new Error(message);
  error.code = code;
  error.killed = killed;
  error.signal = signal;
  error.stderr = stderr;
  error.stdout = stdout;
  return error;
}

function appendOutput(chunks, chunk, state) {
  state.bytes += chunk.length;
  if (state.bytes <= maxOutputBytes) chunks.push(chunk);
  return state.bytes <= maxOutputBytes;
}

async function ignoreMissingContainer(operation) {
  try {
    await operation();
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (!/No such container|is not running/u.test(output)) throw error;
  }
}

async function killContainer(containerId) {
  await ignoreMissingContainer(() => execFile(
    "docker",
    ["kill", "--signal=KILL", containerId],
    {
      encoding: "utf8",
      env: process.env,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024,
      timeout: dockerControlTimeoutMs,
    },
  ));
}

async function removeContainer(containerId, { confirmAbsent = false } = {}) {
  const retryDelays = confirmAbsent ? [0, 50, 100, 200, 400] : [0];
  for (const retryDelay of retryDelays) {
    if (retryDelay > 0) await delay(retryDelay);
    try {
      await execFile(
        "docker",
        ["rm", "--force", "--volumes", containerId],
        {
          encoding: "utf8",
          env: process.env,
          killSignal: "SIGKILL",
          maxBuffer: 64 * 1024,
          timeout: dockerControlTimeoutMs,
        },
      );
      return;
    } catch (error) {
      const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
      if (!/No such container/u.test(output)) throw error;
    }
  }
}

function startAttachedContainer(containerId, challenge, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["start", "--attach", "--interactive", containerId],
      { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutChunks = [];
    const stderrChunks = [];
    const stdoutState = { bytes: 0 };
    const stderrState = { bytes: 0 };
    let forcedReason = null;
    let killPromise = Promise.resolve();

    const forceStop = (reason) => {
      if (forcedReason) return;
      forcedReason = reason;
      child.kill("SIGKILL");
      killPromise = killContainer(containerId);
    };
    const timer = setTimeout(() => forceStop("timeout"), timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (!appendOutput(stdoutChunks, chunk, stdoutState)) forceStop("output limit");
    });
    child.stderr.on("data", (chunk) => {
      if (!appendOutput(stderrChunks, chunk, stderrState)) forceStop("output limit");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", async (code, signal) => {
      clearTimeout(timer);
      try {
        await killPromise;
      } catch (error) {
        reject(error);
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (forcedReason === "timeout") {
        reject(outputError(
          `Tracer acceptance timed out after ${timeoutMs}ms`,
          { code: "ETIMEDOUT", killed: true, signal: "SIGKILL", stderr, stdout },
        ));
        return;
      }
      if (forcedReason === "output limit") {
        reject(outputError(
          `Tracer acceptance exceeded the ${maxOutputBytes}-byte output limit`,
          { code: "ERR_TRACER_OUTPUT_LIMIT", killed: true, signal: "SIGKILL", stderr, stdout },
        ));
        return;
      }
      if (code !== 0) {
        reject(outputError(
          `Tracer acceptance exited with code ${code}`,
          { code, signal, stderr, stdout },
        ));
        return;
      }
      resolve({ stderr, stdout });
    });

    child.stdin.on("error", () => {});
    child.stdin.end(`${challenge}\n`);
  });
}

function localeValue(value, fallback) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.+:/-]{1,128}$/u.test(value)) return fallback;
  return value;
}

export async function runTracerSandbox({
  caseName,
  challenge,
  control,
  controlTest,
  inheritedEnvironment,
  timeoutMs,
  workspace,
}) {
  for (const mountPath of [control, workspace]) {
    if (mountPath.includes(",")) {
      throw new TypeError("Tracer sandbox paths cannot contain commas");
    }
  }
  if (typeof controlTest !== "string") {
    throw new TypeError("Tracer control test must stay inside the control mount");
  }
  const normalizedControlTest = path.posix.normalize(controlTest);
  if (
    normalizedControlTest === "." ||
    normalizedControlTest === ".." ||
    normalizedControlTest.startsWith("../") ||
    path.posix.isAbsolute(normalizedControlTest)
  ) {
    throw new TypeError("Tracer control test must stay inside the control mount");
  }
  const controlTestPath = path.posix.join("/control", normalizedControlTest);

  const containerName = `front-not-end-tracer-${challenge.slice(0, 16)}`;
  const createArguments = [
    "create",
    "--pull=never",
    `--name=${containerName}`,
    "--init",
    "--interactive",
    "--network=none",
    "--ipc=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--pids-limit=32",
    "--memory=256m",
    "--memory-swap=256m",
    "--cpus=1",
    "--ulimit=nofile=256:256",
    "--user=65532:65532",
    "--hostname=front-not-end-sandbox",
    "--workdir=/workspace",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
    "--label=dev.front-not-end.tracer=true",
    `--label=dev.front-not-end.case=${caseName}`,
    `--mount=type=bind,src=${workspace},dst=/workspace,readonly`,
    `--mount=type=bind,src=${control},dst=/control,readonly`,
    "--env=FRONT_NOT_END_WORKSPACE=/workspace",
    `--env=LANG=${localeValue(inheritedEnvironment.LANG, "C.UTF-8")}`,
    `--env=LC_ALL=${localeValue(inheritedEnvironment.LC_ALL, "C.UTF-8")}`,
    `--env=TZ=${localeValue(inheritedEnvironment.TZ, "UTC")}`,
    "--env=HOME=/tmp",
    tracerSandboxImage,
    "node",
    "--disable-warning=ExperimentalWarning",
    "--disallow-code-generation-from-strings",
    "--frozen-intrinsics",
    "--permission",
    "--allow-fs-read=/workspace",
    "--allow-fs-read=/control/harness/runtime-call-proof.mjs",
    controlTestPath,
  ];

  let createAttempted = false;
  let containerId;
  try {
    createAttempted = true;
    const created = await execFile("docker", createArguments, {
      encoding: "utf8",
      env: process.env,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024,
    });
    containerId = created.stdout.trim();
    if (!/^[0-9a-f]{64}$/u.test(containerId)) {
      throw new Error("Docker did not return a valid tracer sandbox container ID");
    }
    return await startAttachedContainer(containerId, challenge, timeoutMs);
  } catch (error) {
    if (/^[0-9a-f]{64}$/u.test(containerId)) error.sandboxContainerId = containerId;
    if (/No such image|Unable to find image/u.test(`${error.stderr ?? ""}\n${error.message}`)) {
      error.message =
        `Pinned tracer sandbox image is unavailable. Run: docker pull ${tracerSandboxImage}`;
    }
    throw error;
  } finally {
    if (createAttempted) {
      const hasExactId = /^[0-9a-f]{64}$/u.test(containerId);
      await removeContainer(hasExactId ? containerId : containerName, {
        confirmAbsent: !hasExactId,
      });
    }
  }
}

export function escapeTerminalText(value) {
  return String(value).replace(
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
    (character) => `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`,
  );
}
