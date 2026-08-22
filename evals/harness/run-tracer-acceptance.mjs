#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const defaultCaseName = "existing-list-search-reuse";
const acceptanceCases = new Map([
  [
    defaultCaseName,
    {
      root: fileURLToPath(
        new URL("../fixtures/existing-list-search-reuse/acceptance/", import.meta.url),
      ),
      testFile: "list-projects.test.mjs",
    },
  ],
  [
    "project-create-authorization",
    {
      root: fileURLToPath(
        new URL("../fixtures/project-create-authorization/acceptance/", import.meta.url),
      ),
      testFile: "create-projects.test.mjs",
    },
  ],
]);

function resolveAcceptanceCase(caseName) {
  const acceptanceCase = acceptanceCases.get(caseName);
  if (!acceptanceCase) {
    throw new TypeError(
      `Unknown tracer case: ${caseName}. Supported cases: ${[...acceptanceCases.keys()].join(", ")}`,
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
  const acceptanceTestPath = path.join(acceptanceCase.root, acceptanceCase.testFile);
  const environment = {
    FRONT_NOT_END_WORKSPACE: resolvedWorkspace,
    LANG: inheritedEnvironment.LANG ?? "C",
    LC_ALL: inheritedEnvironment.LC_ALL ?? "C",
    TZ: inheritedEnvironment.TZ ?? "UTC",
  };
  const { stdout, stderr } = await execFile(
    process.execPath,
    [
      "--permission",
      `--allow-fs-read=${resolvedWorkspace}`,
      `--allow-fs-read=${acceptanceCase.root}`,
      acceptanceTestPath,
    ],
    {
      cwd: resolvedWorkspace,
      encoding: "utf8",
      env: environment,
      maxBuffer: 1024 * 1024,
      timeout: timeoutMs,
    },
  );

  return { stdout, stderr };
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
    process.stderr.write(`Tracer acceptance failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
