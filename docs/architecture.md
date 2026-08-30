# Version 0.1 Architecture

## Product seam

front-not-end is an installable Skill inside an existing Coding Agent:

```text
product request + repository + available context
  -> activate front-not-end
  -> inspect current capabilities and constraints
  -> select only relevant backend concerns
  -> decide and implement
  -> run current checks
  -> deliver behavior, evidence, and genuine blockers
```

The Skill changes Agent behavior without owning the model loop, session,
orchestration, or tools.

## Current components

### Product Harness

[`skills/front-not-end/SKILL.md`](../skills/front-not-end/SKILL.md) defines the
responsibility boundary and operating loop. Its conditional
[`skill-learning.md`](../skills/front-not-end/references/skill-learning.md)
reference lets the Agent reuse an existing Skill or persist task learning only
when real evidence justifies it.

### Product tracers

Each tracer contains:

- a product request and the organization context available to the Agent;
- a small Node.js repository with an existing platform capability;
- repository-native tests; and
- a control-side behavioral acceptance test.

The List/Search tracer proves reuse of scoped pagination and preservation of
its opaque cursor contract. The project-creation tracer proves reuse of an
authorized, workspace-scoped, idempotent mutation with no unauthorized
repository side effect.

Workspace isolation and `project:create` are facts of these fixtures, not
default architecture or authorization policy for other products.

Existing tested behavior and public shapes are compatibility contracts. The
Agent keeps a capability unchanged unless an executable failing example proves
that the product request cannot fit it.

### Restricted acceptance runner

[`run-tracer-acceptance.mjs`](../evals/harness/run-tracer-acceptance.mjs)
executes completed Agent code in a disposable container. A fixed case allowlist
selects the acceptance test. Before execution, the runner copies only regular,
single-link `package.json` and `src/` files into a bounded snapshot; links,
special files, nested filesystems, oversized inputs, and concurrent changes
fail closed.

The container uses a pinned multi-architecture Node image, no host or external
network route, read-only snapshot and control mounts, a non-root user, dropped
capabilities, `no-new-privileges`, and CPU, memory, PID, output, and wall-time
limits for container execution. Node permissions still deny filesystem writes,
child processes, and Workers inside that boundary. The host force-kills and
removes the exact container on failure or timeout.

Success also requires a challenge-bound receipt emitted only after every
allowlisted control test completes. Agent output is not the verdict, and all
returned terminal control characters are escaped.

Runtime path evidence uses a control-owned module hook rather than stack text.
The hook wraps the allowlisted platform export with a private per-run marker
bound to the exact repository object; direct calls and forged stack/source
labels fail closed. Frozen intrinsics protect the remaining control-side
language primitives. Workspace CommonJS is rejected before execution so its
ambient loader API cannot extend the control-owned module-hook chain; the
current tracer fixtures use native ESM.

This containment assumes trusted runner/control bytes, pinned image contents,
Docker client and daemon, daemon-side host, host kernel or Docker Desktop VM,
and container-runtime enforcement. The image digest prevents tag drift, not a
malicious or vulnerable image; daemon compromise and container-runtime escape
remain outside the Harness boundary.

The behavioral tests observe actual paging or mutation results and verify that
repository access passes through the relevant existing platform helper. They
do not trust source wording, comments, or an unused import.

## Growth rule

The current architecture deliberately has no generic evaluator, schema family,
Assurance model, holdout system, or multi-case suite. A shared mechanism is
introduced only after at least two proven product slices expose the same
failure and a local Skill or test change cannot solve it.
