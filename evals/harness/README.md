# Tracer Acceptance Runner

[`run-tracer-acceptance.mjs`](run-tracer-acceptance.mjs) executes an allowlisted
case acceptance test against a completed workspace:

```sh
node evals/harness/run-tracer-acceptance.mjs \
  --workspace /path/to/workspace \
  --case project-create-authorization
```

Omitting `--case` preserves the original `existing-list-search-reuse` default.
Unknown case names fail before Agent-produced code is started.

The runner starts a separate Node process with:

- a scrubbed environment;
- filesystem reads limited to the completed workspace and acceptance test;
- no filesystem write, child-process, or Worker permission; and
- a 15-second timeout.

The selected test observes actual product behavior and the runtime call path
through the relevant existing platform helper. It does not accept response
wording, a comment, or an unused import as proof.
