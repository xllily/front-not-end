import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { computeRepositoryTreeDigest } from "./tree-digest.mjs";

test("repository tree digest changes after an uncommitted edit", async (t) => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "front-not-end-tree-digest-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, ".git"));
  await writeFile(path.join(repositoryRoot, ".git", "ignored"), "one");
  await writeFile(path.join(repositoryRoot, "feature.ts"), "export const value = 1;\n");

  const testedTree = await computeRepositoryTreeDigest(repositoryRoot);
  await writeFile(path.join(repositoryRoot, ".git", "ignored"), "two");
  assert.equal(await computeRepositoryTreeDigest(repositoryRoot), testedTree);

  await writeFile(path.join(repositoryRoot, "feature.ts"), "export const value = 2;\n");
  const deliveredTree = await computeRepositoryTreeDigest(repositoryRoot);
  assert.notEqual(deliveredTree, testedTree);
  assert.match(testedTree, /^sha256:[0-9a-f]{64}$/);
  assert.match(deliveredTree, /^sha256:[0-9a-f]{64}$/);
});
