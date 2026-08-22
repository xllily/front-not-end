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

### List/Search tracer

The single tracer contains:

- a product request and the organization context available to the Agent;
- a small Node.js repository with an existing scoped pagination capability;
- repository-native tests; and
- a control-side behavioral acceptance test.

Workspace isolation is a fact of this fixture, not a default architecture for
other products.

Existing tested behavior and public shapes are compatibility contracts. The
Agent keeps a capability unchanged unless an executable failing example proves
that the product request cannot fit it.

### Restricted acceptance runner

[`run-tracer-acceptance.mjs`](../evals/harness/run-tracer-acceptance.mjs)
executes completed Agent code in a separate Node process. The child receives a
scrubbed environment, read access only to the completed workspace and
acceptance test, no filesystem write permission, and a timeout.

The behavioral test checks two actual pages and observes that repository access
passes through the existing query helper. It does not trust source wording,
comments, or an unused import.

## Growth rule

The current architecture deliberately has no generic evaluator, schema family,
Assurance model, holdout system, or multi-case suite. A shared mechanism is
introduced only after at least two proven product slices expose the same
failure and a local Skill or test change cannot solve it.
