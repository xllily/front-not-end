# front-not-end

Activate the backend engineering capability already inside AI coding agents.

Generating backend code is easy. Delivering a production service still requires architecture, data systems, middleware, cloud and platform choices, security, observability, deployment, recovery, and alignment with the standards already used by the organization. A frontend developer can describe the product clearly without knowing which of those subjects need to enter the conversation.

front-not-end is a backend agency activation adapter. It makes the AI coding agent build a system profile from the product goal, workload, data, constraints, and available operating context. The agent then searches the relevant engineering ecosystems, chooses an approach, and carries that decision through implementation and verification. The user supplies product goals, business facts, and permission for irreversible real-world actions. Within evaluated coverage, the agent carries the backend technical decisions.

The goal is a production-shaped result, not an API-shaped demo. Passing smoke tests is useful evidence, but it does not by itself prove that the system fits its deployment environment, uses the right data path, can be observed and recovered, or satisfies the organization's constraints.

## How it works

```text
product goal + repository + available operating context
  -> system profile and relevant engineering surface
  -> ecosystem search and existing capability discovery
  -> architecture, stack, Risk Tier, and technical decisions
  -> implementation and review
  -> checks and evidence
  -> IN_PROGRESS | PASS | FAIL | BLOCKED
```

## First release

The first release evaluates Codex on one TypeScript, NestJS, and PostgreSQL path. That path is a test boundary, not a preferred stack. Cross-stack selection remains unverified until later releases cover it.

front-not-end works through the existing AI coding host. It does not replace that host or add another agent runtime. It uses the host's existing model, tools, and repository access.

Version 0.1 results apply only to Codex. Other hosts, including Claude Code, must be evaluated separately.

front-not-end has no fixed technology menu. For a new system, the language, framework, data architecture, execution model, and managed or self-hosted services may all be technical decisions. In an existing system, the installed stack and operating model are strong constraints, so switching must justify its migration and ownership cost. If the best fit lies outside evaluated coverage, front-not-end must report that boundary rather than force the reference stack onto the task.

PASS requires current, checked evidence. A prompt, an old test result, or the model's own claim is not enough.

## Documentation

- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Assurance and completion](docs/assurance-and-completion.md)
- [Executable skill packages](docs/executable-skill-packages.md)
- [Evaluation protocol](docs/evaluation.md)
- [Evaluation workspace](evals/README.md)
- [简体中文](README.zh-CN.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
