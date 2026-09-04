import { execFile as execFileCallback } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  tracerSandboxImage,
  tracerSandboxResourceArguments,
} from "./tracer-sandbox.mjs";

const execFile = promisify(execFileCallback);
const maximumMemoryBytes = 256 * 1024 * 1024;
const expectedNodeVersion = `v${tracerSandboxImage.match(/^node:([0-9.]+)-/u)?.[1] ?? ""}`;
const successfulPreflights = new Map();

function decodeMountInfoField(value) {
  const replacements = {
    "011": "\t",
    "012": "\n",
    "040": " ",
    "134": "\\",
  };
  return value.replace(/\\(011|012|040|134)/gu, (_match, code) => replacements[code]);
}

function parseMountInfo(value) {
  const mounts = [];
  for (const line of value.split("\n")) {
    if (line.length === 0) continue;
    const separator = line.indexOf(" - ");
    if (separator === -1) continue;
    const left = line.slice(0, separator).split(" ");
    const right = line.slice(separator + 3).split(" ");
    if (left.length < 5 || right.length < 3) continue;
    mounts.push({
      controllers: new Set(right[2].split(",")),
      fileSystem: right[0],
      mountPoint: decodeMountInfoField(left[4]),
      root: decodeMountInfoField(left[3]),
    });
  }
  return mounts;
}

function parseCgroupMembership(value) {
  const memberships = [];
  for (const line of value.split("\n")) {
    if (line.length === 0) continue;
    const match = line.match(/^[0-9]+:([^:]*):(\/.*)$/u);
    if (!match) continue;
    memberships.push({
      controllers: match[1] === "" ? [] : match[1].split(","),
      path: match[2],
    });
  }
  return memberships;
}

function translateCgroupPath(mount, membershipPath) {
  const root = path.posix.normalize(mount.root);
  const mountPoint = path.posix.normalize(mount.mountPoint);
  const membership = path.posix.normalize(membershipPath);
  if (![root, mountPoint, membership].every((value) => value.startsWith("/"))) return null;
  if (root !== "/" && membership !== root && !membership.startsWith(`${root}/`)) {
    return null;
  }
  const relative = root === "/"
    ? membership.slice(1)
    : membership.slice(root.length).replace(/^\/+/u, "");
  const resolved = path.posix.resolve(mountPoint, relative);
  if (resolved !== mountPoint && !resolved.startsWith(`${mountPoint}/`)) return null;
  return resolved;
}

function uniqueResolvedPath(paths, description) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length !== 1) {
    throw new Error(`Could not resolve exactly one ${description} cgroup path`);
  }
  return unique[0];
}

export function resolveProcessCgroupPaths({ cgroup, mountinfo }) {
  const memberships = parseCgroupMembership(cgroup);
  const mounts = parseMountInfo(mountinfo);
  const unifiedMemberships = memberships.filter((membership) =>
    membership.controllers.length === 0
  );
  if (unifiedMemberships.length > 0) {
    const resolved = [];
    for (const membership of unifiedMemberships) {
      for (const mount of mounts) {
        if (mount.fileSystem !== "cgroup2") continue;
        resolved.push(translateCgroupPath(mount, membership.path));
      }
    }
    const directory = uniqueResolvedPath(resolved, "unified");
    return {
      cpu: path.posix.join(directory, "cpu.max"),
      memory: path.posix.join(directory, "memory.max"),
      pids: path.posix.join(directory, "pids.max"),
      version: 2,
    };
  }

  const controllerDirectory = (controller) => {
    const membershipPaths = [...new Set(memberships
      .filter((membership) => membership.controllers.includes(controller))
      .map((membership) => membership.path))];
    if (membershipPaths.length !== 1) {
      throw new Error(`Could not resolve exactly one ${controller} membership`);
    }
    const resolved = mounts
      .filter((mount) => mount.fileSystem === "cgroup" && mount.controllers.has(controller))
      .map((mount) => translateCgroupPath(mount, membershipPaths[0]));
    return uniqueResolvedPath(resolved, controller);
  };
  const cpu = controllerDirectory("cpu");
  return {
    cpuPeriod: path.posix.join(cpu, "cpu.cfs_period_us"),
    cpuQuota: path.posix.join(cpu, "cpu.cfs_quota_us"),
    memory: path.posix.join(controllerDirectory("memory"), "memory.limit_in_bytes"),
    pids: path.posix.join(controllerDirectory("pids"), "pids.max"),
    version: 1,
  };
}

const diagnosticSource = `
import { readFileSync } from "node:fs";
import path from "node:path";

${decodeMountInfoField.toString()}
${parseMountInfo.toString()}
${parseCgroupMembership.toString()}
${translateCgroupPath.toString()}
${uniqueResolvedPath.toString()}
${resolveProcessCgroupPaths.toString()}

function readCgroupFile(filePath) {
  if (typeof filePath !== "string") return null;
  try {
    return { path: filePath, value: readFileSync(filePath, "utf8").trim() };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return null;
}

let cgroupPaths;
try {
  cgroupPaths = resolveProcessCgroupPaths({
    cgroup: readFileSync("/proc/self/cgroup", "utf8"),
    mountinfo: readFileSync("/proc/self/mountinfo", "utf8"),
  });
} catch {}
const observation = {
  cgroupVersion: cgroupPaths?.version ?? null,
  marker: readFileSync("/preflight/marker", "utf8"),
  nodeVersion: process.version,
  pids: readCgroupFile(cgroupPaths?.pids),
  memory: readCgroupFile(cgroupPaths?.memory),
  cpu: cgroupPaths?.version === 2
    ? readCgroupFile(cgroupPaths.cpu)
    : {
        quota: readCgroupFile(cgroupPaths?.cpuQuota),
        period: readCgroupFile(cgroupPaths?.cpuPeriod),
      },
};
process.stdout.write(JSON.stringify(observation));
`;

function localEndpointError() {
  return preflightError(
    "ERR_TRACER_PREFLIGHT_REMOTE_ENDPOINT",
    "Tracer preflight requires a local Docker endpoint (unix:// or npipe://); remote Docker endpoints are not supported.",
  );
}

function unknownEndpointError() {
  return preflightError(
    "ERR_TRACER_PREFLIGHT_ENDPOINT",
    "Tracer preflight could not prove a supported local Docker endpoint. Select a local Docker context or set DOCKER_HOST to an absolute unix:// or npipe:// endpoint.",
  );
}

function preflightError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function defaultDockerCommand(args, { environment }) {
  return execFile("docker", args, {
    encoding: "utf8",
    env: environment,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024,
    timeout: 10_000,
  });
}

function isSupportedLocalEndpoint(endpoint) {
  if (/^unix:\/\/\/[^\u0000\r\n?#]+$/u.test(endpoint)) return true;
  const namedPipePrefix = "npipe:////./pipe/";
  const namedPipeName = endpoint.slice(namedPipePrefix.length);
  return endpoint.startsWith(namedPipePrefix) && namedPipeName.length > 0 &&
    !/[\u0000\r\n?#]/u.test(namedPipeName);
}

async function resolveEffectiveDockerEndpoint(environment, dockerCommand) {
  let endpoint;
  if (typeof environment.DOCKER_HOST === "string" && environment.DOCKER_HOST.length > 0) {
    endpoint = environment.DOCKER_HOST;
  } else {
    let inspected;
    try {
      inspected = await dockerCommand(
        ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
        { environment },
      );
      endpoint = JSON.parse(inspected.stdout.trim());
    } catch {
      throw unknownEndpointError();
    }
  }

  if (/^(?:ssh|tcp|https?):\/\//u.test(endpoint ?? "")) {
    throw localEndpointError();
  }
  if (typeof endpoint !== "string" || !isSupportedLocalEndpoint(endpoint)) {
    throw unknownEndpointError();
  }
  return endpoint;
}

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[0-9]+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateObservation(observation, expectedMarker) {
  if (observation?.marker !== expectedMarker) {
    throw preflightError(
      "ERR_TRACER_PREFLIGHT_MARKER",
      "Docker daemon bind-mount check failed. Use a local Docker daemon that can mount this client's temporary files.",
    );
  }
  if (observation?.nodeVersion !== expectedNodeVersion) {
    throw preflightError(
      "ERR_TRACER_PREFLIGHT_NODE_VERSION",
      `Pinned tracer sandbox image must run Node ${expectedNodeVersion}. Run: npm run tracer:pull-image`,
    );
  }
  if (observation?.cgroupVersion !== 1 && observation?.cgroupVersion !== 2) {
    throw preflightError(
      "ERR_TRACER_PREFLIGHT_CGROUP",
      "Tracer preflight could not identify supported cgroup limit files. Enable Docker cgroup resource enforcement.",
    );
  }

  const pids = parsePositiveInteger(observation.pids?.value);
  if (pids === null || pids > 32) {
    throw preflightError(
      "ERR_TRACER_PREFLIGHT_PIDS",
      "Docker did not prove the required PID limit of 32. Enable Docker cgroup PID enforcement.",
    );
  }
  const memory = parsePositiveInteger(observation.memory?.value);
  if (memory === null || memory > maximumMemoryBytes) {
    throw preflightError(
      "ERR_TRACER_PREFLIGHT_MEMORY",
      "Docker did not prove the required 256 MiB memory limit. Enable Docker cgroup memory enforcement.",
    );
  }
  const cpuParts = observation.cgroupVersion === 2 &&
      typeof observation.cpu?.value === "string"
    ? observation.cpu.value.trim().split(/\s+/u)
    : [];
  const quota = observation.cgroupVersion === 2
    ? cpuParts.length === 2 ? parsePositiveInteger(cpuParts[0]) : null
    : parsePositiveInteger(observation.cpu?.quota?.value);
  const period = observation.cgroupVersion === 2
    ? cpuParts.length === 2 ? parsePositiveInteger(cpuParts[1]) : null
    : parsePositiveInteger(observation.cpu?.period?.value);
  if (quota === null || period === null || quota / period > 1) {
    throw preflightError(
      "ERR_TRACER_PREFLIGHT_CPU",
      "Docker did not prove the required one-CPU limit. Enable Docker cgroup CPU enforcement.",
    );
  }
}

async function runDiagnosticContainer(endpoint, environment, dockerCommand) {
  let markerRoot;
  let containerName;
  let containerId;
  let createAttempted = false;
  let primaryError;
  try {
    markerRoot = await mkdtemp(path.join(tmpdir(), "front-not-end-preflight-"));
    const marker = randomBytes(32).toString("hex");
    containerName = `front-not-end-preflight-${marker.slice(0, 16)}`;
    await chmod(markerRoot, 0o755);
    await writeFile(path.join(markerRoot, "marker"), marker, { mode: 0o444 });
    const args = [
      "--host",
      endpoint,
      "create",
      "--pull=never",
      `--name=${containerName}`,
      "--network=none",
      "--ipc=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges=true",
      ...tracerSandboxResourceArguments,
      "--user=65532:65532",
      "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
      "--label=dev.front-not-end.preflight=true",
      `--mount=type=bind,src=${markerRoot},dst=/preflight,readonly`,
      tracerSandboxImage,
      "node",
      "--input-type=module",
      "--eval",
      diagnosticSource,
    ];
    try {
      createAttempted = true;
      const created = await dockerCommand(args, { environment });
      containerId = created.stdout.trim();
      if (!/^[0-9a-f]{64}$/u.test(containerId)) {
        throw preflightError(
          "ERR_TRACER_PREFLIGHT_DOCKER",
          "Tracer preflight could not create a verifiable diagnostic container. Check the local Docker runtime.",
        );
      }
      const result = await dockerCommand(
        ["--host", endpoint, "start", "--attach", containerId],
        { environment },
      );
      let observation;
      try {
        observation = JSON.parse(result.stdout.trim());
      } catch {
        throw preflightError(
          "ERR_TRACER_PREFLIGHT_OUTPUT",
          "Tracer preflight could not verify Docker's diagnostic output. Check the local Docker runtime and pinned image.",
        );
      }
      validateObservation(observation, marker);
      return observation;
    } catch (error) {
      if (error?.code?.startsWith?.("ERR_TRACER_PREFLIGHT_")) {
        primaryError = error;
        throw error;
      }
      const output = `${error?.stderr ?? ""}\n${error?.message ?? ""}`;
      if (/No such image|Unable to find image/u.test(output)) {
        primaryError = preflightError(
          "ERR_TRACER_PREFLIGHT_IMAGE",
          "Pinned tracer sandbox image is unavailable. Run: npm run tracer:pull-image",
        );
        throw primaryError;
      }
      primaryError = preflightError(
        "ERR_TRACER_PREFLIGHT_DOCKER",
        "Tracer preflight could not run its diagnostic container. Ensure the local Docker daemon is running and run: npm run tracer:pull-image",
      );
      throw primaryError;
    }
  } catch {
    if (!primaryError) {
      primaryError = preflightError(
        "ERR_TRACER_PREFLIGHT_SETUP",
        "Tracer preflight could not prepare its temporary bind marker. Check local temporary-directory permissions and retry.",
      );
    }
    throw primaryError;
  } finally {
    let containerCleanupError;
    if (createAttempted) {
      const target = /^[0-9a-f]{64}$/u.test(containerId) ? containerId : containerName;
      let cleanupError;
      for (const retryDelay of [0, 50, 100, 200, 400]) {
        if (retryDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
        try {
          await dockerCommand(
            ["--host", endpoint, "rm", "--force", "--volumes", target],
            { environment },
          );
          cleanupError = null;
          break;
        } catch (error) {
          const output = `${error?.stderr ?? ""}\n${error?.message ?? ""}`;
          if (/No such container/u.test(output)) {
            cleanupError = null;
            break;
          }
          cleanupError = error;
        }
      }
      if (cleanupError) {
        containerCleanupError = preflightError(
          "ERR_TRACER_PREFLIGHT_CLEANUP",
          "Tracer preflight could not remove its diagnostic container. Remove containers labeled dev.front-not-end.preflight=true and retry.",
        );
      }
    }
    let markerCleanupError;
    if (markerRoot) {
      try {
        await rm(markerRoot, { recursive: true, force: true });
      } catch {
        markerCleanupError = preflightError(
          "ERR_TRACER_PREFLIGHT_MARKER_CLEANUP",
          "Tracer preflight could not remove its temporary bind marker. Check local temporary-directory permissions and retry.",
        );
      }
    }
    if (primaryError) {
      if (containerCleanupError) primaryError.cleanupError = containerCleanupError;
      if (markerCleanupError) primaryError.markerCleanupError = markerCleanupError;
    } else if (containerCleanupError) {
      if (markerCleanupError) containerCleanupError.markerCleanupError = markerCleanupError;
      throw containerCleanupError;
    } else if (markerCleanupError) {
      throw markerCleanupError;
    }
  }
}

export async function runTracerPreflight({
  environment = process.env,
  dockerCommand = defaultDockerCommand,
} = {}) {
  const endpoint = await resolveEffectiveDockerEndpoint(environment, dockerCommand);
  const cacheKey = `${endpoint}\n${tracerSandboxImage}`;
  const cached = successfulPreflights.get(cacheKey);
  if (cached) return cached;
  const observation = await runDiagnosticContainer(endpoint, environment, dockerCommand);
  const result = Object.freeze({
    cgroupVersion: observation.cgroupVersion,
    endpoint,
    image: tracerSandboxImage,
    nodeVersion: observation.nodeVersion,
  });
  successfulPreflights.set(cacheKey, result);
  return result;
}

async function main() {
  try {
    const result = await runTracerPreflight();
    process.stdout.write(
      `Tracer doctor passed: local Docker endpoint, ${result.nodeVersion}, PID/memory/CPU limits, and bind marker verified.\n`,
    );
  } catch (error) {
    const message = error?.code?.startsWith?.("ERR_TRACER_PREFLIGHT_")
      ? error.message
      : "Tracer preflight failed unexpectedly. Check the local Docker runtime and retry.";
    process.stderr.write(`Tracer doctor failed: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
