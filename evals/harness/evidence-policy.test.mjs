import assert from "node:assert/strict";
import test from "node:test";

import { assertEvidenceTreeBinding } from "./evidence-policy.mjs";

const revision = "a".repeat(40);
const testedTree = `sha256:${"b".repeat(64)}`;
const changedTree = `sha256:${"c".repeat(64)}`;

const invocation = {
  invocationId: "test-run",
  repositoryRevision: revision,
  repositoryTreeDigestBefore: testedTree,
  repositoryTreeDigestAfter: testedTree,
};
const evidence = {
  evidenceId: "test-evidence",
  repositoryRevision: revision,
  repositoryTreeDigest: testedTree,
  sourceInvocationIds: ["test-run"],
};

test("current evidence binds to its invocation and delivered tree", () => {
  const runArtifact = {
    toolInvocations: [invocation],
    repositoryAfter: { revision, treeDigest: testedTree },
  };

  assert.equal(assertEvidenceTreeBinding(runArtifact, evidence), evidence);
});

test("a post-check tree change makes prior evidence stale", () => {
  const runArtifact = {
    toolInvocations: [invocation],
    repositoryAfter: { revision, treeDigest: changedTree },
  };

  assert.throws(
    () => assertEvidenceTreeBinding(runArtifact, evidence),
    { code: "STALE_EVIDENCE_TREE" },
  );
});
