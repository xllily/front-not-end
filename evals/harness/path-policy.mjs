import { readFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";

const commonSchema = JSON.parse(
  readFileSync(new URL("../contracts/common.schema.json", import.meta.url), "utf8"),
);

export const strictRelativePathPattern = new RegExp(
  commonSchema.$defs.strictRelativePath.pattern,
);

export function assertStrictRelativePath(candidate) {
  if (typeof candidate !== "string" || !strictRelativePathPattern.test(candidate)) {
    const error = new TypeError(`Unsafe projection path: ${String(candidate)}`);
    error.code = "INVALID_RELATIVE_PATH";
    throw error;
  }

  return candidate;
}

function escapes(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

export async function resolveContainedPath(materializationBase, declaredRoot, candidate) {
  assertStrictRelativePath(declaredRoot);
  assertStrictRelativePath(candidate);

  const resolvedBase = await realpath(materializationBase);
  const resolvedRoot = await realpath(path.resolve(resolvedBase, declaredRoot));
  if (escapes(resolvedBase, resolvedRoot)) {
    const error = new Error(`Declared root escapes materialization base: ${declaredRoot}`);
    error.code = "ROOT_OUTSIDE_MATERIALIZATION_BASE";
    throw error;
  }

  const resolvedCandidate = await realpath(path.resolve(resolvedRoot, candidate));
  if (escapes(resolvedRoot, resolvedCandidate)) {
    const error = new Error(`Projection path escapes declared root: ${candidate}`);
    error.code = "PATH_OUTSIDE_DECLARED_ROOT";
    throw error;
  }

  return resolvedCandidate;
}
