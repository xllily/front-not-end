# Current Tracer Verification

The current validation answers one question: can front-not-end help a frontend
developer turn a product-only List/Search request into a safer,
repository-fitting backend change?

## Scenario facts

The fixture explicitly states that project access is scoped to the signed-in
user's current workspace and that an existing query/cursor module is the
supported path. Those are facts of this scenario. The test does not treat
multi-tenancy as a universal backend requirement.

## Observable behavior

The Agent receives the product request, repository, and organization context.
It should:

- keep scope inside request context even if a caller supplies another workspace;
- reuse the existing query and cursor capability;
- preserve stable “load more” behavior and input limits;
- avoid a new dependency or unnecessary infrastructure;
- preserve the existing project-details behavior; and
- run the repository checks before reporting completion.

## Executable proof

The fixture's repository tests verify the existing query primitive. The
control-side acceptance verifies:

- two consecutive pages contain the exact expected items without skips or
  duplicates;
- both repository calls use request-context scope;
- the second cursor reaches the repository as the decoded stable key;
- the existing platform module, rather than the service or repository, owns the
  opaque `nextCursor` boundary;
- the runtime call path passes through `platform-query-page.mjs`;
- invalid cursor and page-size inputs retain existing validation;
- project details retain request-context scoping; and
- no dependency was added.

The acceptance test runs in a separate, permission-restricted Node process.
Harness tests also prove that the unchanged seed fails, control environment
secrets are not inherited, and Agent-produced code cannot read a control file
outside the completed workspace.

## Current claim boundary

Passing this tracer proves only the behavior above for this fixture and Agent
run. It does not prove that every project needs tenant isolation, that all
backend concerns are covered, or that another Host behaves the same way.
Comparative claims require a real bare-Agent run and a front-not-end run from
the same seed and prompt.

The first such development run is recorded in
[`tracer-result.md`](tracer-result.md).
