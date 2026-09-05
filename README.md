# front-not-end — backend completeness for frontend-led product work

front-not-end is an Apache-2.0 Agent Skill for Codex. It lets a frontend
developer describe the product while the Coding Agent takes responsibility for
production-capable backend implementation.

It is an installable Agent Skill, not a replacement Agent or a new runtime. The
Skill makes the Agent inspect the repository and available operating context,
activate only the backend concerns that matter to the current task, choose safe
technical defaults, implement the complete path, and verify the delivered
state.

The user owns product intent, facts the Agent cannot infer, real constraints,
and authorization for irreversible or external actions. The Agent owns
technical completeness.

Use front-not-end when a frontend or product request crosses into APIs,
server-side data, authentication, permissions, persistence, background jobs,
integrations, deployment, or other production backend behavior. The canonical
Agent instructions live in [`skills/front-not-end/SKILL.md`](skills/front-not-end/SKILL.md);
[`llms.txt`](llms.txt) is the concise Agent-readable index.

**Status:** experimental `0.x`. The current evidence covers three runnable Codex
tracers, not every stack, Agent host, or backend scenario.

## Install

Install from GitHub:

```sh
npx skills add xllily/front-not-end --skill front-not-end -g -a codex -y
```

From this checkout:

```sh
npx skills add . --skill front-not-end -g -a codex -y
```

Codex's built-in installer is also supported:

```text
$skill-installer Install https://github.com/xllily/front-not-end/tree/master/skills/front-not-end
```

Start a new Agent task after installation. Backend-relevant work may activate
the Skill automatically, or you can invoke `$front-not-end` explicitly.

## Use product language

For example:

> On the projects page, show only projects from the signed-in user's current
> workspace. Add keyword search and a “load more” action. The existing project
> details experience must keep working.

The user does not need to prescribe cursors, authorization middleware, data
access patterns, or tests. The Agent discovers and owns those decisions when
they are relevant.

The example explicitly has a workspace boundary. That makes scoped access part
of this scenario; front-not-end does not assume every admin system is
multi-tenant. A single-organization application should activate only its real
authentication, role, and data-access boundaries.

## Runnable tracers

The repository ships three existing-project scenarios:

- `existing-list-search-reuse` checks scoped search and stable pagination;
- `project-create-authorization` checks an authorized, workspace-scoped,
  idempotent mutation with no unauthorized side effect; and
- `webhook-retry-idempotency` checks verified provider callbacks, scoped order
  updates, and retry-safe atomic event/order/outbox handling.

They check whether the Skill leads the Agent from a product request to a
repository-fit implementation that reuses an existing platform capability.

Use a checkout of the intended version tag for reproducible fixture inputs,
then prepare a fresh workspace:

```sh
export FNE_REPO=/path/to/front-not-end
export FNE_WORKSPACE="$(mktemp -d)"
export FNE_CASE=project-create-authorization
cp -R "$FNE_REPO/evals/fixtures/$FNE_CASE/seed/." "$FNE_WORKSPACE"
cp "$FNE_REPO/evals/cases/development/$FNE_CASE/task.md" "$FNE_WORKSPACE/PRODUCT_REQUEST.md"
cp "$FNE_REPO/evals/cases/development/$FNE_CASE/organization-context.md" "$FNE_WORKSPACE/ORGANIZATION_CONTEXT.md"
cd "$FNE_WORKSPACE"
```

Start Codex in that directory and provide only:

```text
$front-not-end Implement the product request in PRODUCT_REQUEST.md.
ORGANIZATION_CONTEXT.md is the available organization context for this project.
```

The acceptance command requires a Docker-compatible daemon. Pull its pinned
image explicitly before the first run:

```sh
npm --prefix "$FNE_REPO" run tracer:pull-image
npm --prefix "$FNE_REPO" run doctor
```

The doctor and acceptance runner reject remote or unknown Docker endpoints and
verify the pinned runtime, a client-to-daemon bind marker, and effective PID,
memory, and CPU limits. Acceptance automatically repeats the same preflight in
its own process before snapshot or control execution.

After the Agent finishes:

```sh
npm test
node "$FNE_REPO/evals/harness/run-tracer-acceptance.mjs" --workspace "$PWD" --case "$FNE_CASE"
```

The acceptance runner uses a sanitized read-only snapshot in a disposable,
non-root container with no host or external network route, bounded resources,
host-controlled container-execution timeout and cleanup, and a challenge-bound
completion receipt. The Docker daemon, pinned image contents, host kernel or
Docker Desktop VM, and container runtime remain trusted boundaries. Depending
on the selected case, it verifies stable pages, authorized duplicate-safe
creation, or signed retry-safe order webhooks, plus the appropriate trusted
scope, input bounds, actual platform path, unchanged detail behavior, and no
added dependency. The current fixtures require native ESM workspace code;
CommonJS is outside their acceptance boundary. See the
[Harness boundary](evals/harness/README.md).

## Current boundary

The current product is the Skill plus these three runnable tracers. It does not
yet claim broad stack, Host, or backend-scenario coverage. New abstractions are
added only after repeated real product runs expose the same missing behavior.

One real Codex development comparison is recorded for List/Search: bare Codex
passed its own tests but failed the control contract, while the front-not-end
arm passed both. The mutation/authorization tracer has one passing
front-not-end run without a bare comparison. The webhook tracer has passing
bare and Skill runs with identical service code; both accessed global project
memory, so it supports no causal Skill-advantage claim. These are development
results, not a statistical benchmark or production database/delivery guarantee.

- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Current tracer verification](docs/evaluation.md)
- [Observed tracer result](docs/tracer-result.md)
- [Skill package](docs/executable-skill-packages.md)
- [Continuous integration and releases](docs/automation.md)
- [简体中文](README.zh-CN.md)

## Contributing and direction

front-not-end is a personally maintained experimental project. Suggestions and
contributions are welcome when they are grounded in a concrete, runnable
product scenario. The project does not currently plan to build a generic
evaluator, control plane, Agent Runtime, or speculative abstraction system.
New evidence can reopen these directions; the maintainer decides what enters
the roadmap based on the product boundary and observed results.

## License

Apache License 2.0. See [LICENSE](LICENSE).
