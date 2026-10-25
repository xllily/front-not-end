import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  parsePreviewConsumerOutput,
  previewConsumerDependency,
  runPreviewConsumer,
  runPreviewContainer,
  verifyPreviewBinary,
} from "./run-preview-consumer.mjs";
import { tracerSandboxImage } from "./tracer-sandbox.mjs";
import { stopChild, verifyPreviewInputSchema } from "../fixtures/real-consumer-contract-slice/acceptance/consumer-control.mjs";
import { previewTool } from "../fixtures/real-consumer-contract-slice/seed/src/preview-card.mjs";

const execFile = promisify(execFileCallback);
const entryPath = fileURLToPath(new URL("./run-preview-consumer.mjs", import.meta.url));
const endpoint = "unix:///tmp/preview-test-docker.sock";
const challenge = "a".repeat(64);
const containerId = "b".repeat(64);
const receipt = `FRONT_NOT_END_PREVIEW_CONSUMER_COMPLETED ${challenge}`;
const containerInput = {
  endpoint,
  cliPath: "/tmp/preview-test-cli",
  snapshot: { workspace: "/tmp/preview-test-workspace", control: "/tmp/preview-test-control" },
  challenge,
};

test("consumer dependency rejects absent and substituted bytes before execution", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "front-not-end-preview-dependency-"));
  try {
    const absent = path.join(root, "missing-cli");
    await assert.rejects(verifyPreviewBinary(absent), { code: "ENOENT" });
    const skipped = await runPreviewConsumer({ cliPath: absent });
    assert.equal(skipped.status, "SKIP");
    assert.equal(skipped.dependency.version, "2.1.293");

    const substituted = path.join(root, "substituted-cli");
    await writeFile(substituted, "");
    await truncate(substituted, previewConsumerDependency.bytes);
    await chmod(substituted, 0o555);
    await assert.rejects(verifyPreviewBinary(substituted), (error) => {
      assert.equal(error.code, "ERR_PREVIEW_DEPENDENCY");
      assert.match(error.message, /SHA256/u);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing dependency command exits nonzero with a SKIP result", async () => {
  await assert.rejects(
    execFile(process.execPath, [entryPath], {
      encoding: "utf8",
      env: { PATH: path.dirname(process.execPath), LANG: "C", TZ: "UTC" },
      timeout: 5_000,
      maxBuffer: 16 * 1024,
    }),
    (error) => {
      assert.equal(error.code, 2);
      const result = JSON.parse(error.stdout);
      assert.equal(result.status, "SKIP");
      assert.equal(result.dependency.version, "2.1.293");
      return true;
    },
  );
});

test("consumer container keeps fixed isolation and removes only its exact ID", async () => {
  const calls = [];
  const completed = { stdout: "bounded control output\n", stderr: "" };
  const result = await runPreviewContainer({
    ...containerInput,
    timeoutMs: 12_000,
    dockerCommand: async (args, options) => {
      calls.push({ args, options });
      if (args[2] === "create") return { stdout: `${containerId}\n`, stderr: "" };
      if (args[2] === "start") return completed;
      return { stdout: "", stderr: "" };
    },
  });
  assert.equal(result, completed);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 2), ["--host", endpoint]);
    assert.ok(call.options.timeout > 0 && call.options.timeout <= 60_000);
    assert.ok(call.options.maxBuffer > 0 && call.options.maxBuffer <= 1024 * 1024);
  }
  const create = calls[0].args;
  for (const option of [
    "--pull=never", "--network=none", "--ipc=none", "--read-only",
    "--cap-drop=ALL", "--security-opt=no-new-privileges=true",
    "--pids-limit=32", "--memory=256m", "--memory-swap=256m", "--cpus=1",
    "--user=65532:65532", "--disable-sigusr1", tracerSandboxImage,
  ]) assert.ok(create.includes(option), `Missing required isolation option: ${option}`);
  assert.equal(create.includes("--privileged"), false);
  const mounts = create.filter((argument) => argument.startsWith("--mount="));
  assert.deepEqual(mounts, [
    "--mount=type=bind,src=/tmp/preview-test-cli,dst=/cli/claude,readonly",
    "--mount=type=bind,src=/tmp/preview-test-workspace,dst=/workspace,readonly",
    "--mount=type=bind,src=/tmp/preview-test-control,dst=/control,readonly",
  ]);
  const allowedEnvironment = new Set(["HOME", "LANG", "TZ", "UV_THREADPOOL_SIZE", "FNE_PREVIEW_COMPLETION_CHALLENGE"]);
  for (const argument of create.filter((value) => value.startsWith("--env="))) {
    assert.ok(allowedEnvironment.has(argument.slice(6).split("=", 1)[0]));
  }
  assert.deepEqual(calls[1].args, ["--host", endpoint, "start", "--attach", containerId]);
  assert.equal(calls[1].options.timeout, 12_000);
  assert.deepEqual(calls[2].args, ["--host", endpoint, "rm", "--force", "--volumes", containerId]);
});

test("unverified endpoints and out-of-contract deadlines never reach Docker", async () => {
  let calls = 0;
  const dockerCommand = async () => { calls += 1; throw new Error("Docker must not run"); };
  await assert.rejects(
    runPreviewContainer({ ...containerInput, endpoint: "tcp://remote:2375", dockerCommand }),
    { code: "ERR_PREVIEW_ENDPOINT" },
  );
  await assert.rejects(
    runPreviewContainer({ ...containerInput, timeoutMs: 60_001, dockerCommand }),
    /timeout/u,
  );
  assert.equal(calls, 0);
});

for (const code of ["ETIMEDOUT", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"]) {
  test(`preserves ${code} when exact-container cleanup also fails`, async () => {
    const primary = Object.assign(new Error("Primary bounded execution failure"), { code });
    const cleanup = new Error("Exact container cleanup failed");
    const removed = [];
    await assert.rejects(
      runPreviewContainer({
        ...containerInput,
        dockerCommand: async (args) => {
          if (args[2] === "create") return { stdout: `${containerId}\n`, stderr: "" };
          if (args[2] === "start") throw primary;
          removed.push(args);
          throw cleanup;
        },
      }),
      (error) => {
        assert.equal(error, primary);
        assert.equal(error.cleanupError, cleanup);
        return true;
      },
    );
    assert.deepEqual(removed, [["--host", endpoint, "rm", "--force", "--volumes", containerId]]);
  });
}

test("failed creation cleans only its owned unique name and retains the creation error", async () => {
  const primary = new Error("Consumer creation failed before an ID was returned");
  const calls = [];
  await assert.rejects(
    runPreviewContainer({
      ...containerInput,
      dockerCommand: async (args) => {
        calls.push(args);
        if (args[2] === "create") throw primary;
        return { stdout: "", stderr: "" };
      },
    }),
    (error) => error === primary,
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], [
    "--host", endpoint, "rm", "--force", "--volumes", `front-not-end-consumer-${challenge.slice(0, 16)}`,
  ]);
});

test("a successful child cannot pass when exact-container cleanup fails", async () => {
  await assert.rejects(
    runPreviewContainer({
      ...containerInput,
      dockerCommand: async (args) => {
        if (args[2] === "create") return { stdout: `${containerId}\n`, stderr: "" };
        if (args[2] === "start") return { stdout: "success", stderr: "" };
        throw new Error("Container remained present");
      },
    }),
    { code: "ERR_PREVIEW_CLEANUP" },
  );
});

test("forged, missing, duplicate and incomplete control receipts never establish PASS", () => {
  const observation = JSON.stringify({ status: "PASS" });
  for (const output of [
    observation,
    `${observation}\n${receipt.replace(challenge, "c".repeat(64))}`,
    `${observation}\n${receipt}\n${receipt}`,
    `${observation}\nworkspace says success\n${receipt}`,
    receipt,
  ]) {
    assert.throws(() => parsePreviewConsumerOutput(output, challenge), { code: "ERR_PREVIEW_INCOMPLETE" });
  }
  assert.throws(() => parsePreviewConsumerOutput(`${observation}\n${receipt}`, challenge));
});

test("non-success observations remain distinct and unknown statuses fail closed", () => {
  for (const status of ["FAIL", "SKIP", "UNVERIFIED"]) {
    const observation = { status, reason: "Required evidence was unavailable" };
    assert.deepEqual(parsePreviewConsumerOutput(JSON.stringify(observation), challenge), observation);
  }
  assert.throws(
    () => parsePreviewConsumerOutput(JSON.stringify({ status: "SUCCESS" }), challenge),
    { code: "ERR_PREVIEW_INCOMPLETE" },
  );
});

test("already-closed handler execution failures survive child cleanup", async () => {
  const primary = Object.assign(new Error("Handler emitted unsolicited output after the final reply"), {
    childResult: { code: null, signal: "SIGKILL", stdout: "", stderr: "" },
  });
  await assert.rejects(
    stopChild({ child: {}, done: Promise.reject(primary) }),
    (error) => error === primary,
  );
});

test("an already-closed nonzero handler exit cannot be treated as successful cleanup", async () => {
  await assert.rejects(stopChild({
    child: { exitCode: 7 },
    done: Promise.resolve({ code: 7, signal: null, stdout: "", stderr: "Late handler failure" }),
  }));
});

test("the captured consumer schema preserves both legal preview input branches", () => {
  const schema = previewTool().inputSchema;
  assert.equal(verifyPreviewInputSchema(schema), true);
  const missingText = structuredClone(schema);
  delete missingText.properties.text;
  assert.throws(() => verifyPreviewInputSchema(missingText));
  const textRequiredForAssets = structuredClone(schema);
  textRequiredForAssets.required = ["mode", "text"];
  assert.throws(() => verifyPreviewInputSchema(textRequiredForAssets));
});
