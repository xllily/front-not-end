import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPreviewCardHandler,
  previewTool,
} from "../src/preview-card.mjs";

function readPreview(result) {
  assert.equal(result.isError, false);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  return JSON.parse(result.content[0].text);
}

test("valid text and allowlisted asset inputs use the same preview callback", async () => {
  const calls = [];
  const handler = createPreviewCardHandler({
    generatePreview: async (input) => {
      calls.push(input);
      return { ...input, mimeType: "text/html", html: "<article>Preview</article>" };
    },
  });

  assert.deepEqual(readPreview(await handler({ mode: "text", text: "  A local card  " })), {
    mode: "text",
    text: "A local card",
    mimeType: "text/html",
    html: "<article>Preview</article>",
  });
  assert.equal(readPreview(await handler({ mode: "asset", assetId: "sample-card" })).assetId, "sample-card");
  assert.deepEqual(calls, [
    { mode: "text", text: "A local card" },
    { mode: "asset", assetId: "sample-card" },
  ]);
});

test("invalid branch combinations and untrusted asset names fail before generation", async () => {
  let calls = 0;
  const handler = createPreviewCardHandler({
    generatePreview: async () => {
      calls += 1;
      return { html: "This must not be generated" };
    },
  });
  const invalidInputs = [
    null,
    [],
    {},
    { mode: "other", text: "Card" },
    { mode: "text" },
    { mode: "text", text: " \n\t " },
    { mode: "text", text: 7 },
    { mode: "text", text: "x".repeat(501) },
    { mode: "text", text: "😀".repeat(501) },
    { mode: "text", text: "Card", assetId: "sample-card" },
    { mode: "text", text: "Card", assetId: undefined },
    { mode: "text", text: "Card", unexpected: true },
    { mode: "asset" },
    { mode: "asset", assetId: 7 },
    { mode: "asset", assetId: "unknown" },
    { mode: "asset", assetId: "__proto__" },
    { mode: "asset", assetId: "constructor" },
    { mode: "asset", assetId: "../sample-card" },
    { mode: "asset", assetId: "sample-card", text: "Card" },
    { mode: "asset", assetId: "sample-card", text: undefined },
    { mode: "asset", assetId: "sample-card", unexpected: true },
  ];

  for (const input of invalidInputs) {
    const result = await handler(input);
    assert.equal(result.isError, true, `Accepted invalid input: ${JSON.stringify(input)}`);
    assert.equal(result.content[0].type, "text");
    assert.ok(result.content[0].text.trim().length > 0);
    assert.equal(calls, 0, "Rejected input invoked the preview callback");
  }
});

test("default previews produce deterministic escaped HTML and inline local assets", async () => {
  const handler = createPreviewCardHandler();
  for (const tag of ["script", "SCRIPT", "ScRiPt"]) {
    const input = { mode: "text", text: `  <${tag} data-label="card">alert('card')</${tag}> & preview  ` };
    const result = await handler(input);
    const preview = readPreview(result);
    assert.deepEqual(await handler(input), result);
    assert.equal(preview.mode, "text");
    assert.equal(preview.mimeType, "text/html");
    assert.ok(preview.html.includes(`&lt;${tag} data-label=&quot;card&quot;&gt;alert(&#39;card&#39;)&lt;/${tag}&gt; &amp; preview`));
    assert.doesNotMatch(preview.html, /<script\b/iu);
  }

  const asset = readPreview(await handler({ mode: "asset", assetId: "sample-card" }));
  assert.equal(asset.mode, "asset");
  assert.equal(asset.mimeType, "text/html");
  assert.match(asset.html, /data:image\/svg\+xml(?:;base64)?,/u);
  assert.doesNotMatch(asset.html, /(?:src|href)=["']https?:/u);

  assert.equal(readPreview(await handler({ mode: "text", text: "x".repeat(500) })).mode, "text");
  assert.equal(readPreview(await handler({ mode: "text", text: "😀".repeat(500) })).mode, "text");
});

test("callback failures return a generic tool error without internal details", async () => {
  const handler = createPreviewCardHandler({
    generatePreview: async () => {
      throw new Error("PRIVATE_PREVIEW_FAILURE /private/internal-path");
    },
  });
  const result = await handler({ mode: "text", text: "Card" });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.trim().length > 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PREVIEW_FAILURE|internal-path|\bat /u);
});

test("baseline changes only the top-level oneOf of the same tool schema", () => {
  const compatible = previewTool();
  const baseline = previewTool({ baseline: true });
  assert.equal(compatible.name, "preview_card");
  assert.equal(compatible.inputSchema.type, "object");
  assert.equal(compatible.inputSchema.additionalProperties, false);
  assert.deepEqual(compatible.inputSchema.properties.mode.enum, ["text", "asset"]);
  assert.ok(compatible.inputSchema.properties.text);
  assert.ok(compatible.inputSchema.properties.assetId);
  assert.equal(Object.hasOwn(compatible.inputSchema, "oneOf"), false);
  const { oneOf, ...schema } = baseline.inputSchema;
  assert.ok(Array.isArray(oneOf));
  assert.equal(oneOf.length, 2);
  assert.deepEqual({ ...baseline, inputSchema: schema }, compatible);
});
