import { createMcpService, runStdio } from "/workspace/src/mcp-server.mjs";
import { renderLocalPreview } from "/workspace/src/preview-card.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--baseline")) {
  throw new TypeError("The preview control handler accepts only --baseline");
}

let generationCount = 0;
const service = createMcpService({
  baseline: args[0] === "--baseline",
  generatePreview(input) {
    generationCount += 1;
    return renderLocalPreview(input);
  },
});

await runStdio({
  service: async (message) => {
    if (
      message?.jsonrpc === "2.0" &&
      message.method === "__fne_generation_count" &&
      (typeof message.id === "string" || Number.isInteger(message.id))
    ) {
      return { jsonrpc: "2.0", id: message.id, result: { count: generationCount } };
    }
    return service(message);
  },
});
