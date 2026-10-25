const sampleAsset = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#e5eee9"/><circle cx="160" cy="90" r="48" fill="#36735a"/></svg>';
const assetIds = ["sample-card"];

export function previewTool({ baseline = false } = {}) {
  const inputSchema = {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["text", "asset"] },
      text: { type: "string", minLength: 1, maxLength: 500 },
      assetId: { type: "string", enum: [...assetIds] },
    },
    required: ["mode"],
    additionalProperties: false,
  };
  if (baseline) {
    inputSchema.oneOf = [
      {
        properties: { mode: { const: "text" } },
        required: ["text"],
        not: { required: ["assetId"] },
      },
      {
        properties: { mode: { const: "asset" } },
        required: ["assetId"],
        not: { required: ["text"] },
      },
    ];
  }
  return {
    name: "preview_card",
    description: "Generate a local HTML preview from mode=text with text, or mode=asset with assetId=sample-card. Supply exactly the matching field. The server rejects other combinations before generation.",
    inputSchema,
  };
}

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/gu, (character) => entities[character]);
}

export function renderLocalPreview(input) {
  const content = input.mode === "text"
    ? `<p>${escapeHtml(input.text)}</p>`
    : `<img alt="Local sample card" width="320" height="180" src="data:image/svg+xml,${encodeURIComponent(sampleAsset)}">`;
  return {
    mode: input.mode,
    mimeType: "text/html",
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local preview</title></head><body><main aria-label="Preview card">${content}</main></body></html>`,
  };
}

export function createPreviewCardHandler({ generatePreview = renderLocalPreview } = {}) {
  return async (input) => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return toolError("Preview input must be an object.");
    }
    if (Object.keys(input).some((key) => !["mode", "text", "assetId"].includes(key))) {
      return toolError("Preview input contains an unexpected field.");
    }

    let normalized;
    if (input.mode === "text") {
      if (Object.hasOwn(input, "assetId")) {
        return toolError("Text mode accepts text only; omit assetId.");
      }
      if (typeof input.text !== "string" || input.text.trim().length === 0 || [...input.text].length > 500) {
        return toolError("Text mode requires non-empty text of at most 500 characters.");
      }
      normalized = { mode: "text", text: input.text.trim() };
    } else if (input.mode === "asset") {
      if (Object.hasOwn(input, "text")) {
        return toolError("Asset mode accepts assetId only; omit text.");
      }
      if (!assetIds.includes(input.assetId)) {
        return toolError("Asset mode requires the local assetId sample-card.");
      }
      normalized = { mode: "asset", assetId: input.assetId };
    } else {
      return toolError("Preview mode must be text or asset.");
    }

    try {
      const preview = await generatePreview(normalized);
      return { content: [{ type: "text", text: JSON.stringify(preview) }], isError: false };
    } catch {
      return toolError("Local preview generation failed. Try again.");
    }
  };
}
