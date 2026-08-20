# Evaluation Harness Primitives

This directory contains small, case-independent control-side primitives used by
fixture materialization and evaluation. It is not projected into an Agent run
workspace.

`path-policy.mjs` loads the canonical strict relative-path pattern from
`contracts/common.schema.json` and then performs the filesystem check that JSON
Schema cannot: after following symlinks, the declared root must remain below the
Host-owned materialization base and each selected path must remain below that
root. Any parse, resolution, or containment failure is fail-closed and must be
captured by the comparison environment manifest.

`evidence-policy.mjs` binds evidence to its source invocation's post-command
tree and, for repository-dependent requirements, to the final delivered tree.
Reusing a check after an uncommitted code change therefore fails as stale
evidence even though the Git revision has not changed.

`tree-digest.mjs` computes that identity on the control side from a sorted,
versioned manifest of every non-`.git` file and symlink under the repository
root. File content, executable mode, relative path, and symlink target are
covered. A tree that changes during hashing fails closed.
