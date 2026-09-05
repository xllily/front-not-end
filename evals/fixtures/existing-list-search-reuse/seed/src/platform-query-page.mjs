export function encodeCursor({ createdAt, id }) {
  return Buffer.from(JSON.stringify([createdAt, id]), "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
  if (cursor == null) return null;
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some((value) => typeof value !== "string")) {
    throw new TypeError("Invalid cursor");
  }
  return { createdAt: parsed[0], id: parsed[1] };
}

export async function queryPage(repository, tenantId, { query = null, cursor = null, limit = 25 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Invalid page size");
  const { items, next = null } = await repository.queryPage({
    tenantId,
    query,
    after: decodeCursor(cursor),
    limit,
  });
  return {
    items,
    nextCursor: next == null ? null : encodeCursor(next),
  };
}
