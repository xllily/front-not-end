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

The two failed replays are not counted as product evidence or as comparative
evidence. A current real-Agent result against the corrected fixture remains
required before claiming that Stage 1 has replayed this tracer successfully.

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
