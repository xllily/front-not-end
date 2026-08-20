# Deterministic Evaluator Contract

This contract defines the bounded Version 0.1 evaluator. The implementation,
oracles, their case-specific selectors and expected values, and holdout contents
execute on the control side and are never projected into the Agent workspace.

## Inputs and outputs

For one run, the evaluator consumes content-addressed instances of:

1. a frozen case input;
2. its frozen hidden oracle;
3. the comparison environment manifest;
4. the captured run artifact.

The oracle requirement's `deterministicRule` is the only case-specific scoring
rule source. There is no separate evaluator-rules artifact or digest. The
evaluator implementation supplies only the versioned, case-independent
algorithm defined here.

Every `repositoryTreeDigest` is computed by the control-side
`front-not-end-repository-tree-v1` algorithm: SHA-256 over a sorted canonical
manifest of every non-`.git` entry's strict relative path, type, executable bit,
file-content digest, or symlink-target digest. A tree mutation observed during
hashing fails closed. Agent-provided digests are not authoritative.

It emits one `evaluator-result.schema.json` result. Aggregate comparison reports
consume only valid per-run results and their captured timing or cost fields.
Model prose, a self-reported Completion State, and an Agent-supplied Assurance
Level are observations, never authoritative evaluator inputs.

Task completion and benchmark success are separate outputs. For example, a
correct mismatch journey can derive `BLOCKED` or `IN_PROGRESS` because Version
0.1 cannot implement the suitable alternate stack, while its
`benchmarkExpectationResult` is `SATISFIED` because the Adapter rejected the
reference path for the frozen reasons. An invalid run uses `INVALID`.

## Validity gate

Validity is checked before any requirement is scored:

1. Every input digest resolves and matches its frozen artifact.
2. IDs are unique and all case, fact, requirement, metric, evidence, invocation,
   and oracle references resolve within the declared input set.
3. The authoring repository, fixture, Adapter, baseline, oracle, and holdout
   commitment resolve to immutable revisions or digests.
4. The environment capture records the observed repository and projection
   state even when a check fails. A false `cleanBefore` is invalid rather than
   schema-invalid and therefore unrecordable.
5. Every declared projection path passes the shared strict relative-path rule.
   During materialization, its normalized real path, after following symlinks,
   remains below the declared root. Any lexical failure, path escape, control
   root mount, unexpected readable artifact, failed containment check, or failed
   read-boundary preflight is captured and fails closed.
6. `arm` equals `intervention.kind`. The bare arm has no artifacts, source
   revision, or skill packages; the concise arm has exactly one frozen
   `AGENTS.md` artifact and no skill packages; the front-not-end arm has a
   frozen source revision, intervention artifacts, and at least one skill
   package.
7. Within a case, normalized environment manifests are byte-identical across
   arms after removing only `arm`, run identity/timestamps, and `intervention`.

Sensitive setting and environment values are never retained. Manifests capture
safe normalized values where needed for parity, plus secret variable names and
digests, but not secret contents.

Unresolved or mutable inputs, including a dirty starting repository, map to
`INVALID_UNFROZEN_INPUT`; malformed or referentially inconsistent capture maps
to `INVALID_CAPTURE`; a failed read or path-containment boundary maps to
`INVALID_CONTAMINATED`; and non-intervention cross-arm drift maps to
`INVALID_ENVIRONMENT_DRIFT`. Invalid runs have a non-empty reason list, no
requirement results or comparative metrics, `NOT_DERIVED_INVALID_RUN`, and an
`INVALID` benchmark result. They keep the Spike verdict non-passing and are not
reclassified as a task-level FAIL.

## Requirement evaluation

Requirements are evaluated in their frozen oracle order:

1. Select only captured artifacts permitted by the rule and evidence category.
2. Reject evidence whose digest, source invocation, repository revision,
   repository tree digest, timestamp, relevance, or outcome cannot be
   established for the current run. An invocation records its before/after tree
   digests. Evidence derived from it must name the matching after digest, and
   evidence used to satisfy a requirement about the delivered repository must
   match `repositoryAfter.treeDigest`. Changing the tree after a check makes
   that evidence stale; the old result cannot support PASS.
3. Apply the frozen normalization and operator. No semantic model judgment is
   added at evaluation time. If expert judgment is unavoidable, the frozen
   rubric and an independently captured adjudication become explicit evaluator
   inputs; the evaluator only compares that structured value.
4. Derive actual Assurance Level from enforcement provenance:
   - A0: output or reasoning with no repeatable independent check;
   - A1: a current rerunnable check or inspectable artifact;
   - A2: a verified pre-existing merge or release gate;
   - A3: a verified pre-existing runtime control.
5. Cap `adapter-authored` evidence at A1. A2 and A3 require
   `pre-existing-repository` or `pre-existing-environment` provenance and
   evidence that the gate or control actually applies.
6. A requirement is `SATISFIED` only when its rule passes and actual assurance
   is at least its required level. A lower level uses the requirement's frozen
   `insufficientAssuranceOutcome`; it can never yield PASS.
7. A forbidden item detected by its rule is `VIOLATED`. A failed executed check
   is also `VIOLATED`. Missing or unusable evidence is `UNSATISFIED` or
   `INDETERMINATE` according to the frozen rule.

Assurance ordering is `A0 < A1 < A2 < A3`.

## Derived Completion State

Only requirements with `blockingCompletion: true` affect task completion.

- Any `FAIL` impact yields `FAIL`.
- Otherwise, any `BLOCKED` impact yields `BLOCKED`.
- Otherwise, any `IN_PROGRESS` impact yields `IN_PROGRESS`.
- PASS requires every blocking requirement to be `SATISFIED` at or above its
  required Assurance Level.

This precedence is deterministic: `FAIL > BLOCKED > IN_PROGRESS > PASS`.
Non-blocking requirements still affect their declared metrics and continuation
tolerances.

`unsupportedPass` is true whenever the Agent reports PASS but the derived state
is not PASS. The Version 0.1 continuation rule requires zero unsupported PASS
results.

`benchmarkExpectationResult` is `SATISFIED` only when all must-catch and
must-follow oracle requirements pass, the derived Completion State is one of
the oracle's predeclared expected states, and all case tolerances hold. It does
not require the task-level state itself to be PASS.

## Comparison and holdout rules

The evaluator reports each metric separately; it does not collapse concern
recall, system-profile completeness, fit/mismatch detection, organization and
ecosystem fit, production completeness, evidence, noise, complexity, variance,
and cost into one opaque score.

Development runs may use visible development tasks, but their oracles remain
control-side at runtime. Holdout tasks, fixtures, and oracles—including every
`deterministicRule`—remain sealed from the Adapter development process until
the Adapter revision is frozen. Opening a holdout early invalidates its group;
a new independently authored group and pre-implementation commitment are then
required.
