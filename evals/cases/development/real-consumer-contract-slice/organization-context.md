# Organization context

- The existing `preview_card` handler owns input validation and local preview
  generation. Reuse it for both input modes.
- Text input is `{ "mode": "text", "text": "A quiet garden" }`. Text must
  contain 1–500 characters and must not be blank. Leading/trailing whitespace
  is trimmed for rendering.
- Asset input is `{ "mode": "asset", "assetId": "sample-card" }`. This is the
  only allowlisted asset; its SVG is bundled with the service. Paths, URLs and
  arbitrary file reads are not supported.
- Supply only the field matching the mode. Unknown fields, missing values,
  mixed branches and unknown assets must be rejected before generation.
- Successful tool results contain a JSON-encoded local preview with `mode`,
  `mimeType: "text/html"`, and a self-contained `html` document. Text is escaped;
  the asset is embedded as a data URI. Rendering needs no account, network or
  model and writes no files.
- This fixture uses native Node.js 22 ESM and `npm test`. Run the stdio MCP
  service with `node src/mcp-server.mjs`. Keep stdout for protocol messages.
- Tool schemas and descriptions do not replace server-side validation. Preserve
  tested behavior when adapting a discovery contract to a specific consumer.
- Adding media providers, storage, dependencies or a general Agent runtime is
  outside this request.
