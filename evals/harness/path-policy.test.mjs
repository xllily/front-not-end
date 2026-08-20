import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertStrictRelativePath,
  resolveContainedPath,
} from "./path-policy.mjs";

test("strict projection paths reject absolute and traversal forms", () => {
  for (const candidate of [
    "/",
    "/tmp/AGENTS.md",
    "../holdout",
    "control/../holdout",
    "C:/tmp/AGENTS.md",
    "C:\\tmp\\AGENTS.md",
    "..\\holdout",
    "fixture/./task.md",
  ]) {
    assert.throws(
      () => assertStrictRelativePath(candidate),
      { code: "INVALID_RELATIVE_PATH" },
      candidate,
    );
  }

  for (const candidate of [
    "workspace",
    "fixture/src/index.ts",
    "organization/AGENTS.md",
  ]) {
    assert.equal(assertStrictRelativePath(candidate), candidate);
  }
});

test("materialization rejects a symlink that resolves outside the declared root", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "front-not-end-path-policy-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const materializationBase = path.join(temporaryRoot, "agent");
  const declaredRoot = path.join(materializationBase, "workspace");
  const outsideRoot = path.join(temporaryRoot, "control");
  await mkdir(declaredRoot, { recursive: true });
  await mkdir(outsideRoot);
  await writeFile(path.join(declaredRoot, "task.md"), "safe");
  await writeFile(path.join(outsideRoot, "oracle.json"), "hidden");
  await symlink(outsideRoot, path.join(declaredRoot, "escape"));

  assert.equal(
    await resolveContainedPath(materializationBase, "workspace", "task.md"),
    await realpath(path.join(declaredRoot, "task.md")),
  );
  await assert.rejects(
    resolveContainedPath(materializationBase, "workspace", "escape/oracle.json"),
    { code: "PATH_OUTSIDE_DECLARED_ROOT" },
  );

  await symlink(outsideRoot, path.join(materializationBase, "escaped-root"));
  await assert.rejects(
    resolveContainedPath(materializationBase, "escaped-root", "oracle.json"),
    { code: "ROOT_OUTSIDE_MATERIALIZATION_BASE" },
  );
});
