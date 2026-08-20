# Evaluation Workspace

This directory contains the public authoring contracts and Agent-visible inputs
for the Version 0.1 Substitution Spike. It is not a general evaluation platform,
and it is never used directly as an Agent run workspace.

## Trust boundary

The benchmark has two trust domains:

1. **Agent input plane:** the exact task, materialized fixture repository, and
   deliberately supplied organization or operating context.
2. **Control plane:** oracles (including their deterministic case-specific
   rules), expected concerns and outcomes, holdout cases, and raw evaluator
   results.

The control plane must live in a separately permissioned location. The current
private control root is outside this repository. Merely placing control files in
another directory under `evals/` is not isolation.

Before every run, the harness must create a fresh Agent workspace from an
explicit allowlist. It must not run Codex in this authoring checkout or mount the
control root. A preflight read-boundary check records the projected file digest,
resolved-path containment result, and any observed failure. It fails closed if
an oracle, hidden rule, holdout artifact, or undeclared input is readable. A
contaminated run remains schema-valid as a capture, is classified
`INVALID_CONTAMINATED`, is excluded from comparison metrics, and can never
support a positive Spike verdict.

Adapter development uses development cases only. At least one holdout group is
owned by an evaluator steward and is not readable by the Adapter development
process. Only its non-revealing commitment record is public. The commitment
contains a digest of the canonical sealed bundle and must be committed before
Adapter implementation begins. Holdout contents may be opened only by the
control-side evaluation process after the evaluated Adapter revision is frozen.

## Layout

```text
evals/
├── contracts/   # public schemas and deterministic evaluator contract
├── cases/       # Agent-visible development task inputs only
├── fixtures/    # reproducible fixture definitions and Agent projections
├── harness/     # control-side containment and evidence primitives
└── holdouts/    # non-revealing digest commitments only
```

Oracles (including their `deterministicRule` values), holdout contents, and
evaluator outputs do not belong in this tree. Directories are created only with
their first real contract or input artifact; empty framework scaffolding is
avoided.

## Frozen artifacts

Each development case must freeze, before Adapter output is inspected:

- a stable case identifier and exact task wording;
- a starting repository revision and reproducible fixture materialization;
- the exact Agent input projection and its digest;
- the comparison environment requirements and three intervention arms;
- independent run count and capture requirements; and
- an opaque oracle ID; the control-side oracle links back to the frozen public
  case by digest, avoiding a circular case/oracle hash dependency.

The control-side oracle separately freezes:

- required and forbidden concerns;
- expected solution-space opportunities, available repository or platform
  capabilities, and organization constraints;
- required system-profile dimensions, allowed or forbidden architecture
  characteristics, and expected reference-stack fit;
- forbidden avoidable reimplementation and unjustified infrastructure;
- required production surfaces;
- expected Risk Tier or allowed range;
- High and Critical must-catch concerns;
- false-positive and Routine-task noise tolerance;
- deterministic scoring and continuation rules; and
- for every requirement, its minimum Assurance Level, whether it blocks
  completion, accepted evidence categories, deterministic insufficient-level
  outcome, and factual or expert basis.

The schemas in [`contracts/`](contracts/) keep Agent inputs structurally
separate from control-side expectations. Agent-visible case data cannot contain
oracle or scoring fields.

## Comparison arms

Each fixture is evaluated as:

1. bare Codex;
2. Codex with the fixture's concise hand-authored backend `AGENTS.md`; and
3. Codex with front-not-end Version 0.1.

Baseline instructions live with their benchmark fixtures and are frozen test
inputs. The three arms differ only in this intervention. Every inherited outer
instruction, available skill and plugin, Host setting, exact model version,
tool and filesystem permission, operating-environment field, task input,
fixture revision, run count, and evidence access must otherwise match.

The manifest binds `arm` to the intervention it actually loads. Bare Codex has
no intervention artifacts, source revision, or skill packages; the concise
baseline has exactly one frozen `AGENTS.md`; and the front-not-end arm records
its frozen artifacts, source revision, and executable skill packages.

These arms are the Version 0.1 instance of a host-neutral comparison. Every
future Host Adapter must repeat the comparison on its own host. Results do not
transfer between hosts.

## Revision gate

No fixture materialization or benchmark run may start from an unborn or dirty
repository. The authoring repository, every fixture repository, the Adapter
under evaluation, the baseline intervention, and the holdout commitment must
all resolve to immutable revisions or content digests. The current repository
does not yet have `HEAD`, so this gate remains closed until the owner creates the
initial commit.

## Evidence and evaluation

The evaluator derives results from the frozen oracle and captured artifacts. It
does not trust a model-generated PASS label, prose claim, stale result, or a
configured-but-unexecuted check. Every invocation and evidence item binds to a
repository tree digest; repository-dependent PASS evidence must match the final
delivered tree.

Every oracle requirement declares a required A0-A3 Assurance Level. Actual
assurance is derived from evidence provenance, not the Agent's label. If actual
assurance is lower than required, the oracle's predeclared `IN_PROGRESS`,
`FAIL`, or `BLOCKED` outcome is used and the result remains non-passing.
Adapter-authored controls have an A1 ceiling; A2 and A3 require a pre-existing
repository or environment enforcement source.

Committed run artifacts must avoid secrets and unnecessary source or command
output. Large, sensitive, or environment-specific artifacts should be
represented by a reproducible locator and digest when the case design permits
it.

See the [schema index](contracts/README.md), the
[deterministic evaluator contract](contracts/evaluator-contract.md), and the
[full evaluation protocol](../docs/evaluation.md).
