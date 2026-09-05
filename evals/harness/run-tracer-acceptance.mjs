#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createTracerSnapshot,
  escapeTerminalText,
  runTracerSandbox,
} from "./tracer-sandbox.mjs";
import { runTracerPreflight } from "./tracer-preflight.mjs";

const defaultCaseName = "existing-list-search-reuse";
const evalsRoot = fileURLToPath(new URL("../", import.meta.url));
const acceptanceCases = new Map([
  [
    defaultCaseName,
    {
      controlTest:
        "fixtures/existing-list-search-reuse/acceptance/list-projects.test.mjs",
      expectedTests: 4,
    },
  ],
  [
    "project-create-authorization",
    {
      controlTest:
        "fixtures/project-create-authorization/acceptance/create-projects.test.mjs",
      expectedTests: 7,
    },
  ],
  [
    "webhook-retry-idempotency",
    {
      controlTest:
        "fixtures/webhook-retry-idempotency/acceptance/order-webhook.test.mjs",
      expectedTests: 9,
    },
  ],
]);

function resolveAcceptanceCase(caseName) {
  const acceptanceCase = acceptanceCases.get(caseName);
  if (!acceptanceCase) {
    throw new TypeError(
      `Unknown tracer case: ${escapeTerminalText(caseName)}. Supported cases: ${[...acceptanceCases.keys()].join(", ")}`,
    );
  }
  return acceptanceCase;
}

export async function runTracerAcceptance({
  workspace,
  caseName = defaultCaseName,
  timeoutMs = 15_000,
  inheritedEnvironment = process.env,
}) {
  if (typeof workspace !== "string" || workspace.length === 0) {
    throw new TypeError("A completed tracer workspace is required");
  }

  const resolvedWorkspace = await realpath(workspace);
  const workspaceInfo = await stat(resolvedWorkspace);
  if (!workspaceInfo.isDirectory()) {
    throw new TypeError("The tracer workspace must be a directory");
  }

  const acceptanceCase = resolveAcceptanceCase(caseName);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new RangeError("Tracer timeout must be an integer from 1 to 60000 milliseconds");
  }

  const preflight = await runTracerPreflight();
  const challenge = randomBytes(32).toString("hex");
  const completionReceipt =
    `FRONT_NOT_END_ACCEPTANCE_COMPLETED ${challenge} ${acceptanceCase.expectedTests}`;
  const snapshot = await createTracerSnapshot({
    controlEntries: [
      acceptanceCase.controlTest,
      "harness/runtime-call-proof.mjs",
    ],
    controlRoot: evalsRoot,
    workspace: resolvedWorkspace,
  });
  let primaryError;
  try {
    const result = await runTracerSandbox({
      caseName,
      challenge,
      control: snapshot.control,
      controlTest: acceptanceCase.controlTest,
      dockerEndpoint: preflight.endpoint,
      inheritedEnvironment,
      timeoutMs,
      workspace: snapshot.workspace,
    });
    const receiptPattern = new RegExp(`(?:^|\\n)${completionReceipt}(?=\\n|$)`, "gu");
    const receipts = result.stdout.match(receiptPattern) ?? [];
    if (receipts.length !== 1) {
      const error = new Error("Tracer acceptance did not complete all control tests");
      error.code = "ERR_TRACER_INCOMPLETE";
      error.stderr = escapeTerminalText(result.stderr);
      error.stdout = escapeTerminalText(result.stdout);
      throw error;
    }

    return {
      stderr: escapeTerminalText(result.stderr),
      stdout: escapeTerminalText(result.stdout.replace(receiptPattern, "")),
    };
  } catch (error) {
    if (typeof error.stdout === "string") error.stdout = escapeTerminalText(error.stdout);
    if (typeof error.stderr === "string") error.stderr = escapeTerminalText(error.stderr);
    error.message = escapeTerminalText(error.message);
    primaryError = error;
    throw error;
  } finally {
    try {
      await snapshot.dispose();
    } catch {
      const cleanupError = new Error(
        "Tracer acceptance could not remove its temporary workspace snapshot. Check local temporary-directory permissions and retry.",
      );
      cleanupError.code = "ERR_TRACER_SNAPSHOT_CLEANUP";
      if (primaryError) primaryError.cleanupError = cleanupError;
      else throw cleanupError;
    }
  }
}

function parseWorkspaceArgument(argv) {
  const index = argv.indexOf("--workspace");
  if (index === -1 || !argv[index + 1]) {
    throw new TypeError(
      "usage: run-tracer-acceptance.mjs --workspace <path> [--case <name>]",
    );
  }
  return argv[index + 1];
}

function parseCaseArgument(argv) {
  const index = argv.indexOf("--case");
  if (index === -1) return defaultCaseName;
  if (!argv[index + 1]) {
    throw new TypeError("--case requires a tracer case name");
  }
  return argv[index + 1];
}

async function main() {
  try {
    const argv = process.argv.slice(2);
    const result = await runTracerAcceptance({
      workspace: parseWorkspaceArgument(argv),
      caseName: parseCaseArgument(argv),
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  } catch (error) {
    if (typeof error.stdout === "string") process.stdout.write(error.stdout);
    if (typeof error.stderr === "string") process.stderr.write(error.stderr);
    process.stderr.write(`Tracer acceptance failed: ${escapeTerminalText(error.message)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
