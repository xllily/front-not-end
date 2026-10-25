import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const controllerPath = "/control/fixtures/real-consumer-contract-slice/acceptance/consumer-control.mjs";
const handlerPath = "/control/fixtures/real-consumer-contract-slice/acceptance/preview-handler.mjs";
const invalidInputs = [
  { mode: "other", text: "local_card" },
  { mode: "text" },
  { mode: "asset" },
  { mode: "text", text: "local_card", assetId: "sample-card" },
  { mode: "asset", assetId: "unknown" },
  { mode: "text", text: "local_card", extra: true },
];

const outputLimit = 128 * 1024;
const children = new Map();
const servers = new Set();
let wholeExpired = false;
const baseEnvironment = {
  PATH: "/usr/local/bin:/usr/bin:/bin",
  LANG: "C.UTF-8",
  TZ: "UTC",
  UV_THREADPOOL_SIZE: "1",
};

function boundedChild(executable, args, { env, cwd, timeoutMs, onStdout, outputBudget = { bytes: 0 } } = {}) {
  if (wholeExpired) throw new Error("Whole smoke deadline exceeded");
  const child = spawn(executable, args, { env, cwd, stdio: ["pipe", "pipe", "pipe"] });
  children.set(child, null);
  const stdout = [];
  const stderr = [];
  let failure;
  const fail = (error) => {
    failure ??= error;
    child.kill("SIGKILL");
  };
  const timer = setTimeout(() => fail(new Error(`Owned child exceeded ${timeoutMs}ms`)), timeoutMs);
  const done = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      outputBudget.bytes += chunk.length;
      if (outputBudget.bytes > outputLimit) return fail(new Error("Owned children exceeded 128KiB output limit"));
      try {
        if (onStdout) onStdout(chunk);
        else stdout.push(chunk);
      } catch (error) {
        fail(error);
      }
    });
    child.stderr.on("data", (chunk) => {
      outputBudget.bytes += chunk.length;
      if (outputBudget.bytes > outputLimit) return fail(new Error("Owned children exceeded 128KiB output limit"));
      stderr.push(chunk);
    });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") fail(error);
    });
    child.on("error", (error) => { failure ??= error; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (failure) {
        failure.childResult = result;
        reject(failure);
      } else resolve(result);
    });
  });
  done.catch(() => {});
  const owned = { child, done };
  children.set(child, owned);
  return owned;
}

export async function stopChild(owned) {
  if (!owned) return;
  let timer;
  let cleanupKilled = false;
  if (children.has(owned.child)) {
    if (!owned.child.stdin.destroyed) owned.child.stdin.end();
    timer = setTimeout(() => {
      cleanupKilled = true;
      owned.child.kill("SIGKILL");
    }, 200);
  }
  try {
    const result = await boundedWait(owned.done, 1_000, "Owned child did not terminate after SIGKILL");
    if (result.code !== 0 && !(cleanupKilled && result.signal === "SIGKILL")) {
      throw Object.assign(new Error("Owned child exited unsuccessfully during cleanup"), { childResult: result });
    }
  } finally { clearTimeout(timer); }
}

async function boundedWait(operation, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

async function listen(server) {
  servers.add(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections();
  await boundedWait(new Promise((resolve, reject) => server.close((error) => {
    if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
    else resolve();
  })), 1_000, "Owned HTTP server did not close");
  servers.delete(server);
}

async function readJson(request, limit = outputLimit) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new RangeError("HTTP message exceeds bounded input limit");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function sendModel(response, body, content, stopReason, messageId) {
  const message = {
    id: messageId,
    type: "message",
    role: "assistant",
    model: body.model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 32, output_tokens: 16 },
  };
  if (body.stream !== true) return json(response, 200, message);
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const event = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  event("message_start", { message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 32, output_tokens: 0 } } });
  for (const [index, block] of content.entries()) {
    if (block.type === "tool_use") {
      event("content_block_start", { index, content_block: { ...block, input: {} } });
      event("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    } else {
      event("content_block_start", { index, content_block: { type: "text", text: "" } });
      event("content_block_delta", { index, delta: { type: "text_delta", text: block.text } });
    }
    event("content_block_stop", { index });
  }
  event("message_delta", { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 16 } });
  event("message_stop", {});
  response.end();
}

function parsePreview(result) {
  assert.equal(result?.isError, false);
  assert.equal(result.content?.[0]?.type, "text");
  const preview = JSON.parse(result.content[0].text);
  assert.equal(preview.mimeType, "text/html");
  assert.equal(typeof preview.html, "string");
  if (preview.mode === "text") assert.match(preview.html, /local_card/u);
  else {
    assert.equal(preview.mode, "asset");
    assert.match(preview.html, /data:image\/svg\+xml,/u);
  }
  return { mode: preview.mode, mimeType: preview.mimeType, htmlChecked: true };
}

async function unauthorizedProbe(port) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path: "/model/not-authorized/v1/messages", method: "POST" }, (response) => {
      response.resume();
      response.on("end", () => response.statusCode === 403 ? resolve(true) : reject(new Error("Unauthorized model path was not rejected")));
    });
    request.setTimeout(1_000, () => request.destroy(new Error("Unauthorized path probe timed out")));
    request.on("error", reject);
    request.end("{}");
  });
}

async function runArm(root, baseline) {
  let primaryError;
  const armName = baseline ? "baseline" : "compatible";
  const home = path.join(root, armName);
  const config = path.join(home, "config");
  await mkdir(config, { recursive: true });
  const challenge = randomBytes(32).toString("hex");
  const apiKey = `fne-synthetic-${randomBytes(16).toString("hex")}`;
  const modelPrefix = `/model/${challenge}`;
  const pending = new Map();
  const outputBudget = { bytes: 0 };
  const dispatches = [];
  let worker;
  let cli;
  let bridge;
  let model;
  let workerBuffer = "";
  let modelRequests = 0;
  let targetTool;
  let toolNames = [];
  let associatedResults = [];
  let modelFailure;
  const rejectPending = (error) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  };
  try {
    worker = boundedChild(process.execPath, [
      "--v8-pool-size=1", "--permission", "--allow-fs-read=/workspace", `--allow-fs-read=${handlerPath}`,
      "--frozen-intrinsics", "--disallow-code-generation-from-strings",
      "--disable-warning=ExperimentalWarning", handlerPath,
      ...(baseline ? ["--baseline"] : []),
    ], {
      env: { ...baseEnvironment, HOME: "/tmp" }, cwd: "/workspace", timeoutMs: 20_000, outputBudget,
      onStdout(chunk) {
        workerBuffer += chunk.toString("utf8");
        if (Buffer.byteLength(workerBuffer) > outputLimit) throw new Error("Worker framing exceeds output limit");
        let newline;
        while ((newline = workerBuffer.indexOf("\n")) !== -1) {
          const line = workerBuffer.slice(0, newline);
          workerBuffer = workerBuffer.slice(newline + 1);
          const reply = JSON.parse(line);
          const key = JSON.stringify(reply.id);
          const waiting = pending.get(key);
          if (reply.jsonrpc !== "2.0" || !waiting) throw new Error("Worker emitted unsolicited or invalid RPC output");
          pending.delete(key);
          clearTimeout(waiting.timer);
          waiting.resolve(reply);
        }
      },
    });
    worker.done.then(
      () => rejectPending(new Error("Handler exited before RPC completed")),
      rejectPending,
    );

    const rpc = async (message, origin = "cli") => {
      const line = `${JSON.stringify(message)}\n`;
      if (Buffer.byteLength(line) > 16_384) throw new RangeError("Worker input exceeds 16KiB");
      if (!Object.hasOwn(message, "id")) {
        worker.child.stdin.write(line);
        return null;
      }
      const key = JSON.stringify(message.id);
      if (pending.has(key)) throw new Error("Duplicate in-flight RPC identifier");
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(key);
          worker.child.kill("SIGKILL");
          reject(new Error("Handler RPC exceeded 5 seconds"));
        }, 5_000);
        pending.set(key, { resolve, reject, timer });
        worker.child.stdin.write(line, (error) => {
          if (!error) return;
          clearTimeout(timer);
          pending.delete(key);
          reject(error);
        });
      });
      if (message.method === "tools/call" && origin === "cli") {
        dispatches.push({ requestId: message.id, responseId: result.id, name: message.params?.name, input: message.params?.arguments, result: result.result });
      }
      return result;
    };

    bridge = createServer(async (request, response) => {
      try {
        if (new URL(request.url, "http://local").pathname !== "/mcp") {
          request.resume();
          return json(response, 404, { error: "Unknown MCP path" });
        }
        if (request.method !== "POST") {
          request.resume();
          response.writeHead(405, { allow: "POST" });
          return response.end();
        }
        const message = await readJson(request, 16_384);
        if (message.method === "__fne_generation_count") {
          return json(response, 200, { jsonrpc: "2.0", id: message.id ?? null, error: { code: -32601, message: "Method not found." } });
        }
        const reply = await rpc(message);
        if (reply === null) {
          response.writeHead(202);
          response.end();
        } else json(response, 200, reply);
      } catch (error) {
        json(response, 500, { error: error.message });
      }
    });
    const mcpPort = await listen(bridge);

    model = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, "http://local").pathname;
        if (!pathname.startsWith(`${modelPrefix}/`)) {
          request.resume();
          return json(response, 403, { error: "Unauthorized local model path" });
        }
        if (request.method === "HEAD" && pathname === `${modelPrefix}/api/hello`) {
          response.writeHead(204);
          return response.end();
        }
        if (request.method !== "POST" || pathname !== `${modelPrefix}/v1/messages`) {
          request.resume();
          return json(response, 404, { error: "Unsupported local model operation" });
        }
        if (request.headers["x-api-key"] !== apiKey) {
          request.resume();
          return json(response, 403, { error: "Unauthorized synthetic key" });
        }
        const body = await readJson(request);
        modelRequests += 1;
        if (modelRequests > 3) throw new Error("Local model request count exceeded bound");
        if (modelRequests === 1) {
          assert.ok(body.tools === undefined || Array.isArray(body.tools), "Actual CLI request has malformed tools");
          toolNames = (body.tools ?? []).map((tool) => tool.name);
          targetTool = (body.tools ?? []).find((tool) => tool.name === "mcp__preview__preview_card");
          if (!baseline && targetTool) verifyPreviewInputSchema(targetTool.input_schema);
          if (baseline || !targetTool) {
            return sendModel(response, body, [{ type: "text", text: "Local discovery observation complete." }], "end_turn", `msg_${armName}_1`);
          }
          return sendModel(response, body, [
            { type: "tool_use", id: "local_text", name: targetTool.name, input: { mode: "text", text: "local_card" } },
            { type: "tool_use", id: "local_asset", name: targetTool.name, input: { mode: "asset", assetId: "sample-card" } },
          ], "tool_use", "msg_compatible_1");
        }
        assert.equal(baseline, false, "Baseline unexpectedly requested another model turn");
        const results = (body.messages ?? []).flatMap((message) => Array.isArray(message.content) ? message.content : []).filter((block) => block.type === "tool_result");
        associatedResults = ["local_text", "local_asset"].map((toolUseId) => {
          const block = results.find((item) => item.tool_use_id === toolUseId);
          assert.ok(block, `Missing actual CLI tool result ${toolUseId}`);
          assert.notEqual(block.is_error, true, `CLI marked ${toolUseId} as error`);
          const text = typeof block.content === "string" ? block.content : block.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
          return { toolUseId, ...parsePreview({ isError: false, content: [{ type: "text", text }] }) };
        });
        assert.deepEqual(associatedResults.map((item) => item.mode), ["text", "asset"]);
        return sendModel(response, body, [{ type: "text", text: "Both local previews completed." }], "end_turn", "msg_compatible_2");
      } catch (error) {
        modelFailure ??= error;
        json(response, 400, { type: "error", error: { type: "invalid_request_error", message: "Bounded local model assertion failed" } });
      }
    });
    const modelPort = await listen(model);
    const unauthorizedPathRejected = await unauthorizedProbe(modelPort);
    const mcpConfig = JSON.stringify({ mcpServers: { preview: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` } } });
    const cliEnvironment = {
      ...baseEnvironment, HOME: home, CLAUDE_CONFIG_DIR: config,
      CLAUDE_CODE_ENTRYPOINT: "sdk-cli", ENABLE_TOOL_SEARCH: "false",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1",
      DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_BUG_COMMAND: "1",
      CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1", API_TIMEOUT_MS: "10000",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${modelPort}${modelPrefix}`, ANTHROPIC_API_KEY: apiKey,
    };
    cli = boundedChild("/cli/claude", [
      "--bare", "--print", "Generate the requested local previews through the configured preview tool.",
      "--mcp-config", mcpConfig, "--strict-mcp-config", "--tools", "",
      "--allowedTools", "mcp__preview__preview_card", "--permission-mode", "dontAsk",
      "--setting-sources", "", "--settings", "{}", "--no-session-persistence",
      "--disable-slash-commands", "--model", "claude-sonnet-4-6", "--max-turns", "4",
      "--output-format", "json",
    ], { env: cliEnvironment, cwd: home, timeoutMs: 15_000, outputBudget });
    cli.child.stdin.end();
    const cliResult = await cli.done;
    if (modelFailure) throw modelFailure;
    assert.equal(cliResult.code, 0, `CLI ${armName} exit ${cliResult.code}: ${cliResult.stderr.slice(0, 2_000)} ${cliResult.stdout.slice(0, 2_000)}`);
    assert.ok(modelRequests > 0, "CLI emitted no captured model request");
    const dispatch = dispatches.map((item) => ({
      requestId: item.requestId, responseId: item.responseId, name: item.name,
      input: item.input, ...parsePreview(item.result),
    }));
    if (targetTool && !baseline) {
      assert.equal(dispatch.length, 2, "Expected two actual MCP tools/call requests");
      assert.deepEqual(dispatch.find((item) => item.input?.mode === "text")?.input, { mode: "text", text: "local_card" });
      assert.deepEqual(dispatch.find((item) => item.input?.mode === "asset")?.input, { mode: "asset", assetId: "sample-card" });
      assert.equal(associatedResults.length, 2);
    }
    const generationCount = (await rpc({ jsonrpc: "2.0", id: "control-count-before", method: "__fne_generation_count" }, "control")).result?.count;
    assert.equal(generationCount, baseline ? 0 : 2, "Actual renderer invocation count differs");
    let invalidInputsRejected = 0;
    if (!baseline) {
      for (const [index, input] of invalidInputs.entries()) {
        const reply = await rpc({ jsonrpc: "2.0", id: `control-invalid-${index}`, method: "tools/call", params: { name: "preview_card", arguments: input } }, "control");
        assert.equal(reply.result?.isError, true, "Actual service accepted an invalid input");
        assert.equal(typeof reply.result.content?.[0]?.text, "string");
        assert.ok(reply.result.content[0].text.length > 0);
        invalidInputsRejected += 1;
      }
    }
    const invalidGenerationCount = (await rpc({ jsonrpc: "2.0", id: "control-count-after", method: "__fne_generation_count" }, "control")).result?.count;
    assert.equal(invalidGenerationCount, generationCount, "Rejected input invoked the renderer");
    return {
      discovered: Boolean(targetTool), toolNames, modelRequests,
      inputSchema: targetTool?.input_schema ?? null,
      schemaRootOneOf: Boolean(targetTool?.input_schema?.oneOf),
      unauthorizedPathRejected, dispatch, associatedResults,
      generationCount, invalidInputsRejected, invalidGenerationCount,
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    rejectPending(new Error("Owned consumer arm is stopping"));
    const cleanupErrors = [];
    for (const operation of [() => stopChild(cli), () => stopChild(worker), () => closeServer(bridge), () => closeServer(model)]) {
      try { await operation(); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length > 0) {
      const cleanupError = new Error(`Consumer arm cleanup failed: ${cleanupErrors.map((error) => error.message).join("; ")}`);
      cleanupError.code = "ERR_PREVIEW_CLEANUP";
      if (primaryError) primaryError.cleanupError = cleanupError;
      else throw cleanupError;
    }
  }
}

export function verifyPreviewInputSchema(schema) {
  assert.equal(schema?.type, "object");
  assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ["assetId", "mode", "text"]);
  assert.equal(schema.properties.mode.type, "string");
  assert.deepEqual(schema.properties.mode.enum, ["text", "asset"]);
  assert.deepEqual(schema.properties.text, { type: "string", minLength: 1, maxLength: 500 });
  assert.deepEqual(schema.properties.assetId, { type: "string", enum: ["sample-card"] });
  assert.deepEqual(schema.required, ["mode"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.hasOwn(schema, "oneOf"), false);
  return true;
}

export function verifyObservation(summary) {
  assert.equal(summary?.nodeVersion, "v22.23.2");
  assert.equal(summary.consumerVersion, "2.1.293 (Claude Code)");
  assert.deepEqual(summary.configuration, {
    skillSource: "none", toolSearch: false, freshConfig: true, workerThreadPool: 1, cliEntrypoint: "sdk-cli",
  });
  assert.deepEqual(summary.network, { loopback: true, external: "ENETUNREACH", onlyInternalInterfaces: true });
  for (const key of [
    "controllerReadDenied", "parentEnvironmentDenied", "childProcessDenied",
    "workerDenied", "environmentClean", "inspectorUnavailable",
  ]) assert.equal(summary.permissions?.[key], true, `Permission proof missing: ${key}`);
  const { baseline, compatible } = summary;
  assert.equal(typeof baseline?.discovered, "boolean");
  assert.ok(Array.isArray(baseline.toolNames));
  assert.equal(baseline.toolNames.includes("mcp__preview__preview_card"), baseline.discovered);
  assert.equal(baseline.modelRequests, 1);
  assert.equal(baseline.unauthorizedPathRejected, true);
  assert.deepEqual(baseline.dispatch, []);
  assert.deepEqual(baseline.associatedResults, []);
  assert.equal(baseline.generationCount, 0);
  assert.equal(baseline.invalidInputsRejected, 0);
  assert.equal(baseline.invalidGenerationCount, 0);
  assert.equal(compatible?.discovered, true);
  assert.ok(compatible.toolNames.includes("mcp__preview__preview_card"));
  assert.equal(compatible.schemaRootOneOf, false);
  verifyPreviewInputSchema(compatible.inputSchema);
  assert.equal(compatible.modelRequests, 2);
  assert.equal(compatible.unauthorizedPathRejected, true);
  assert.equal(compatible.generationCount, 2);
  assert.equal(compatible.invalidInputsRejected, invalidInputs.length);
  assert.equal(compatible.invalidGenerationCount, 2);
  assert.equal(compatible.dispatch.length, 2);
  const requestIds = new Set();
  for (const [mode, input, toolUseId] of [
    ["text", { mode: "text", text: "local_card" }, "local_text"],
    ["asset", { mode: "asset", assetId: "sample-card" }, "local_asset"],
  ]) {
    const dispatch = compatible.dispatch.find((item) => item.input?.mode === mode);
    assert.equal(dispatch?.name, "preview_card");
    assert.deepEqual(dispatch.input, input);
    assert.ok(typeof dispatch.requestId === "string" || Number.isInteger(dispatch.requestId));
    assert.equal(dispatch.responseId, dispatch.requestId);
    requestIds.add(dispatch.requestId);
    assert.equal(dispatch.mode, mode);
    assert.equal(dispatch.mimeType, "text/html");
    assert.equal(dispatch.htmlChecked, true);
    const associated = compatible.associatedResults.find((item) => item.toolUseId === toolUseId);
    assert.equal(associated?.mode, mode);
    assert.equal(associated.mimeType, "text/html");
    assert.equal(associated.htmlChecked, true);
  }
  assert.equal(requestIds.size, 2);
  assert.equal(compatible.associatedResults.length, 2);
  assert.equal(summary.compatibleDispatchVerified, true);
  if (baseline.discovered) {
    const error = new Error("Pinned consumer did not reproduce the historical baseline tool omission");
    error.code = "ERR_PREVIEW_REPRODUCTION";
    throw error;
  }
  assert.equal(summary.historicalOmissionReproduced, true);
  return true;
}

async function proveNetwork() {
  const interfaces = Object.values(networkInterfaces()).flat();
  const onlyInternalInterfaces = interfaces.length > 0 && interfaces.every((item) => item.internal === true);
  assert.equal(onlyInternalInterfaces, true, "Consumer container exposes a non-loopback interface");
  const external = await new Promise((resolve, reject) => {
    const socket = createConnection({ host: "198.51.100.1", port: 443 });
    socket.setTimeout(1_000, () => {
      socket.destroy();
      reject(new Error("External route isolation probe exceeded 1 second"));
    });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("Consumer container unexpectedly reached an external address"));
    });
    socket.once("error", (error) => {
      if (error.code === "ENETUNREACH") resolve(error.code);
      else reject(new Error(`External isolation probe expected ENETUNREACH, received ${error.code}`));
    });
  });
  return { loopback: false, external, onlyInternalInterfaces };
}

async function proveHandlerPermissions() {
  const source = `
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Worker } from "node:worker_threads";
import { createConnection } from "node:net";
const denied = (operation) => {
  try { operation(); return false; } catch (error) { return error.code === "ERR_ACCESS_DENIED"; }
};
const observation = {
  controllerReadDenied: denied(() => readFileSync(${JSON.stringify(controllerPath)})),
  parentEnvironmentDenied: denied(() => readFileSync("/proc/" + process.ppid + "/environ")),
  childProcessDenied: denied(() => spawnSync(process.execPath, ["-e", ""])),
  workerDenied: denied(() => new Worker("", { eval: true })),
  environmentClean: Object.keys(process.env).sort().join(",") === "HOME,LANG,PATH,TZ,UV_THREADPOOL_SIZE",
};
process.kill(process.ppid, "SIGUSR1");
await new Promise((resolve) => setTimeout(resolve, 50));
observation.inspectorUnavailable = await new Promise((resolve) => {
  const socket = createConnection({ host: "127.0.0.1", port: 9229 });
  socket.setTimeout(300, () => { socket.destroy(); resolve(false); });
  socket.once("connect", () => { socket.destroy(); resolve(false); });
  socket.once("error", (error) => resolve(error.code === "ECONNREFUSED"));
});
process.stdout.write(JSON.stringify(observation) + "\\n");
`;
  const probe = boundedChild(process.execPath, [
    "--v8-pool-size=1", "--permission", "--allow-fs-read=/workspace",
    `--allow-fs-read=${handlerPath}`, "--frozen-intrinsics",
    "--disallow-code-generation-from-strings", "--disable-warning=ExperimentalWarning",
    "--input-type=module", "--eval", source,
  ], { env: { ...baseEnvironment, HOME: "/tmp" }, cwd: "/workspace", timeoutMs: 2_000 });
  probe.child.stdin.end();
  const result = await probe.done;
  assert.equal(result.code, 0, "Handler permission probe did not complete");
  const observation = JSON.parse(result.stdout);
  for (const value of Object.values(observation)) assert.equal(value, true, "Handler permission restriction failed");
  return observation;
}

function redact(value) {
  return `${value}`
    .replace(/\/model\/[a-f0-9]{64}/gu, "/model/<challenge>")
    .replace(/fne-synthetic-[a-f0-9]{32}/gu, "<synthetic-key>")
    .replace(/[a-f0-9]{64}/gu, "<digest-or-challenge>");
}

async function main() {
  const completionChallenge = process.env.FNE_PREVIEW_COMPLETION_CHALLENGE;
  let temporaryRoot;
  let primaryError;
  let summary;
  let wholeTimer;
  const ignoreSignal = () => {};
  try {
    if (typeof completionChallenge !== "string" || !/^[a-f0-9]{64}$/u.test(completionChallenge)) {
      throw new Error("A valid host completion challenge is required");
    }
    assert.ok(process.execArgv.includes("--disable-sigusr1"), "Trusted controller must disable SIGUSR1 inspection");
    process.on("SIGUSR1", ignoreSignal);
    wholeTimer = setTimeout(() => {
      wholeExpired = true;
      for (const child of children.keys()) child.kill("SIGKILL");
      for (const server of servers) server.closeAllConnections();
    }, 45_000);
    wholeTimer.unref();
    temporaryRoot = await mkdtemp("/tmp/front-not-end-consumer-");
    let consumerVersion;
    try {
      const version = boundedChild("/cli/claude", ["--version"], {
        env: { ...baseEnvironment, HOME: temporaryRoot, DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
        cwd: temporaryRoot, timeoutMs: 5_000,
      });
      version.child.stdin.end();
      const versionResult = await version.done;
      assert.equal(versionResult.code, 0);
      consumerVersion = versionResult.stdout.trim();
      assert.equal(consumerVersion, "2.1.293 (Claude Code)");
    } catch (error) {
      error.code = "ERR_PREVIEW_DEPENDENCY";
      throw error;
    }
    const network = await proveNetwork();
    const permissions = await proveHandlerPermissions();
    const baseline = await runArm(temporaryRoot, true);
    const compatible = await runArm(temporaryRoot, false);
    if (wholeExpired) throw new Error("Whole consumer deadline exceeded");
    network.loopback = baseline.unauthorizedPathRejected && compatible.unauthorizedPathRejected;
    summary = {
      nodeVersion: process.version,
      consumerVersion,
      configuration: { skillSource: "none", toolSearch: false, freshConfig: true, workerThreadPool: 1, cliEntrypoint: "sdk-cli" },
      network, permissions, baseline, compatible,
      historicalOmissionReproduced: !baseline.discovered && compatible.discovered,
      compatibleDispatchVerified: compatible.dispatch.length === 2 && compatible.associatedResults.length === 2,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    for (const owned of [...children.values()]) {
      try { await stopChild(owned); } catch (error) { cleanupErrors.push(error); }
    }
    for (const server of [...servers]) {
      try { await closeServer(server); } catch (error) { cleanupErrors.push(error); }
    }
    if (temporaryRoot) {
      try { await rm(temporaryRoot, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    }
    clearTimeout(wholeTimer);
    process.removeListener("SIGUSR1", ignoreSignal);
    if (cleanupErrors.length > 0) {
      const cleanupError = new Error(`Consumer cleanup failed: ${cleanupErrors.map((error) => error.message).join("; ")}`);
      cleanupError.code = "ERR_PREVIEW_CLEANUP";
      if (primaryError) {
        if (primaryError.cleanupError) {
          cleanupError.message = `${primaryError.cleanupError.message}; ${cleanupError.message}`;
        }
        primaryError.cleanupError = cleanupError;
      }
      else primaryError = cleanupError;
    }
  }
  try {
    if (primaryError) throw primaryError;
    verifyObservation(summary);
    process.stdout.write(`${JSON.stringify({ status: "PASS", ...summary })}\n`);
    process.stdout.write(`FRONT_NOT_END_PREVIEW_CONSUMER_COMPLETED ${completionChallenge}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: error.cleanupError ? "FAIL" : error.code === "ERR_PREVIEW_DEPENDENCY" ? "SKIP" : error.code === "ERR_PREVIEW_REPRODUCTION" ? "UNVERIFIED" : "FAIL",
      error: redact(error.message), wholeExpired,
      ...(summary ? { observation: summary } : {}),
      ...(error.cleanupError ? { cleanupError: redact(error.cleanupError.message) } : {}),
      ...(error.childResult ? { child: {
        code: error.childResult.code, signal: error.childResult.signal,
        stdoutTail: redact(error.childResult.stdout.slice(-2_000)), stderrTail: redact(error.childResult.stderr.slice(-2_000)),
      } } : {}),
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

