import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createMcpService } from "../src/mcp-server.mjs";

const serverPath = fileURLToPath(new URL("../src/mcp-server.mjs", import.meta.url));
const initializeParams = {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "local-contract-test", version: "1.0.0" },
};

function request(id, method, params) {
  return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

async function initialize(service) {
  const result = await service(request("init", "initialize", initializeParams));
  assert.equal(result.id, "init");
  assert.equal(result.result.protocolVersion, "2024-11-05");
  const notReady = await service(request("not-ready", "tools/list"));
  assert.equal(notReady.id, "not-ready");
  assert.equal(notReady.error.code, -32002);
  assert.equal(await service({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
}

function runServer(messages, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath, ...args], {
      cwd: path.dirname(serverPath),
      env: { PATH: path.dirname(process.execPath), LANG: "C", TZ: "UTC" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("MCP stdio child exceeded 3 seconds")), 3_000);
    for (const name of ["stdout", "stderr"]) {
      child[name].on("data", (chunk) => {
        sizes[name] += chunk.length;
        if (sizes[name] > 65_536) {
          fail(new Error(`MCP stdio ${name} exceeded 64 KiB`));
        } else {
          output[name].push(chunk);
        }
      });
    }
    child.on("error", fail);
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") fail(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout: Buffer.concat(output.stdout).toString("utf8"),
        stderr: Buffer.concat(output.stderr).toString("utf8"),
      });
    });
    const input = messages.map((message) => typeof message === "string" ? message : JSON.stringify(message)).join("\n");
    child.stdin.end(input.length === 0 ? "" : `${input}\n`);
  });
}

test("MCP service validates initialization and correlates protocol errors", async () => {
  const service = createMcpService();
  const premature = await service(request(1, "tools/call", {
    name: "preview_card", arguments: { mode: "text", text: "Card" },
  }));
  assert.equal(premature.id, 1);
  assert.equal(premature.error.code, -32002);

  for (const params of [
    {},
    { ...initializeParams, protocolVersion: 7 },
    { ...initializeParams, capabilities: [] },
    { ...initializeParams, clientInfo: { name: "test" } },
  ]) {
    const result = await service(request("invalid-init", "initialize", params));
    assert.equal(result.id, "invalid-init");
    assert.equal(result.error.code, -32602);
  }
  await initialize(service);
  const ping = await service(request("ping", "ping"));
  assert.deepEqual(ping, { jsonrpc: "2.0", id: "ping", result: {} });
  const missing = await service(request("missing", "tools/missing"));
  assert.equal(missing.id, "missing");
  assert.equal(missing.error.code, -32601);
  const unknownTool = await service(request("unknown-tool", "tools/call", {
    name: "missing", arguments: {},
  }));
  assert.equal(unknownTool.id, "unknown-tool");
  assert.equal(unknownTool.error.code, -32602);
});

test("tools/list exposes the schema while tool notifications cannot generate a preview", async () => {
  let calls = 0;
  const service = createMcpService({
    generatePreview: async () => {
      calls += 1;
      return { html: "<article>Card</article>" };
    },
  });
  await initialize(service);
  const listed = await service(request("list", "tools/list"));
  assert.equal(listed.id, "list");
  assert.equal(listed.result.tools.length, 1);
  assert.equal(listed.result.tools[0].name, "preview_card");
  assert.equal(Object.hasOwn(listed.result.tools[0].inputSchema, "oneOf"), false);
  assert.equal(await service({
    jsonrpc: "2.0",
    method: "tools/call",
    params: { name: "preview_card", arguments: { mode: "text", text: "Card" } },
  }), null);
  assert.equal(calls, 0);

  const invalid = await service(request("invalid", "tools/call", {
    name: "preview_card", arguments: { mode: "asset", assetId: "../sample-card" },
  }));
  assert.equal(invalid.id, "invalid");
  assert.equal(invalid.result.isError, true);
  assert.equal(calls, 0);

  const baseline = createMcpService({ baseline: true });
  await initialize(baseline);
  const baselineList = await baseline(request("baseline", "tools/list"));
  assert.equal(baselineList.result.tools[0].inputSchema.oneOf.length, 2);
});

test("real stdio process recovers malformed lines and generates both previews before EOF", { timeout: 5_000 }, async () => {
  const result = await runServer([
    "{broken JSON",
    { jsonrpc: "1.0", id: "invalid-envelope", method: "ping" },
    request(1, "initialize", initializeParams),
    { jsonrpc: "2.0", method: "notifications/initialized" },
    request(2, "tools/list"),
    request(3, "tools/call", { name: "preview_card", arguments: { mode: "text", text: "  <local> & card  " } }),
    request(4, "tools/call", { name: "preview_card", arguments: { mode: "asset", assetId: "sample-card" } }),
    request(5, "tools/call", { name: "preview_card", arguments: { mode: "text", text: "Card", assetId: "sample-card" } }),
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses.length, 7);
  assert.equal(responses[0].id, null);
  assert.equal(responses[0].error.code, -32700);
  assert.equal(responses[1].error.code, -32600);
  assert.deepEqual(responses.slice(2).map((response) => response.id), [1, 2, 3, 4, 5]);
  assert.equal(responses[2].result.protocolVersion, "2024-11-05");
  assert.equal(responses[3].result.tools[0].name, "preview_card");
  assert.equal(Object.hasOwn(responses[3].result.tools[0].inputSchema, "oneOf"), false);
  const text = JSON.parse(responses[4].result.content[0].text);
  assert.equal(responses[4].result.isError, false);
  assert.equal(text.mimeType, "text/html");
  assert.match(text.html, /&lt;local&gt; &amp; card/u);
  const asset = JSON.parse(responses[5].result.content[0].text);
  assert.equal(responses[5].result.isError, false);
  assert.equal(asset.mimeType, "text/html");
  assert.match(asset.html, /data:image\/svg\+xml(?:;base64)?,/u);
  assert.equal(responses[6].result.isError, true);
});

test("stdio CLI rejects unknown arguments without writing protocol output", { timeout: 5_000 }, async () => {
  const result = await runServer([], ["--unknown"]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.trim().length > 0);
});

test("stdio CLI exposes the baseline only when explicitly selected", { timeout: 5_000 }, async () => {
  const result = await runServer([
    request(1, "initialize", initializeParams),
    { jsonrpc: "2.0", method: "notifications/initialized" },
    request(2, "tools/list"),
  ], ["--baseline"]);
  assert.equal(result.code, 0, result.stderr);
  const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(responses.map((response) => response.id), [1, 2]);
  assert.equal(responses[1].result.tools[0].inputSchema.oneOf.length, 2);
});

test("stdio CLI stops oversized UTF-8 messages with a bounded transport error", { timeout: 5_000 }, async () => {
  const oversized = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { text: "😀".repeat(4_097) } });
  assert.ok(oversized.length < 16_384);
  assert.ok(Buffer.byteLength(oversized) > 16_384);
  const result = await runServer([oversized]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /16384-byte message limit/u);
});
