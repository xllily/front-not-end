function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function assertEvidenceTreeBinding(
  runArtifact,
  evidence,
  { requireFinalTree = true } = {},
) {
  const invocations = new Map(
    runArtifact.toolInvocations.map((invocation) => [
      invocation.invocationId,
      invocation,
    ]),
  );

  for (const invocationId of evidence.sourceInvocationIds) {
    const invocation = invocations.get(invocationId);
    if (!invocation) {
      fail("UNKNOWN_SOURCE_INVOCATION", `Unknown invocation: ${invocationId}`);
    }
    if (invocation.repositoryRevision !== evidence.repositoryRevision) {
      fail("EVIDENCE_REVISION_MISMATCH", `Revision mismatch: ${invocationId}`);
    }
    if (invocation.repositoryTreeDigestAfter !== evidence.repositoryTreeDigest) {
      fail("EVIDENCE_TREE_MISMATCH", `Tree mismatch: ${invocationId}`);
    }
  }

  if (requireFinalTree) {
    if (evidence.repositoryRevision !== runArtifact.repositoryAfter.revision) {
      fail("STALE_EVIDENCE_REVISION", "Evidence revision is not the final revision");
    }
    if (evidence.repositoryTreeDigest !== runArtifact.repositoryAfter.treeDigest) {
      fail("STALE_EVIDENCE_TREE", "Evidence tree is not the delivered tree");
    }
  }

  return evidence;
}
