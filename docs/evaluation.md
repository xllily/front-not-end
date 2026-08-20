# Version 0.1 Evaluation Protocol

Evaluation is the first implementation slice because the product claim must be falsifiable before adapter behavior is built.

## Hypothesis

Hold the AI Coding Host, task, repository, model configuration, tools, permissions, and operating environment constant. Adding front-not-end should make the host cover more required backend work and choose an approach that fits the actual environment. It should refuse unsupported completion and reject a reference path when the frozen facts make that path unsuitable.

Version 0.1 runs this comparison with Codex. A future Host Adapter must repeat it on its own host. A Codex result does not prove Claude Code compatibility.

## Questions the Spike must answer

The Substitution Spike tests whether front-not-end:

- derives a useful system profile from product facts and accessible context;
- explores relevant backend engineering areas that were absent from the product brief;
- discovers and follows accessible organizational standards and existing platform capabilities;
- searches relevant ecosystems without relying on a fixed technology menu;
- distinguishes when the reference stack fits from when it should be rejected;
- compares established capabilities, managed operation, self-hosting, and custom implementation;
- carries a functional feature into a bounded production shape, including its operating surface;
- reduces unsupported completion;
- avoids handing backend technology selection back to the Frontend Developer;
- links completion to current checked evidence;
- avoids inappropriate risk escalation, irrelevant concern loading, and fixed-stack forcing; and
- adds value beyond a concise repository instruction file.

## Three comparison arms

Version 0.1 instantiates the host-neutral comparison as three arms. Every case runs with identical task wording, starting repository state, model/version, permitted tools, run count, and evidence access except for the intervention under comparison:

1. **Bare Codex:** no front-not-end guidance.
2. **Concise AGENTS baseline:** Codex plus one hand-authored backend `AGENTS.md` frozen with the fixture.
3. **front-not-end Version 0.1:** Codex plus the Adapter and Stack Pack behavior under evaluation.

The baseline `AGENTS.md` is part of the fixture.

## Frozen corpus

The minimum corpus contains:

- one bounded zero-to-one TypeScript, NestJS, and PostgreSQL brief with a frozen deployment target, organization profile, and operating requirements;
- one zero-to-one boundary brief whose frozen system profile makes the Version 0.1 reference stack a poor fit; this case tests mismatch detection, not implementation in another stack;
- a multi-tenant List/Search change with existing repository and data-access capabilities that must be discovered rather than bypassed;
- a webhook or credits change involving idempotency, transactions, retries, ordering, external effects, and a deliberate reuse-versus-build decision; and
- a sensitive schema or data-lifecycle change involving migration and rollback consequences.

The corpus includes positive, negative, and boundary cases. Each case freezes before adapter output is inspected:

- task input and starting repository state;
- required and forbidden concerns;
- expected solution-space opportunities, available capabilities, and organization constraints;
- required system-profile dimensions and allowed or forbidden architecture characteristics;
- expected reference-stack fit or mismatch;
- forbidden avoidable reimplementation and unjustified infrastructure;
- required production surfaces such as configuration, deployment, observability, or recovery where applicable;
- expected Risk Tier or allowed range;
- High and Critical must-catch concerns;
- for every oracle requirement, the minimum A0-A3 Assurance Level, whether it
  blocks completion, accepted evidence categories, and the deterministic
  non-passing result when actual assurance is insufficient;
- false-positive and Routine-task noise tolerance; and
- scoring and continuation rules.

Every oracle item also records its basis: a fixture fact, repository or
executable invariant, product or organization rule, or attributable expert
judgment with a frozen rationale. Expected answers cannot be introduced or
changed after Adapter output is inspected without creating a new oracle
revision and invalidating affected runs.

## Evaluation isolation and holdout

The authoring checkout is not an Agent run workspace. Every run materializes a
fresh input projection containing only the exact task, fixture repository, and
deliberately supplied organization or operating context. Oracles (including
their deterministic case-specific rules), expected outcomes, holdout contents,
and prior reports remain in a separately permissioned control plane.

A preflight check records the projection allowlist and digest, resolved-path
containment, repository cleanliness, and any observed failure. Projection paths
must be strict relative paths, and the materializer must reject normalized or
symlink-resolved escapes from the declared root. A control-side or undeclared
readable artifact makes the run invalid. The failure remains schema-valid as a
capture, contributes no comparison metrics, and cannot support continuation.
Directory separation inside one readable workspace does not satisfy this rule.

Task Completion State and benchmark expectation result are separate. A boundary
case may correctly reject the reference stack and remain task-level BLOCKED or
IN_PROGRESS because cross-stack delivery is outside Version 0.1, while still
satisfying the benchmark's mismatch expectation. The evaluator freezes the
allowed task states and never converts unsupported implementation into PASS.

At least one group of final cases is held out from Adapter development. Before
Adapter implementation begins, an evaluator steward seals the canonical
holdout bundle and commits a non-revealing digest, timestamp, case count, and
coarse coverage summary. Holdout tasks, fixtures, and oracles—including their
deterministic rules—are opened only after the Adapter revision is frozen. Early
disclosure invalidates the group and requires a newly authored and committed
holdout.

## Run protocol

Every High and Critical case runs at least three independent times per arm. A front-not-end omission of any predeclared High or Critical must-catch concern blocks a positive Spike verdict pending review.

Run artifacts retain, where available:

- exact task input and repository revision;
- comparison environment manifest;
- host and model version;
- adapter version and activation mode;
- tool invocations and outcomes;
- task output and linked evidence, including the repository tree digest tested
  by every invocation and evidence item;
- deterministic evaluator result;
- elapsed time; and
- token or cost observations.

The comparison environment manifest records inherited outer instructions and
their load order, available skills and plugins with versions and configuration
digests, Host version and settings, exact model version and settings, tool,
filesystem, network, and approval permissions, operating-environment fields,
Agent input projection, and clean repository revision. The three arms differ
only in the frozen intervention being evaluated. Any other manifest drift
invalidates the affected comparison rather than being treated as product
performance.

Each manifest also binds the arm label to its actual intervention contents.
Bare Codex carries no intervention artifacts, source revision, or skill
packages; the concise baseline carries exactly one frozen `AGENTS.md` and no
skill packages; and front-not-end carries frozen intervention artifacts, source
revision, and at least one executable skill package.

For the front-not-end arm, the intervention capture also records the exact skill
package revision and digest, loaded `SKILL.md`, conditionally loaded references,
helper versions, declared dependency/auth/network/cost state, and the executed
helper outputs linked into the run artifact. Merely shipping a script or skill
file earns no credit; evaluation scores observed decisions, tool execution,
evidence, and Completion State.

No fixture or benchmark run begins from an unborn or dirty repository. The
manifest records an observed dirty state so the validity gate can classify it;
it does not discard the capture as schema-invalid. The authoring repository,
fixture, baseline, Adapter, oracle, and holdout commitment must resolve to
immutable revisions or content digests.

Repository revision alone is not evidence freshness. The evaluator rejects
repository-dependent evidence whose tested tree digest does not equal the
relevant final repository tree; a check run before an uncommitted change cannot
support PASS for the changed result.

## Metrics

The report separates rather than collapses:

- High/Critical concern recall;
- backend-surface and solution-space recall;
- system-profile completeness;
- reference-stack fit and mismatch detection;
- organization and ecosystem fit;
- avoidable custom implementation and unjustified infrastructure;
- production-delivery completeness;
- unsupported-completion rate;
- evidence sufficiency and freshness;
- false-positive burden;
- inappropriate Risk Tier escalation;
- backend technology questions handed to the user;
- run-to-run variance; and
- time and token or cost observations.

## Continuation rule

Version 0.1 proceeds only when it:

1. detects every frozen High and Critical must-catch concern across its evaluated runs;
2. satisfies every frozen must-follow organizational constraint and must-discover existing capability;
3. accepts the reference stack in the frozen fit case and rejects it in the mismatch case for the predeclared reasons;
4. produces zero unsupported PASS results;
5. improves a predeclared activation metric, such as system-profile completeness, ecosystem fit, production completeness, or unsupported-completion rate, over both baselines;
6. does not regress the other primary metrics;
7. stays within the frozen false-positive, unjustified-complexity, and Routine-task noise tolerance; and
8. produces a reproducible verdict through the deterministic evaluator.

If both baselines are already perfect on a primary metric, an alternative decision-relevant metric and threshold must have been frozen before front-not-end output is inspected.

Failure means revise or stop the adapter thesis. It does not justify expanding into more hosts, stacks, compilers, registries, or runtimes.
