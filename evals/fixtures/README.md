# Fixture Contract

A fixture is a reproducible repository state plus the exact projection that an
evaluated Agent may read. It is not a copy of this authoring repository.

Each frozen fixture must:

- resolve to a clean immutable commit and content-tree digest;
- have a deterministic materialization recipe;
- own its concise baseline `AGENTS.md` intervention;
- identify every deliberately supplied organization or operating-context file;
- materialize a fresh workspace for every run;
- use an explicit allowlist rather than copying a broad parent directory;
- reject absolute paths, dot segments, Windows drive or backslash paths, and
  any normalized or symlink-resolved path outside the declared root;
- deny oracle, holdout, evaluator, control, report, and unrelated authoring
  paths; and
- run a preflight check that records the projection digest, observed repository
  cleanliness, containment result, and readable artifacts, then fails if an
  undeclared file or control-side artifact is readable.

The three comparison arms receive the same projection. Their only permitted
difference is the frozen intervention declared in the environment manifest.

No fixture is materialized while the authoring repository lacks `HEAD`. The
first fixture will be added only after the initial repository revision exists,
so its task, baseline, recipe, and digests can be committed atomically.
