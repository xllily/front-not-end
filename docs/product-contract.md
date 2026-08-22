# Version 0.1 Product Contract

## Product promise

For backend-relevant work, front-not-end makes the Coding Agent:

1. inspect the request, repository, available operating context, dependencies,
   conventions, tests, and existing capabilities before designing;
2. activate only backend concerns that can change this task's implementation or
   proof;
3. preserve tested behavior and existing public shapes unless a failing test or
   executable example proves they cannot express the product request;
4. choose the simplest safe, reversible, repository-fit technical solution;
5. ask the user only for business facts, consequences, access, cost, or
   irreversible authorization that cannot be inferred;
6. carry the chosen path through its relevant data, security, reliability,
   error, migration, and operational surfaces;
7. run current checks against the delivered state; and
8. report working behavior, important consequences, actual evidence, and
   remaining blockers in product-readable language.

The user is not expected to identify backend failure modes or select unfamiliar
backend patterns.

## Relevance rule

Authentication, authorization, tenant isolation, transactions, idempotency,
pagination, migration, observability, deployment, and recovery are possible
engineering surfaces, not a checklist for every task.

The Agent activates a concern only when product facts, repository structure, or
available operating context make it relevant. In particular, tenant isolation
applies when the product actually has organization, workspace, customer, or
similar data boundaries; it is not a default requirement for every admin
system.

## Decision boundary

| Situation | Owner |
| --- | --- |
| Safe, reversible technical choice | Agent decides and implements |
| Missing fact changes product behavior or policy | User decides the consequence |
| Access, cost, external effect, or irreversible action | User authorizes |
| Missing evidence | Agent verifies or reports the gap |

## Version 0.1 boundary

Version 0.1 contains one installable Codex Skill and one existing-project
List/Search tracer. It does not claim:

- another Host or a new Agent Runtime;
- broad language, framework, database, or infrastructure coverage;
- a generic evaluator, schema system, control plane, marketplace, or UI;
- a preferred backend architecture; or
- recursive modification of front-not-end itself.

The current acceptance contract is documented in
[`evaluation.md`](evaluation.md).
