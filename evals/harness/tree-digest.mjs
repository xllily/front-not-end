import { createHash } from "node:crypto";
import { lstat, open, readdir, readlink, realpath } from "node:fs/promises";
import path from "node:path";

import { assertStrictRelativePath } from "./path-policy.mjs";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function failChanged(relativePath) {
  const error = new Error(`Repository changed while hashing: ${relativePath}`);
  error.code = "TREE_CHANGED_DURING_DIGEST";
  throw error;
}

function sameStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function hashFile(absolutePath, relativePath, expectedStat) {
  const handle = await open(absolutePath, "r");
  try {
    const before = await handle.stat({ bigint: true });
    if (!sameStat(expectedStat, before)) {
      failChanged(relativePath);
    }
    const content = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (!sameStat(before, after)) {
      failChanged(relativePath);
    }
    const finalPathStat = await lstat(absolutePath, { bigint: true });
    if (!sameStat(expectedStat, finalPathStat)) {
      failChanged(relativePath);
    }
    return {
      path: relativePath,
      type: "file",
      executable: (before.mode & 0o111n) !== 0n,
      contentDigest: sha256(content),
    };
  } finally {
    await handle.close();
  }
}

async function collectEntries(
  root,
  segments,
  entries,
  expectedDirectoryStat = null,
) {
  const absoluteDirectory = path.join(root, ...segments);
  const namesBefore = (await readdir(absoluteDirectory)).sort();

  for (const name of namesBefore) {
    if (name === ".git") {
      continue;
    }

    const childSegments = [...segments, name];
    const relativePath = childSegments.join("/");
    assertStrictRelativePath(relativePath);
    const absolutePath = path.join(root, ...childSegments);
    const before = await lstat(absolutePath, { bigint: true });

    if (before.isFile()) {
      entries.push(await hashFile(absolutePath, relativePath, before));
      continue;
    }
    if (before.isDirectory()) {
      await collectEntries(root, childSegments, entries, before);
      continue;
    }
    if (before.isSymbolicLink()) {
      const target = await readlink(absolutePath);
      const after = await lstat(absolutePath, { bigint: true });
      if (!sameStat(before, after)) {
        failChanged(relativePath);
      }
      entries.push({
        path: relativePath,
        type: "symlink",
        targetDigest: sha256(Buffer.from(target, "utf8")),
      });
      continue;
    }

    const error = new Error(`Unsupported repository entry: ${relativePath}`);
    error.code = "UNSUPPORTED_TREE_ENTRY";
    throw error;
  }

  const namesAfter = (await readdir(absoluteDirectory)).sort();
  if (JSON.stringify(namesBefore) !== JSON.stringify(namesAfter)) {
    failChanged(segments.join("/") || ".");
  }
  if (expectedDirectoryStat) {
    const after = await lstat(absoluteDirectory, { bigint: true });
    if (!sameStat(expectedDirectoryStat, after)) {
      failChanged(segments.join("/") || ".");
    }
  }
}

export async function computeRepositoryTreeDigest(repositoryRoot) {
  const root = await realpath(repositoryRoot);
  const rootStat = await lstat(root, { bigint: true });
  if (!rootStat.isDirectory()) {
    const error = new TypeError("Repository root must be a directory");
    error.code = "INVALID_REPOSITORY_ROOT";
    throw error;
  }
  const entries = [];
  await collectEntries(root, [], entries, rootStat);
  entries.sort((left, right) =>
    Buffer.from(left.path, "utf8").compare(Buffer.from(right.path, "utf8")),
  );

  const canonicalManifest = JSON.stringify({
    format: "front-not-end-repository-tree-v1",
    entries,
  });
  return sha256(Buffer.from(canonicalManifest, "utf8"));
}
