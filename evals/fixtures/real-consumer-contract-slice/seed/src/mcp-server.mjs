import { once } from "node:events";
import { pathToFileURL } from "node:url";

import { createPreviewCardHandler, previewTool } from "./preview-card.mjs";

const protocolVersion = "2024-11-05";
const maximumMessageBytes = 16 * 1024;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function createMcpService({ baseline = false, generatePreview } = {}) {
  const previewCard = createPreviewCardHandler({ generatePreview });
  let state = "new";

  return async (message) => {
    const hasId = isObject(message) && Object.hasOwn(message, "id");
    const validId = hasId && (
      typeof message.id === "string" ||
      (typeof message.id === "number" && Number.isInteger(message.id))
    );
    if (
      !isObject(message) || message.jsonrpc !== "2.0" ||
      typeof message.method !== "string" || (hasId && !validId) ||
      (Object.hasOwn(message, "params") && !isObject(message.params))
    ) {
      return rpcError(validId ? message.id : null, -32600, "Invalid request.");
    }

    if (!hasId) {
      if (message.method === "notifications/initialized" && state === "initializing") {
        state = "ready";
      }
      return null;
    }

    const { id, method, params } = message;
    const response = (result) => ({ jsonrpc: "2.0", id, result });
    if (method === "ping") return response({});
    if (method === "initialize") {
      if (state !== "new") return rpcError(id, -32600, "Already initialized.");
      if (
        typeof params?.protocolVersion !== "string" ||
        !isObject(params.capabilities) || !isObject(params.clientInfo) ||
        typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string"
      ) {
        return rpcError(id, -32602, "Initialization requires protocolVersion, capabilities and clientInfo.");
      }
      state = "initializing";
      return response({
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "local-preview", version: "0.1.0" },
      });
    }
    if (state !== "ready") return rpcError(id, -32002, "Initialize the MCP session first.");
    if (method === "tools/list") {
      if (params?.cursor !== undefined) return rpcError(id, -32602, "This tool list has no cursor.");
      return response({ tools: [previewTool({ baseline })] });
    }
    if (method === "tools/call") {
      if (params?.name !== "preview_card") return rpcError(id, -32602, "Unknown tool.");
      return response(await previewCard(params.arguments));
    }
    return rpcError(id, -32601, "Method not found.");
  };
}

export async function runStdio({
  input = process.stdin,
  output = process.stdout,
  service = createMcpService(),
} = {}) {
  input.setEncoding("utf8");
  let pending = "";
  const send = async (message) => {
    if (message !== null && !output.write(`${JSON.stringify(message)}\n`)) {
      await once(output, "drain");
    }
  };
  const handleLine = async (line) => {
    if (Buffer.byteLength(line) > maximumMessageBytes) {
      throw new RangeError("MCP message exceeds 16384 bytes.");
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      await send(rpcError(null, -32700, "Parse error."));
      return;
    }
    await send(await service(message));
  };

  for await (const chunk of input) {
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf("\n")) !== -1) {
      await handleLine(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
    }
    if (Buffer.byteLength(pending) > maximumMessageBytes) {
      throw new RangeError("MCP message exceeds 16384 bytes.");
    }
  }
  if (pending.length > 0) await handleLine(pending);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--baseline")) {
    process.stderr.write("Usage: node src/mcp-server.mjs [--baseline]\n");
    process.exitCode = 1;
  } else {
    try {
      await runStdio({ service: createMcpService({ baseline: args[0] === "--baseline" }) });
    } catch {
      process.stderr.write("Local MCP transport failed; check input framing and the 16384-byte message limit.\n");
      process.exitCode = 1;
    }
  }
}
