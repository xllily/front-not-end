# Version 0.1 Architecture

## Architectural role

front-not-end is an Adapter Layer. It connects a host-neutral backend behavior contract and one Stack Pack to Codex through Codex-native extension surfaces. It does not own or replace the host's model loop, session, tools, or orchestration.

The highest product seam is externally observable:

```text
product goal + repository + available operating context
  -> activation
  -> system profile and relevant engineering surface
  -> ecosystem and existing capability discovery
  -> architecture, stack, concern, and Risk Tier selection
  -> technical resolution and implementation
  -> review and tool execution
  -> checked evidence
  -> Completion State
```

Tests target this flow rather than internal prompt wording or a speculative platform abstraction.

Version 0.1 evaluates a narrowed projection of this seam with one fixed reference stack. The stack is fixed to isolate the activation behavior, not because front-not-end treats it as the default answer. A boundary fixture checks that the adapter recognizes when the reference stack does not fit. Cross-stack implementation remains outside Version 0.1 coverage.

## Version 0.1 components

### Codex Reference Adapter

The adapter owns:

- automatic and explicit activation policy;
- visible activation output;
- reference-stack fit and mismatch handling;
- concern and risk routing;
- technical-resolution instructions;
- proof routing; and
- completion discipline.

Codex owns technical analysis, recommendation, implementation, critique, and execution through the tools and repository context available to it.

### TypeScript, NestJS, and PostgreSQL Stack Pack

The Stack Pack supplies the first evaluated vertical path:

- task and repository signals;
- stack-specific concerns and solution-space prompts;
- repository, organization, and platform-context discovery;
- guidance for ecosystem search, reuse, managed operation, self-hosting, and custom implementation;
- proof recipes and tool bindings; and
- positive, negative, boundary, and hidden-risk evaluation cases.

It is an evaluated coverage boundary, not a universal backend abstraction.

### Executable skill packages

The Codex Adapter projects a bounded Stack Pack capability through a small
Codex-native skill package: concise decision policy in `SKILL.md`, conditional
sourced references, and deterministic inspection or verification scripts only
where they add repeatable value. The package follows
`activate -> inspect -> decide -> execute -> verify -> evidence`; it is more
than a prompt collection but remains inside the Host's existing tool loop.

Script output is linked into the existing evidence and Assurance contracts.
Instructions and references remain A0, Adapter-authored checks have an A1
ceiling, and only detected pre-existing controls can supply A2 or A3. Package
structure, dependency disclosure, vendor boundaries, and evaluation obligations
are defined in [Executable skill packages](executable-skill-packages.md).

Version 0.1 implements only the concrete package required by the first frozen
tracer bullet. It does not introduce a generic package schema, marketplace,
installer, dependency resolver, or cross-Host distribution layer.

### Deterministic evaluator

The evaluation suite uses a small evaluator that reads frozen expectations and captured run artifacts. It computes benchmark outcomes independently and never accepts Codex's self-reported PASS as proof.

The evaluator and all case-specific expectations execute in a separately
permissioned control plane. Codex runs in a freshly materialized allowlisted
fixture projection and cannot read oracles, expected outcomes, oracle
`deterministicRule` values, holdout contents, or prior reports. Isolation and
cross-arm environment parity are validity gates evaluated before scoring.

This evaluator is intentionally bounded. Version 0.1 does not build a general evaluation platform.

## Activation modes

Automatic and explicit activation must produce the same externally observable obligations for the same task:

- selected Risk Tier and reasons;
- activated concerns;
- intended evidence;
- actual Assurance Level;
- technical decision and material assumptions; and
- final Completion State.

Automatic activation must be visible. A skipped activation or required check remains visible and non-passing. Negative and boundary cases ensure Routine work is not flooded with High/Critical ceremony.

## Responsibility boundary

front-not-end activates and disciplines the host's latent backend capability; it is not the source of a model, database, framework, deployment environment, or organizational ground truth. It directs the host to inspect the context available through the repository and tools, and to expose material facts or access that are still missing.

In Version 0.1, Codex carries backend technical work within evaluated coverage. The Frontend Developer supplies goals, irreducible business facts, and permission for irreversible actions, while retaining accountability for the project outcome.

## Product composition

Future coverage grows along four independent axes:

- **Host Adapter:** projects the behavior contract into an AI coding host.
- **Stack Pack:** binds activation, ecosystem knowledge, tools, and proof to a practical language and framework path.
- **Capability Pack:** adds the decision logic and proof required for a class of workload or system capability.
- **Provider Binding:** maps a justified architecture to the services and constraints of a deployment provider.

Project shaping happens before pack selection. For zero-to-one work, the system profile determines which Stack Packs, Capability Packs, and Provider Bindings are relevant. Existing projects begin with their installed stack and operating model. These axes compose; the project does not create a separate pack for every possible combination.

A Host Adapter does not inherit another adapter's evaluation result. Codex is the Reference Adapter for Version 0.1. A future Claude Code Adapter must be evaluated against the same externally observable behavior contract in its own host environment.

## Deferred architecture

The following earlier design directions are intentionally deferred until the adapter thesis is proven:

- a multi-host adapter layer;
- generic canonical records and schemas;
- a compiler and generated adapter matrix;
- a registry and lockfile system;
- a general CLI product;
- a management UI; and
- generic provider, capability, and community-pack infrastructure.

They must not be introduced merely to prepare for a hypothetical roadmap.
