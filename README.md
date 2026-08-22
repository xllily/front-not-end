# front-not-end

front-not-end lets a frontend developer describe the product while an existing
Coding Agent takes responsibility for the backend technical work.

It is an installable Agent Skill, not a replacement Agent or a new runtime. The
Skill makes the Agent inspect the repository and available operating context,
activate only the backend concerns that matter to the current task, choose safe
technical defaults, implement the complete path, and verify the delivered
state.

The user owns product intent, facts the Agent cannot infer, real constraints,
and authorization for irreversible or external actions. The Agent owns
technical completeness.

## Install

After the repository is published:

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

## Runnable tracer

The repository ships one existing-project List/Search scenario. It checks
whether the Skill leads the Agent from a product request to a repository-fit
implementation that reuses an existing scoped pagination capability.

Prepare a fresh workspace:

```sh
export FNE_REPO=/path/to/front-not-end
export FNE_WORKSPACE="$(mktemp -d)"
cp -R "$FNE_REPO/evals/fixtures/existing-list-search-reuse/seed/." "$FNE_WORKSPACE"
cp "$FNE_REPO/evals/cases/development/existing-list-search-reuse/task.md" "$FNE_WORKSPACE/PRODUCT_REQUEST.md"
cp "$FNE_REPO/evals/cases/development/existing-list-search-reuse/organization-context.md" "$FNE_WORKSPACE/ORGANIZATION_CONTEXT.md"
cd "$FNE_WORKSPACE"
```

Start Codex in that directory and provide only:

```text
$front-not-end Implement the product request in PRODUCT_REQUEST.md.
ORGANIZATION_CONTEXT.md is the available organization context for this project.
```

After the Agent finishes:

```sh
npm test
node "$FNE_REPO/evals/harness/run-tracer-acceptance.mjs" --workspace "$PWD"
```

The acceptance runner starts a separate Node process with a scrubbed
environment, read access limited to the completed workspace and acceptance
test, no filesystem write permission, and a timeout. It verifies two
consecutive pages, request-context scope, input bounds, actual use of the
existing query path, unchanged project details, and no added dependency.

## Current boundary

The current product is the Skill plus this one runnable tracer. It does not yet
claim broad stack, Host, or backend-scenario coverage. New abstractions and
additional cases are added only after repeated real product runs expose the
same missing behavior.

One real Codex development comparison is recorded: bare Codex passed its own
tests but failed the control contract, while the front-not-end arm passed both.
This is one-run product evidence, not a statistical benchmark.

- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Current tracer verification](docs/evaluation.md)
- [Observed tracer result](docs/tracer-result.md)
- [Skill package](docs/executable-skill-packages.md)
- [Continuous integration and releases](docs/automation.md)
- [简体中文](README.zh-CN.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
