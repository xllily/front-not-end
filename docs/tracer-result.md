# Product Tracer Results

## List/Search comparison

On 2026-08-21, the active tracer was run once with bare Codex and once with
front-not-end installed. Both runs started from the same seed, product request,
organization context, and prompt:

```text
Implement the product request in PRODUCT_REQUEST.md. ORGANIZATION_CONTEXT.md is the available organization context for this project.
```

The intervention arm installed the local package with Skills CLI 1.5.23. Codex
automatically selected and read `front-not-end`; the bare arm did not have that
project Skill. Both runs used `codex-cli 0.149.0` and Node.js 22.20.0.

| Result | Bare Codex | front-not-end |
| --- | ---: | ---: |
| Agent-authored repository tests | 5/5 passed | 6/6 passed |
| Restricted control acceptance | 3/4 passed | 4/4 passed |
| Actual platform query path used | Yes | Yes |
| Existing platform page shape preserved | No | Yes |

The bare result introduced a Service-owned `{ projects, nextCursor }` response,
so it failed the existing platform contract expected by the control test. The
front-not-end result kept opaque cursor ownership in the platform module and
returned `{ items, nextCursor }`, passing two-page continuity, request-context
scope, input validation, dependency, and project-detail regression checks.

This is development evidence from one run per arm. The Codex CLI capture did
not expose its exact model identifier, so this result does not support a formal
or statistical benchmark claim. It does demonstrate one observable improvement
on the current product slice.

The command requires the pinned Docker image documented in
[`evals/harness/README.md`](../evals/harness/README.md) to be present locally.
Then reproduce the acceptance decision after each Agent run with:

```sh
npm test
node "$FNE_REPO/evals/harness/run-tracer-acceptance.mjs" --workspace "$PWD"
```

### 2026-09-04 replay finding

Two separately authorized front-not-end replays used the same pre-correction
seed, product request, organization context, prompt, `gpt-5.6-sol`, and
`codex-cli 0.150.1`. Both Agents read the Skill, completed normally, and
produced byte-identical service delegation. Their repository tests passed, but
restricted acceptance passed only 3/4 because consecutive pagination repeated
the first page.

Those runs exposed a fixture contract gap rather than a demonstrated Skill
regression: the Agent-visible helper returned the repository's internal
`{ items, next }` shape, while the control-side consumer required the documented
public `{ items, nextCursor }` shape. The seed test did not expose that output
contract. The current fixture corrects the existing helper and its repository
test so the platform module visibly owns the public opaque cursor boundary.
The unchanged control acceptance passes 4/4 for a synthetic workspace that adds
only the missing service delegation.

The two failed replays are not counted as passing product evidence or as
comparative evidence.

### 2026-09-05 corrected-fixture replay

One explicitly activated front-not-end run against commit `029b1b7` used
`gpt-5.6-sol`, `codex-cli 0.150.1`, and Host Node.js 22.20.0. It added
`ProjectService.listProjects` delegation to the existing `queryPage` helper and
focused service tests. The completed workspace was accepted without manual
code corrections.

| Result | front-not-end |
| --- | ---: |
| Independently rerun repository tests | 4/4 passed |
| Restricted control acceptance | 4/4 passed |
| Residual tracer and preflight containers | 0 |

Restricted acceptance ran on Docker Desktop arm64 with the pinned sandbox
Node.js 22.23.2. It verified request-context scope, consecutive opaque-cursor
pages, input validation, unchanged dependencies, and project-detail behavior.
The raw Agent stream recorded `turn.completed` and a final response; the original
CLI process exit code was unavailable after task handoff. The independent test
and acceptance commands both exited zero with no skipped tests.

This verifies the corrected List/Search fixture result from one Skill run. It
is not a new bare-Agent comparison. The current Project Creation result is
recorded below.

## Mutation/authorization run

On 2026-08-22, `project-create-authorization` was run once with the local
front-not-end Skill explicitly activated. The run used `codex-cli 0.149.0`,
`gpt-5.6-sol`, and Node.js 22.20.0. The workspace contained the seed, the local
Skill installation, product request, and organization context; the task prompt
was:

```text
$front-not-end Implement the product request in PRODUCT_REQUEST.md. ORGANIZATION_CONTEXT.md is the available organization context for this project.
```

The Agent found that the existing platform helper already owned permission
checking, workspace scope, normalization, and repository-backed idempotency. It
added only the missing `ProjectService.createProject` delegation plus focused
repository tests.

| Result | front-not-end |
| --- | ---: |
| Agent workspace repository tests | 5/5 passed |
| Restricted control acceptance | 7/7 passed |
| Existing platform mutation path used | Yes |
| Unauthorized repository side effect | None observed |
| Duplicate stored project on retry | None observed |

The control acceptance also passed distinct operation identifiers, multiple
request-context workspaces, caller-spoofing, input-bound, dependency, and
project-detail compatibility checks. This is one passing product run, not a
bare-Agent comparison or statistical benchmark.

Reproduce this acceptance decision with:

```sh
npm test
node "$FNE_REPO/evals/harness/run-tracer-acceptance.mjs" \
  --workspace "$PWD" \
  --case project-create-authorization
```

### 2026-09-05 service-contract replay finding

One front-not-end replay used `gpt-5.6-sol`, `codex-cli 0.150.1`, and Host Node.js
22.20.0. The Agent completed with process exit code zero and its repository
tests independently passed 5/5. Restricted acceptance under sandbox Node.js
22.23.2 passed 3/7, with no skipped tests or residual containers.

The Agent added `createProject(name, operationId)` and delegated those values
to the supported platform helper. The control consumer called
`createProject({ name, operationId })`, causing project-name validation to fail.
The Agent-visible context identified the helper's responsibilities but did not
state the new service method's argument shape. The current organization context
now specifies the page's object-argument call and retry-identifier ownership.

This failed replay is not passing product evidence. The change clarifies the
visible service contract; it does not change the seed implementation, core Skill,
or restricted controls. A synthetic workspace adding only object-argument service
delegation passes the unchanged acceptance 7/7. That checks contract consistency;
the following real-Agent replay supplies the corrected fixture's product result.

### 2026-09-05 corrected-context replay

One explicitly activated front-not-end run against commit `8336d2f` used
`gpt-5.6-sol`, `codex-cli 0.150.1`, and Host Node.js 22.20.0. The Agent added
`ProjectService.createProject(input)` delegation to the supported platform helper
and focused repository tests. Its raw stream recorded `turn.completed`, and the
original CLI process exited zero. The product workspace was accepted without
manual code corrections.

| Result | front-not-end |
| --- | ---: |
| Independently rerun repository tests | 4/4 passed |
| Restricted control acceptance | 7/7 passed |
| Residual tracer and preflight containers | 0 |

Restricted acceptance ran on Docker Desktop arm64 with sandbox Node.js 22.23.2.
It verified duplicate and distinct operation identifiers, trusted workspace
selection, unauthorized zero-side-effect behavior, input bounds, unchanged
dependencies, and project-detail compatibility. Both verification commands exited
zero with no skipped tests.

Together with the corrected List/Search result, this provides passing real-Agent
product evidence for both existing fixtures under the patched sandbox. The
List/Search CLI exit-status limitation remains as recorded above. The complete
Harness also passed 59/59 with zero skips on local Host Node.js 22.20.0 and
24.17.0. These are fixture-level results, not statistical comparisons or a
production deployment claim.

## Webhook retry and idempotency

On 2026-09-05, one separately authorized bare Codex call and one front-not-end
call started from the frozen `webhook-retry-idempotency` seed at commit
`39e6788`. Both used `codex-cli 0.150.1`, requested `gpt-5.6-sol` with high
reasoning effort, and received the same product request, organization context,
and prompt:

```text
Implement the product request in PRODUCT_REQUEST.md.
ORGANIZATION_CONTEXT.md is the available organization context for this project.
```

Both produced byte-identical `OrderService.handleWebhook(input)` implementations
that pass the original input to `applyOrderWebhook`. Each added two focused
service tests. The constructor, existing order-details method, platform helper,
in-memory repository and dependencies remained unchanged. Neither completed
workspace was manually repaired.

| Result | Bare Codex | front-not-end |
| --- | ---: | ---: |
| Original CLI process exit | 0 | 0 |
| Raw `turn.completed` retained | Yes | Yes |
| Independently rerun native tests | 12/12 passed | 12/12 passed |
| Restricted control acceptance | 9/9 passed | 9/9 passed |
| Supplied Skill read in command trace | No | Yes |
| Global project memory read | Yes | Yes |

The Skill catalog was rendered before each call: bare had no visible Skill
entry, and the Skill arm had only its project-local front-not-end. Both calls
disabled the same global Skill entries. Global files were still readable on
the host, and both Agents read project memory; the Skill arm also read a prior
project rollout summary. These are two passing development runs with equal
service results, not a history-isolated experiment or evidence of a causal
Skill advantage. No core Skill correction was justified by these results.

The request and seed were frozen before either call. The control acceptance
was added only after both calls completed, using the visible service contract.
It ran against the preserved workspaces on Docker Desktop arm64, sandbox Node
22.23.2, with Host Node 22.20.0. Both commands exited zero with no skipped tests.
The controls verify:

- verification of the original signed bytes before repository mutation;
- trusted provider account and tenant selection, including forged scope;
- concurrent and later retries without a second transition or outbox item;
- distinct event/account identities and conflicting event-ID reuse;
- no partial event, order, or outbox state after a pre-commit failure;
- safe retry after that failure, original result shape, and propagated errors;
- actual mutation through the supported platform helper;
- unchanged supplied platform files, dependencies and existing order reads.

The synchronous in-memory repository models one atomic fixture commit. These
results do not prove durability, multiple database writers, or exactly-once
delivery by an external notification worker. Reproduce the restricted decision
after a fresh Agent implementation with:

```sh
npm test
node "$FNE_REPO/evals/harness/run-tracer-acceptance.mjs" \
  --workspace "$PWD" \
  --case webhook-retry-idempotency
```
