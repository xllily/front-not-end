# Evaluation Contract Index

These contracts are the public authoring interface for Slice 1. They describe
what the control-side harness validates; they are not copied into an Agent run
workspace.

| Artifact | Purpose | Trust domain |
|---|---|---|
| [`common.schema.json`](common.schema.json) | Shared strict relative-path definition | Public contract support |
| [`case.schema.json`](case.schema.json) | Exact task and run inputs without expectations | Agent input authoring |
| [`fixture.schema.json`](fixture.schema.json) | Reproducible repository state and projection allowlist | Agent input authoring |
| [`oracle.schema.json`](oracle.schema.json) | Hidden requirements, Assurance Levels, bases, and rules | Control only |
| [`comparison-environment.schema.json`](comparison-environment.schema.json) | Full outer environment captured for each run | Control capture |
| [`run-artifact.schema.json`](run-artifact.schema.json) | Normalized Host output and evidence | Control capture |
| [`evaluator-result.schema.json`](evaluator-result.schema.json) | Deterministic per-requirement and run result | Control output |
| [`holdout-commitment.schema.json`](holdout-commitment.schema.json) | Non-revealing commitment to sealed holdout contents | Public commitment |

All artifact schemas use JSON Schema Draft 2020-12 and reject unknown fields. A
frozen artifact is content-addressed with lowercase SHA-256. Filesystem paths use the
shared strict relative-path definition: absolute paths, dot segments, Windows
drive paths, backslashes, and NUL are rejected. Materializers must resolve each
path and symlink and prove the result remains below the declared root before
copying or exposing it; lexical schema validation alone is not containment.

The comparison environment records executable skill packages inside the arm's
intervention, including loaded artifacts, helper digests, and declared
dependency/auth/network/cost state. Captured evidence identifies whether its
producer was a Host tool, repository command, skill helper, pre-existing
control, or expert adjudication. Package presence alone is never evidence.

`authoringBaseRevision` is the immutable `HEAD` against which a case or holdout
commitment was authored; it intentionally does not attempt to contain the hash
of the commit that contains itself. The run manifest records the actual
authoring and fixture revisions used by a comparison.

The normative evaluation algorithm and precedence rules are in
[`evaluator-contract.md`](evaluator-contract.md).

[`schema-regressions.test.mjs`](schema-regressions.test.mjs) contains the
reviewed counterexamples for path traversal, arm/intervention misattribution,
failed-preflight capture, contradictory invalid results, and missing tree
identity. It runs with Ajv 8; set `AJV_2020_MODULE` to the package's
`dist/2020.js` entry when Ajv is supplied by the surrounding harness.
