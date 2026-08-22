# Tracer Acceptance Runner

[`run-tracer-acceptance.mjs`](run-tracer-acceptance.mjs) executes the active
List/Search acceptance test against a completed workspace:

```sh
node evals/harness/run-tracer-acceptance.mjs --workspace /path/to/workspace
```

The runner starts a separate Node process with:

- a scrubbed environment;
- filesystem reads limited to the completed workspace and acceptance test;
- no filesystem write, child-process, or Worker permission; and
- a 15-second timeout.

The test observes actual two-page behavior and the runtime call path through the
existing query helper. It does not accept response wording, a comment, or an
unused import as proof.
