import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  resolveProcessCgroupPaths,
  runTracerPreflight,
} from "./tracer-preflight.mjs";

const execFile = promisify(execFileCallback);
const acceptancePath = fileURLToPath(new URL("./run-tracer-acceptance.mjs", import.meta.url));
const preflightPath = fileURLToPath(new URL("./tracer-preflight.mjs", import.meta.url));
const preflightUrl = new URL("./tracer-preflight.mjs", import.meta.url).href;

function optionValue(args, name) {
  return args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function diagnosticDocker({ transform = (observation) => observation } = {}) {
  const containerId = "b".repeat(64);
  let createdArguments;
  const diagnosticResult = async (args) => {
    const mount = optionValue(args, "--mount");
    const markerRoot = mount?.match(/(?:^|,)src=([^,]+)(?:,|$)/u)?.[1];
    const marker = markerRoot === undefined
      ? null
      : await readFile(`${markerRoot}/marker`, "utf8");
    const pids = optionValue(args, "--pids-limit");
    const memory = optionValue(args, "--memory");
    const cpus = optionValue(args, "--cpus");
    const observation = transform({
      cgroupVersion: 2,
      cpu: cpus === "1"
        ? { path: "/sys/fs/cgroup/cpu.max", value: "100000 100000" }
        : null,
      marker,
      memory: memory === "256m"
        ? { path: "/sys/fs/cgroup/memory.max", value: "268435456" }
        : null,
      nodeVersion: "v22.23.2",
      pids: pids === "32"
        ? { path: "/sys/fs/cgroup/pids.max", value: "32" }
        : null,
    });
    return { stderr: "", stdout: `${JSON.stringify(observation)}\n` };
  };
  return async (args) => {
    if (args.includes("run")) return diagnosticResult(args);
    if (args.includes("create")) {
      createdArguments = args;
      return { stderr: "", stdout: `${containerId}\n` };
    }
    if (args.includes("start")) return diagnosticResult(createdArguments);
    if (args.includes("rm")) return { stderr: "", stdout: "" };
    throw new Error("unexpected Docker operation");
  };
}

function failingDiagnosticEngine() {
  const activeContainers = new Set();
  const containerId = "a".repeat(64);
  return {
    activeContainers,
    dockerCommand: async (args) => {
      if (args.includes("run")) {
        activeContainers.add("implicit-run-container");
        const error = new Error("diagnostic start failed");
        error.stderr = "diagnostic start failed";
        throw error;
      }
      if (args.includes("create")) {
        activeContainers.add(containerId);
        return { stderr: "", stdout: `${containerId}\n` };
      }
      if (args.includes("start")) {
        const error = new Error("diagnostic start failed");
        error.stderr = "diagnostic start failed";
        throw error;
      }
      if (args.includes("rm")) {
        activeContainers.delete(args.at(-1));
        return { stderr: "", stdout: "" };
      }
      throw new Error("unexpected Docker operation");
    },
  };
}

test("rejects remote Docker endpoints before starting a diagnostic container", async () => {
  for (const endpoint of [
    "ssh://builder@example.invalid",
    "tcp://127.0.0.1:2375",
    "http://127.0.0.1:2375",
    "https://127.0.0.1:2376",
  ]) {
    await assert.rejects(
      runTracerPreflight({ environment: { DOCKER_HOST: endpoint } }),
      /requires a local Docker endpoint/u,
    );
  }

  const localDiagnostic = diagnosticDocker();
  await assert.rejects(
    runTracerPreflight({
      environment: {
        DOCKER_CONTEXT: "desktop-linux",
        DOCKER_HOST: "ssh://builder@example.invalid",
      },
      dockerCommand: async (args, options) => {
        if (args.includes("context")) {
          return { stderr: "", stdout: '"unix:///tmp/docker.sock"\n' };
        }
        return localDiagnostic(args, options);
      },
    }),
    /requires a local Docker endpoint/u,
  );
});

test("fails closed when the effective Docker endpoint is unknown or missing", async () => {
  await assert.rejects(
    runTracerPreflight({ environment: { DOCKER_HOST: "ftp://docker.invalid" } }),
    /could not prove a supported local Docker endpoint/u,
  );

  await assert.rejects(
    runTracerPreflight({
      environment: {},
      dockerCommand: async () => ({ stderr: "", stdout: "null\n" }),
    }),
    /could not prove a supported local Docker endpoint/u,
  );

  await assert.rejects(
    runTracerPreflight({
      environment: { DOCKER_HOST: "npipe:////./pipe/" },
      dockerCommand: diagnosticDocker(),
    }),
    /could not prove a supported local Docker endpoint/u,
  );
});

test("accepts local Unix, named-pipe, and context-resolved endpoints", async () => {
  const namedPipe = "npipe:////./pipe/docker_engine";
  assert.equal((await runTracerPreflight({
    environment: { DOCKER_HOST: namedPipe },
    dockerCommand: diagnosticDocker(),
  })).endpoint, namedPipe);

  const contextEndpoint = "unix:///tmp/front-not-end-context.sock";
  const localDiagnostic = diagnosticDocker();
  const dockerCommand = async (args, options) => {
    if (args[0] === "context") {
      return { stderr: "", stdout: `${JSON.stringify(contextEndpoint)}\n` };
    }
    return localDiagnostic(args, options);
  };
  assert.equal((await runTracerPreflight({
    environment: { DOCKER_CONTEXT: "desktop-linux" },
    dockerCommand,
  })).endpoint, contextEndpoint);
});

test("proves a local daemon marker, runtime, and production cgroup-v2 limits", async () => {
  const result = await runTracerPreflight({
    environment: { DOCKER_HOST: "unix:///tmp/front-not-end-preflight-v2.sock" },
    dockerCommand: diagnosticDocker(),
  });

  assert.deepEqual(
    {
      cgroupVersion: result.cgroupVersion,
      endpoint: result.endpoint,
      nodeVersion: result.nodeVersion,
    },
    {
      cgroupVersion: 2,
      endpoint: "unix:///tmp/front-not-end-preflight-v2.sock",
      nodeVersion: "v22.23.2",
    },
  );
});

test("proves production limits from cgroup-v1 files", async () => {
  const dockerCommand = diagnosticDocker({
    transform: (observation) => ({
      ...observation,
      cgroupVersion: 1,
      cpu: {
        period: {
          path: "/sys/fs/cgroup/cpu/cpu.cfs_period_us",
          value: "100000",
        },
        quota: {
          path: "/sys/fs/cgroup/cpu/cpu.cfs_quota_us",
          value: "100000",
        },
      },
      memory: {
        path: "/sys/fs/cgroup/memory/memory.limit_in_bytes",
        value: "268435456",
      },
      pids: { path: "/sys/fs/cgroup/pids/pids.max", value: "32" },
    }),
  });

  const result = await runTracerPreflight({
    environment: { DOCKER_HOST: "unix:///tmp/front-not-end-preflight-v1.sock" },
    dockerCommand,
  });

  assert.equal(result.cgroupVersion, 1);
});

test("removes the exact diagnostic container when its execution fails", async () => {
  const engine = failingDiagnosticEngine();

  await assert.rejects(
    runTracerPreflight({
      environment: { DOCKER_HOST: "unix:///tmp/front-not-end-preflight-cleanup.sock" },
      dockerCommand: engine.dockerCommand,
    }),
    (error) => error.code === "ERR_TRACER_PREFLIGHT_DOCKER",
  );

  assert.deepEqual([...engine.activeContainers], []);
});

for (const [name, transform, expectedCode] of [
  [
    "bind marker mismatch",
    (observation) => ({ ...observation, marker: "not-the-client-marker" }),
    "ERR_TRACER_PREFLIGHT_MARKER",
  ],
  [
    "pinned image Node version mismatch",
    (observation) => ({ ...observation, nodeVersion: "v22.23.1" }),
    "ERR_TRACER_PREFLIGHT_NODE_VERSION",
  ],
  [
    "missing PID limit",
    (observation) => ({ ...observation, pids: null }),
    "ERR_TRACER_PREFLIGHT_PIDS",
  ],
  [
    "missing memory limit",
    (observation) => ({ ...observation, memory: null }),
    "ERR_TRACER_PREFLIGHT_MEMORY",
  ],
  [
    "missing CPU limit",
    (observation) => ({ ...observation, cpu: null }),
    "ERR_TRACER_PREFLIGHT_CPU",
  ],
]) {
  test(`rejects ${name}`, async () => {
    await assert.rejects(
      runTracerPreflight({
        environment: {
          DOCKER_HOST: `unix:///tmp/front-not-end-${name.replaceAll(" ", "-")}.sock`,
        },
        dockerCommand: diagnosticDocker({ transform }),
      }),
      (error) => error.code === expectedCode,
    );
  });
}

for (const [name, transform, expectedCode] of [
  [
    "an unlimited PID value",
    (observation) => ({ ...observation, pids: { ...observation.pids, value: "max" } }),
    "ERR_TRACER_PREFLIGHT_PIDS",
  ],
  [
    "a negative memory value",
    (observation) => ({ ...observation, memory: { ...observation.memory, value: "-1" } }),
    "ERR_TRACER_PREFLIGHT_MEMORY",
  ],
  [
    "a zero memory value",
    (observation) => ({ ...observation, memory: { ...observation.memory, value: "0" } }),
    "ERR_TRACER_PREFLIGHT_MEMORY",
  ],
  [
    "an oversized memory value",
    (observation) => ({
      ...observation,
      memory: { ...observation.memory, value: "268435457" },
    }),
    "ERR_TRACER_PREFLIGHT_MEMORY",
  ],
  [
    "an unlimited cgroup-v2 CPU value",
    (observation) => ({ ...observation, cpu: { ...observation.cpu, value: "max 100000" } }),
    "ERR_TRACER_PREFLIGHT_CPU",
  ],
  [
    "a malformed cgroup-v2 CPU value",
    (observation) => ({ ...observation, cpu: { ...observation.cpu, value: "100000x 100000" } }),
    "ERR_TRACER_PREFLIGHT_CPU",
  ],
  [
    "a cgroup-v2 CPU value with trailing tokens",
    (observation) => ({
      ...observation,
      cpu: { ...observation.cpu, value: "100000 100000 garbage" },
    }),
    "ERR_TRACER_PREFLIGHT_CPU",
  ],
  [
    "an oversized cgroup-v2 CPU quota",
    (observation) => ({ ...observation, cpu: { ...observation.cpu, value: "100001 100000" } }),
    "ERR_TRACER_PREFLIGHT_CPU",
  ],
  [
    "an unlimited cgroup-v1 CPU quota",
    (observation) => ({
      ...observation,
      cgroupVersion: 1,
      cpu: {
        period: { path: "/sys/fs/cgroup/cpu/cpu.cfs_period_us", value: "100000" },
        quota: { path: "/sys/fs/cgroup/cpu/cpu.cfs_quota_us", value: "-1" },
      },
    }),
    "ERR_TRACER_PREFLIGHT_CPU",
  ],
]) {
  test(`rejects ${name}`, async () => {
    await assert.rejects(
      runTracerPreflight({
        environment: {
          DOCKER_HOST: `unix:///tmp/front-not-end-${name.replaceAll(" ", "-")}.sock`,
        },
        dockerCommand: diagnosticDocker({ transform }),
      }),
      (error) => error.code === expectedCode,
    );
  });
}

test("reports a missing pinned image with the pull remediation", async () => {
  const dockerCommand = async (args) => {
    if (args.includes("create")) {
      const error = new Error("No such image");
      error.stderr = "No such image";
      throw error;
    }
    if (args.includes("rm")) return { stderr: "", stdout: "" };
    throw new Error("unexpected Docker operation");
  };

  await assert.rejects(
    runTracerPreflight({
      environment: { DOCKER_HOST: "unix:///tmp/front-not-end-missing-image.sock" },
      dockerCommand,
    }),
    (error) => error.code === "ERR_TRACER_PREFLIGHT_IMAGE" &&
      /npm run tracer:pull-image/u.test(error.message),
  );
});

test("reuses only a successful preflight for the same endpoint and image", async () => {
  const availableDocker = diagnosticDocker();
  let available = true;
  const dockerCommand = async (...args) => {
    if (!available) throw new Error("diagnostic engine became unavailable");
    return availableDocker(...args);
  };
  const options = {
    environment: { DOCKER_HOST: "unix:///tmp/front-not-end-success-cache.sock" },
    dockerCommand,
  };

  const first = await runTracerPreflight(options);
  available = false;
  const second = await runTracerPreflight(options);

  assert.deepEqual(second, first);
});

test("does not cache a failed preflight", async () => {
  let markerIsValid = false;
  const dockerCommand = diagnosticDocker({
    transform: (observation) => ({
      ...observation,
      marker: markerIsValid ? observation.marker : "wrong-marker",
    }),
  });
  const options = {
    environment: { DOCKER_HOST: "unix:///tmp/front-not-end-failure-cache.sock" },
    dockerCommand,
  };

  await assert.rejects(
    runTracerPreflight(options),
    (error) => error.code === "ERR_TRACER_PREFLIGHT_MARKER",
  );
  markerIsValid = true;

  assert.equal((await runTracerPreflight(options)).nodeVersion, "v22.23.2");
});

test("preserves the diagnostic failure when exact-container cleanup also fails", async () => {
  const containerId = "c".repeat(64);
  const dockerCommand = async (args) => {
    if (args.includes("create")) return { stderr: "", stdout: `${containerId}\n` };
    if (args.includes("start")) {
      const error = new Error("diagnostic start failed");
      error.stderr = "diagnostic start failed";
      throw error;
    }
    if (args.includes("rm")) {
      const error = new Error("diagnostic cleanup failed");
      error.stderr = "diagnostic cleanup failed";
      throw error;
    }
    throw new Error("unexpected Docker operation");
  };
  let rejected;

  await assert.rejects(
    runTracerPreflight({
      environment: { DOCKER_HOST: "unix:///tmp/front-not-end-cleanup-precedence.sock" },
      dockerCommand,
    }),
    (error) => {
      rejected = error;
      return error.code === "ERR_TRACER_PREFLIGHT_DOCKER";
    },
  );

  assert.equal(rejected.cleanupError?.code, "ERR_TRACER_PREFLIGHT_CLEANUP");
});

test("preserves marker setup failure when marker cleanup also fails", async () => {
  const program = `
import { mock } from "node:test";
const actualFilesystem = await import("node:fs/promises");
const setupError = Object.assign(new Error("sensitive marker setup path"), { code: "EACCES" });
const cleanupError = Object.assign(new Error("sensitive marker cleanup path"), { code: "EACCES" });
mock.module("node:fs/promises", {
  defaultExport: actualFilesystem.default,
  namedExports: {
    ...actualFilesystem,
    chmod: async () => { throw setupError; },
    mkdtemp: async () => "/private/tmp/front-not-end-sensitive-marker",
    rm: async () => { throw cleanupError; },
  },
});
const { runTracerPreflight } = await import(${JSON.stringify(`${preflightUrl}?setup-precedence`)});
try {
  await runTracerPreflight({
    environment: { DOCKER_HOST: "unix:///tmp/front-not-end-setup-precedence.sock" },
    dockerCommand: async () => { throw new Error("Docker must not run after marker setup fails"); },
  });
  process.exitCode = 2;
} catch (error) {
  process.stdout.write(JSON.stringify({
    cleanupCode: error.markerCleanupError?.code ?? null,
    code: error.code ?? null,
    message: error.message,
  }));
}
`;
  const result = await execFile(
    process.execPath,
    ["--experimental-test-module-mocks", "--input-type=module", "--eval", program],
    { encoding: "utf8" },
  );
  const failure = JSON.parse(result.stdout);

  assert.equal(failure.code, "ERR_TRACER_PREFLIGHT_SETUP");
  assert.match(failure.message, /temporary bind marker/u);
  assert.doesNotMatch(failure.message, /sensitive/u);
  assert.equal(failure.cleanupCode, "ERR_TRACER_PREFLIGHT_MARKER_CLEANUP");
});

test("removes the bind marker even when post-success container cleanup fails", async () => {
  const successfulDocker = diagnosticDocker();
  let markerRoot;
  const dockerCommand = async (args, options) => {
    if (args.includes("create")) {
      const mount = optionValue(args, "--mount");
      markerRoot = mount?.match(/(?:^|,)src=([^,]+)(?:,|$)/u)?.[1];
    }
    if (args.includes("rm")) {
      const error = new Error("diagnostic cleanup failed");
      error.stderr = "diagnostic cleanup failed";
      throw error;
    }
    return successfulDocker(args, options);
  };

  await assert.rejects(
    runTracerPreflight({
      environment: { DOCKER_HOST: "unix:///tmp/front-not-end-marker-cleanup.sock" },
      dockerCommand,
    }),
    (error) => error.code === "ERR_TRACER_PREFLIGHT_CLEANUP",
  );

  await assert.rejects(readFile(`${markerRoot}/marker`), { code: "ENOENT" });
});

test("doctor exits nonzero with a sanitized local-endpoint remediation", async () => {
  let rejected;
  await assert.rejects(
    execFile(process.execPath, [preflightPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        DOCKER_HOST: "ssh://secret-user@private-daemon.example.invalid",
      },
    }),
    (error) => {
      rejected = error;
      return error.code === 1;
    },
  );

  assert.match(rejected.stderr, /Tracer doctor failed: .*requires a local Docker endpoint/u);
  assert.doesNotMatch(rejected.stderr, /secret-user|private-daemon/u);
});

test("acceptance rejects an unsafe daemon before snapshot execution", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "front-not-end-preflight-order-"));
  try {
    await mkdir(path.join(workspace, "src"));
    await writeFile(path.join(workspace, "package.json"), '{"type":"module"}\n');
    await symlink("/tmp/agent-controlled", path.join(workspace, "src", "escape"));

    let rejected;
    await assert.rejects(
      execFile(
        process.execPath,
        [acceptancePath, "--workspace", workspace],
        {
          encoding: "utf8",
          env: { ...process.env, DOCKER_HOST: "tcp://127.0.0.1:2375" },
        },
      ),
      (error) => {
        rejected = error;
        return error.code === 1;
      },
    );

    assert.match(rejected.stderr, /requires a local Docker endpoint/u);
    assert.doesNotMatch(rejected.stderr, /symbolic link/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("resolves cgroup-v2 files through a non-root private mount", () => {
  const paths = resolveProcessCgroupPaths({
    cgroup: "0::/docker/abc123/workload\n",
    mountinfo:
      "36 25 0:32 /docker/abc123 /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
  });

  assert.deepEqual(paths, {
    cpu: "/sys/fs/cgroup/workload/cpu.max",
    memory: "/sys/fs/cgroup/workload/memory.max",
    pids: "/sys/fs/cgroup/workload/pids.max",
    version: 2,
  });
});

test("resolves cgroup-v1 files with a combined cpu,cpuacct controller", () => {
  const paths = resolveProcessCgroupPaths({
    cgroup: [
      "9:pids:/docker/abc123",
      "8:memory:/docker/abc123",
      "7:cpu,cpuacct:/docker/abc123",
      "",
    ].join("\n"),
    mountinfo: [
      "41 30 0:36 /docker/abc123 /sys/fs/cgroup/pids rw - cgroup cgroup rw,pids",
      "42 30 0:37 /docker/abc123 /sys/fs/cgroup/memory rw - cgroup cgroup rw,memory",
      "43 30 0:38 /docker/abc123 /sys/fs/cgroup/cpu,cpuacct rw - cgroup cgroup rw,cpu,cpuacct",
      "",
    ].join("\n"),
  });

  assert.deepEqual(paths, {
    cpuPeriod: "/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us",
    cpuQuota: "/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us",
    memory: "/sys/fs/cgroup/memory/memory.limit_in_bytes",
    pids: "/sys/fs/cgroup/pids/pids.max",
    version: 1,
  });
});
