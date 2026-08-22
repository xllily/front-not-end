---
name: front-not-end
description: Use when a product or frontend request creates or changes APIs, server-side data, authentication, permissions, persistence, background jobs, integrations, deployment, or other production backend behavior.
---

# front-not-end

Turn product intent into a production-capable change. The user owns desired
behavior, irreducible business facts, real constraints, and authorization for
irreversible actions. You own backend technical completeness.

## Skill reuse and learning

During ground-truth discovery, if an existing Agent Skill could supply a
missing specialized capability, read
[references/skill-learning.md](references/skill-learning.md) and follow its
reuse branch. After proving a task, read its learning branch only when the work
contained a user correction, non-obvious failure and recovery, repeated
workflow, or reusable deterministic check. Skip it for routine work without one
of those signals.

## Operating loop

### 1. Establish ground truth

Inspect the request, repository instructions, dependencies, conventions,
existing capabilities, tests, and available organization or runtime context
before designing. Treat the current stack and operating model as strong
constraints; prefer reuse or a small extension over new machinery.

Treat tested behavior and existing public shapes as compatibility contracts.
Before extending a capability or translating its output, produce a failing
repository test or executable example showing that its current contract cannot
express the requested behavior. Without that evidence, delegate to it unchanged.

Infer actors, data boundaries, invariants, failure consequences, and realistic
load. Activate only concerns that can change this task's design, implementation,
or proof—never dump a generic production checklist.

**Done when:** you know what the repository already provides, which boundaries
the change crosses, which existing contracts must remain unchanged, and which
missing facts are genuinely unknowable.

### 2. Take the technical decisions

Choose the simplest safe, reversible, repository-fit solution. When relevant,
own data constraints, API and error semantics, validation, authorization,
transactions, concurrency, idempotency, query shape, migrations, operations,
and proof. Urgency or a request to “keep it tiny” does not transfer this
responsibility to the user.

Ask only when blocked by an irreducible product consequence, undefined policy
or permission boundary, unavailable real-world access or constraints, or an
irreversible/external action requiring authorization. Ask in business terms:
“Must users recover deleted content?”, not “soft or hard delete?”. Continue all
safe, unblocked work first.

**Done when:** no technical choice has been pushed to a user who cannot evaluate
it, and every remaining question changes a business consequence or authority.

### 3. Carry the change through

Implement the complete selected path, including its relevant error, security,
data-integrity, reliability, migration, and operational surfaces. Keep routine
work light; increase depth only with consequence and risk.

**Done when:** the requested behavior and each task-specific failure mode are
implemented or explicitly blocked by a fact or authority you cannot supply.

### 4. Prove the final state

Run repository-native checks plus focused tests for the decisions and failure
modes introduced. Fix failures and rerun. Evidence must come from the final
working tree; prompts, configured commands, old results, and assertions are not
evidence.

**Done when:** every material completion claim has current evidence, or is
honestly reported as unverified or blocked.

### 5. Deliver a product-readable result

Report what now works, important decisions and user-visible consequences,
checks actually run and their results, and only remaining blockers or risks.
Do not expose routine backend ceremony or claim completion without proof.

## Decision boundary

| Situation | Owner |
| --- | --- |
| Safe, reversible technical choice | Agent decides and implements |
| Missing fact changes product behavior or policy | User decides the consequence |
| Access, cost, external effect, or irreversible action | User authorizes |
| Missing evidence | Agent verifies or reports the gap |
