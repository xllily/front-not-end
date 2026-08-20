# Version 0.1 Product Contract

**Coverage:** Codex + TypeScript + NestJS + PostgreSQL.

## Problem

A Frontend Developer can describe a product and ask an AI Coding Host to implement its backend without knowing the full engineering surface around the request. The input may omit relevant ecosystems, architecture options, operating models, existing enterprise infrastructure, deployment constraints, or long-term ownership costs.

The host may already know these subjects. That capability remains latent unless the work activates it, supplies or discovers the relevant context, and carries each decision through implementation and evidence. The result can therefore have working APIs and passing smoke tests while remaining incomplete as a production product.

The Backend Engineering Gap is the distance between generating working backend code and delivering a complete service that fits its real technical and organizational environment.

## Product promise

For backend-relevant work within evaluated coverage, front-not-end must:

1. activate automatically from task and repository signals or explicitly on request;
2. make activation, selected concerns, Risk Tier, and intended verification visible;
3. derive a system profile from the product goals, workload, data characteristics, delivery constraints, and operating context;
4. inspect the repository, accessible organizational context, and available platform capabilities before proposing an architecture;
5. search the relevant language, framework, platform, and service ecosystems rather than starting from a fixed technology menu;
6. compare reuse, integration, extension, managed operation, self-hosting, and custom implementation where relevant;
7. make the AI Coding Host resolve technical choices through evidence, critique, and focused experiments where feasible;
8. translate missing technical premises into consequence-oriented business questions;
9. use recorded conservative reversible defaults where safe and return BLOCKED where no safe default exists;
10. carry the selected design through implementation, production operations, and concern-specific evidence; and
11. reserve PASS for Evidence-complete work.

## Backend engineering surface

Activation scans the parts of backend engineering that can materially change the result:

- product domain, business invariants, workload shape, data characteristics, and growth path;
- architecture, consistency, security, integration, and lifecycle requirements;
- language and framework ecosystems, data and computation models, and available platform capabilities;
- execution and hosting models, deployment constraints, and service ownership;
- performance, availability, observability, incident response, backup, and recovery; and
- organization-specific standards, approved capabilities, team skills, cost, and compliance.

This is a relevance map, not a mandatory technology list. Each task should activate only the areas that could change its design, implementation, or proof.

## Project shaping and decision policy

Project labels do not map to fixed architectures. The AI Coding Host first builds a system profile from business invariants, workload and data behavior, reliability needs, delivery constraints, existing capabilities, and ownership conditions. It searches the ecosystems that fit that profile instead of selecting from a global shortlist.

For zero-to-one work, the programming language, framework, architecture, execution model, and service boundary are decision dimensions. Version 0.1 can validate only whether its reference path fits and whether the Codex Reference Adapter recognizes a mismatch; later coverage may turn other stack choices into executable outputs. For an existing system, the current stack and operating model are strong prior constraints. A change must justify migration risk, new operational burden, interoperability, and long-term ownership.

Technical choices must satisfy correctness, security, data integrity, workload, and organizational constraints. The host then selects among reuse, integration, extension, managed operation, self-hosting, and custom implementation. The chosen approach should be the simplest one that fits the whole system profile. Material complexity and custom implementation require a fit argument and a re-evaluation trigger.

The Frontend Developer supplies goals, irreducible business facts, business consequences, and permission for irreversible real-world actions. The user must not be asked to choose a backend technology or implementation pattern they cannot responsibly evaluate. Private organizational standards cannot be inferred when they are absent from the repository, connected documentation, environment, and available tools; the adapter must surface that missing ground truth or access instead of inventing it.

The user remains accountable for the project outcome. Material decisions, assumptions, consequences, incomplete evidence, and irreversible actions must remain visible; load-bearing assistance does not transfer accountability to front-not-end or the AI Coding Host.

## Host portability

The behavior contract is host-neutral. Each Host Adapter must be evaluated against its native host and a concise repository-instruction baseline under a controlled environment. Results from one host do not establish compatibility or performance on another.

## Risk and completion

Risk Tiers are Routine, Material, High, and Critical. Classification is based on consequences such as data exposure or loss, money, irreversible migration, external side effects, availability, compliance, scale, and recovery difficulty rather than technology names.

Completion States are IN_PROGRESS, PASS, FAIL, and BLOCKED. Their exact semantics and the A0-A3 Assurance Levels are defined in [Assurance and completion](assurance-and-completion.md).

## Version 0.1 boundary

Version 0.1 is one Codex Reference Adapter plus one TypeScript, NestJS, and PostgreSQL Stack Pack. This is an evaluated path, not the product's preferred architecture. The Spike also includes a boundary case where the reference path is a poor fit; success requires recognizing the mismatch instead of forcing that stack onto the task. Version 0.1 does not implement or validate cross-stack delivery.

Version 0.1 does not include:

- another host adapter;
- a model, session, workflow, orchestration, deployment, or general tool runtime;
- a generic pack schema, compiler, registry, marketplace, policy platform, or management UI;
- broad language, database, ORM, authentication, cloud, cache, queue, or infrastructure coverage;
- a starter-template product or fixed architecture-answer table; or
- a public release before the Substitution Spike is reproducible and useful.

## Release validation

Version 0.1 must pass the [evaluation protocol](evaluation.md) before release. The benchmark covers system-profile quality, backend-surface discovery, ecosystem and organization fit, reference-stack mismatch detection, avoidable custom implementation, production-delivery completeness, unsupported completion, evidence quality, false positives, and task noise.
