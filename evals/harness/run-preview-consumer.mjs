#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";

import { verifyObservation } from "../fixtures/real-consumer-contract-slice/acceptance/consumer-control.mjs";
import { runTracerPreflight } from "./tracer-preflight.mjs";
import {
  createTracerSnapshot,
  escapeTerminalText,
  tracerSandboxImage,
  tracerSandboxResourceArguments,
} from "./tracer-sandbox.mjs";

const execFile = promisify(execFileCallback);
const evalsRoot = fileURLToPath(new URL("../", import.meta.url));
const caseName = "real-consumer-contract-slice";
const controlEntry = `fixtures/${caseName}/acceptance/consumer-control.mjs`;
const handlerEntry = `fixtures/${caseName}/acceptance/preview-handler.mjs`;
const receiptPrefix = "FRONT_NOT_END_PREVIEW_CONSUMER_COMPLETED";

export const previewConsumerDependency = Object.freeze({
  version: "2.1.293",
  platform: "linux-arm64-musl",
  bytes: 244463424,
  sha256: "00755ae106b6925c1adb2b17e4c6d9b0c41eb4cc55bcad3581345b0aa3176c85",
  source: "https://github.com/anthropics/claude-code/releases/download/v2.1.293/claude-linux-arm64-musl.tar.gz",
});

function consumerError(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function verifyPreviewBinary(cliPath) {
  if (typeof cliPath !== "string" || cliPath.length === 0) {
    throw consumerError("ERR_PREVIEW_DEPENDENCY", "Supply --cli with the verified 2.1.293 Linux arm64-musl executable.");
  }
  const before = await lstat(cliPath);
  if (!before.isFile() || before.nlink !== 1 || before.size !== previewConsumerDependency.bytes || !(before.mode & 0o111)) {
    throw consumerError("ERR_PREVIEW_DEPENDENCY", "The consumer must be the exact regular, single-link 2.1.293 executable.");
  }
  const canonical = await realpath(cliPath);
  if (canonical.includes(",")) throw consumerError("ERR_PREVIEW_DEPENDENCY", "Consumer paths cannot contain commas.");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(canonical)) hash.update(chunk);
  const after = await lstat(cliPath);
  if (
    before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
    hash.digest("hex") !== previewConsumerDependency.sha256
  ) {
    throw consumerError("ERR_PREVIEW_DEPENDENCY", "Consumer bytes changed or do not match the pinned official executable SHA256.");
  }
  return canonical;
}

async function hashTree(root, entries) {
  const hash = createHash("sha256");
  const visit = async (relative) => {
    const target = path.join(root, relative);
    const info = await lstat(target);
    if (info.isDirectory()) {
      for (const name of (await readdir(target)).sort()) await visit(path.join(relative, name));
    } else {
      assert.ok(info.isFile() && !info.isSymbolicLink());
      hash.update(`${relative}\0`);
      hash.update(await readFile(target));
      hash.update("\0");
    }
  };
  for (const entry of entries) await visit(entry);
  return hash.digest("hex");
}

function defaultDockerCommand(args, options) {
  return execFile("docker", args, {
    encoding: "utf8", env: process.env, killSignal: "SIGKILL", ...options,
  });
}

export async function runPreviewContainer({
  endpoint, cliPath, snapshot, challenge, timeoutMs = 50_000,
  dockerCommand = defaultDockerCommand,
}) {
  if (typeof endpoint !== "string" || (!/^unix:\/\/\/[^\r\n?#]+$/u.test(endpoint) && !endpoint.startsWith("npipe:////./pipe/"))) {
    throw consumerError("ERR_PREVIEW_ENDPOINT", "A verified local Docker endpoint is required.");
  }
  if (!/^[a-f0-9]{64}$/u.test(challenge)) throw new TypeError("A private completion challenge is required.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new RangeError("Consumer timeout must be from 1 to 60000 milliseconds.");
  }
  for (const value of [cliPath, snapshot.workspace, snapshot.control]) {
    if (typeof value !== "string" || !path.isAbsolute(value) || value.includes(",")) throw new TypeError("Consumer mounts must be fixed absolute paths without commas.");
  }
  const name = `front-not-end-consumer-${challenge.slice(0, 16)}`;
  const docker = (args, timeout = 10_000, maxBuffer = 64 * 1024) =>
    dockerCommand(["--host", endpoint, ...args], { timeout, maxBuffer });
  let id;
  let primaryError;
  try {
    const created = await docker([
      "create", "--pull=never", `--name=${name}`, "--init", "--network=none", "--ipc=none", "--read-only",
      "--cap-drop=ALL", "--security-opt=no-new-privileges=true", ...tracerSandboxResourceArguments,
      "--ulimit=nofile=256:256", "--user=65532:65532", "--workdir=/workspace",
      "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
      "--label=dev.front-not-end.consumer=true", `--label=dev.front-not-end.case=${caseName}`,
      `--mount=type=bind,src=${cliPath},dst=/cli/claude,readonly`,
      `--mount=type=bind,src=${snapshot.workspace},dst=/workspace,readonly`,
      `--mount=type=bind,src=${snapshot.control},dst=/control,readonly`,
      "--env=HOME=/tmp", "--env=LANG=C.UTF-8", "--env=TZ=UTC", "--env=UV_THREADPOOL_SIZE=1",
      `--env=FNE_PREVIEW_COMPLETION_CHALLENGE=${challenge}`,
      tracerSandboxImage, "node", "--disable-sigusr1", "--v8-pool-size=1", `/control/${controlEntry}`,
    ]);
    id = created.stdout.trim();
    if (!/^[a-f0-9]{64}$/u.test(id)) throw consumerError("ERR_PREVIEW_CONTAINER", "Docker did not return an exact consumer container ID.");
    return await docker(["start", "--attach", id], timeoutMs, 1024 * 1024);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError;
    const target = /^[a-f0-9]{64}$/u.test(id ?? "") ? id : name;
    for (const delay of id ? [0] : [0, 50, 100, 200, 400]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await docker(["rm", "--force", "--volumes", target]);
        cleanupError = null;
        break;
      } catch (error) {
        cleanupError = /No such container/u.test(`${error.stderr ?? ""}\n${error.message}`) ? null : error;
        if (id && !cleanupError) break;
      }
    }
    if (cleanupError) {
      if (primaryError) primaryError.cleanupError = cleanupError;
      else throw consumerError("ERR_PREVIEW_CLEANUP", "The exact consumer test container could not be removed.");
    }
  }
}

export function parsePreviewConsumerOutput(stdout, challenge) {
  const lines = stdout.trim().split(/\r?\n/u);
  let observation;
  try { observation = JSON.parse(lines[0]); } catch {
    throw consumerError("ERR_PREVIEW_INCOMPLETE", "Consumer control did not return a complete observation.");
  }
  if (observation?.status !== "PASS") {
    if (!["FAIL", "SKIP", "UNVERIFIED"].includes(observation?.status)) {
      throw consumerError("ERR_PREVIEW_INCOMPLETE", "Consumer control returned an unknown result.");
    }
    return observation;
  }
  if (lines.length !== 2 || lines[1] !== `${receiptPrefix} ${challenge}`) {
    throw consumerError("ERR_PREVIEW_INCOMPLETE", "Consumer control did not return its unique challenge-bound completion receipt.");
  }
  verifyObservation(observation);
  return observation;
}

export function classifyPreviewPreflightError(error) {
  const code = error?.code ?? "ERR_PREVIEW_PREFLIGHT";
  const cleanupError = error?.cleanupError;
  const markerCleanupError = error?.markerCleanupError ?? cleanupError?.markerCleanupError;
  const cleanupFailed = Boolean(
    cleanupError || markerCleanupError ||
    code === "ERR_TRACER_PREFLIGHT_CLEANUP" || code === "ERR_TRACER_PREFLIGHT_MARKER_CLEANUP"
  );
  const unavailable = [
    "ERR_TRACER_PREFLIGHT_DOCKER", "ERR_TRACER_PREFLIGHT_IMAGE",
    "ERR_TRACER_PREFLIGHT_ENDPOINT", "ERR_TRACER_PREFLIGHT_SETUP",
  ].includes(code);
  const diagnostic = (failure) => ({
    code: failure?.code ?? "ERR_PREVIEW_PREFLIGHT",
    reason: escapeTerminalText(failure?.message ?? "Fixed sandbox preflight failed."),
  });
  return {
    status: unavailable && !cleanupFailed ? "SKIP" : "FAIL",
    ...diagnostic(error), cleanupFailed,
    ...(cleanupError ? { cleanupError: diagnostic(cleanupError) } : {}),
    ...(markerCleanupError ? { markerCleanupError: diagnostic(markerCleanupError) } : {}),
  };
}

export async function runPreviewConsumer({ cliPath, timeoutMs = 50_000 } = {}) {
  let verifiedCli;
  try { verifiedCli = await verifyPreviewBinary(cliPath); } catch (error) {
    return { status: "SKIP", dependency: previewConsumerDependency, reason: escapeTerminalText(error.message) };
  }
  let preflight;
  try { preflight = await runTracerPreflight(); } catch (error) {
    return classifyPreviewPreflightError(error);
  }
  const snapshot = await createTracerSnapshot({
    workspace: path.join(evalsRoot, "fixtures", caseName, "seed"),
    controlRoot: evalsRoot,
    controlEntries: [controlEntry, handlerEntry],
  });
  const challenge = randomBytes(32).toString("hex");
  let result;
  let primaryError;
  try {
    const provenance = {
      dependency: previewConsumerDependency,
      image: tracerSandboxImage,
      caseSha256: await hashTree(evalsRoot, [`cases/development/${caseName}`]),
      sourceSha256: await hashTree(snapshot.workspace, ["package.json", "src"]),
      controlSha256: await hashTree(snapshot.control, [controlEntry, handlerEntry]),
      skill: { acquisition: "none" },
    };
    let output;
    try {
      output = await runPreviewContainer({ endpoint: preflight.endpoint, cliPath: verifiedCli, snapshot, challenge, timeoutMs });
    } catch (error) {
      if (error.cleanupError) throw error;
      if (!error.stdout?.trim()) throw error;
      const observation = parsePreviewConsumerOutput(error.stdout ?? "", challenge);
      if (observation.status === "PASS") throw consumerError("ERR_PREVIEW_EXIT", "Consumer exited unsuccessfully after emitting output.");
      result = { ...observation, provenance };
    }
    if (output) result = { ...parsePreviewConsumerOutput(output.stdout, challenge), provenance };
    await verifyPreviewBinary(verifiedCli);
  } catch (error) {
    primaryError = error;
    const reason = error.code === "ETIMEDOUT" ? "Consumer execution exceeded its fixed deadline." : error.message;
    result = {
      status: "FAIL", code: error.code ?? "ERR_PREVIEW_EXECUTION",
      reason: escapeTerminalText(reason.replace(/FNE_PREVIEW_COMPLETION_CHALLENGE=[a-f0-9]{64}/gu, "FNE_PREVIEW_COMPLETION_CHALLENGE=<private>")),
      cleanupFailed: Boolean(error.cleanupError),
    };
  } finally {
    try { await snapshot.dispose(); } catch {
      result = {
        ...(primaryError ? result : { status: "FAIL", code: "ERR_PREVIEW_SNAPSHOT_CLEANUP", reason: "Consumer snapshot could not be removed." }),
        cleanupFailed: true, snapshotCleanupFailed: true,
      };
    }
  }
  return result;
}

async function main() {
  try {
    const { values } = parseArgs({ options: { cli: { type: "string" } }, strict: true });
    const result = await runPreviewConsumer({ cliPath: values.cli });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== "PASS") process.exitCode = result.status === "FAIL" ? 1 : 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "FAIL", reason: escapeTerminalText(error.message) })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
