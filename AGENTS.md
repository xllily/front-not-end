# Repository Guidelines

## Product-first delivery gate

The product Harness is the product. Evaluation exists only to verify product
behavior that already runs. For changes to user-visible Skill or Harness behavior, use this order:

1. Name the observable capability a frontend user will gain.
2. Implement the smallest runnable vertical slice that provides it.
3. Validate the changed slice. Use a real Coding Agent replay when behavioral
   effectiveness is the claim and the run is authorized; otherwise report the
   behavioral evidence still missing. Do not block local implementation on a
   separately gated paid run.
4. Add only the minimum validation needed to prove that result.
5. Generalize only after at least two proven slices expose the same concrete
   need.

Do not create or expand a generic evaluator, Schema family, Assurance model,
holdout system, control plane, or multi-case suite unless a named failure in an
already runnable product slice requires it and the proposed work is the
smallest way to remove that blocker. Passing evaluation-infrastructure tests is
not evidence that the product Harness helps a user.

When a request contains both product and evaluation work, complete and report
the product slice first. Defer the remaining evaluation work unless the user
explicitly makes it the current deliverable after seeing the product result.
Report the capability and its evidence when behavior changed. Documentation,
packaging, and mechanical maintenance use focused content, package, or diff
checks; they do not need a new tracer or model call.

## Project Structure & Module Organization

- `skills/front-not-end/` contains the installable skill. Keep the main workflow in `SKILL.md` and supporting guidance in `references/`.
- `evals/cases/development/` contains Agent-visible product requests and organization context for each active tracer.
- `evals/fixtures/` contains each tracer's seed repository and control-side acceptance test.
- `evals/harness/` contains the restricted acceptance runner and its colocated `*.test.mjs` coverage.
- `docs/` explains current product behavior, architecture, and executable verification. Update it when a change alters a documented contract.

Do not place private oracles, holdout contents, evaluator outputs, secrets, or generated run artifacts in this repository.

## Build, Test, and Development Commands

Use the repository's nvm-managed Node runtime before running commands:

```sh
nvm use default
npm test
```

`npm test` runs the built-in `node:test` suites for the active Tracer acceptance runner and the local preview service. There is no compilation step; the project uses native ECMAScript modules (`.mjs`). Install dependencies with `npm ci` when starting from the committed lockfile.

## Coding Style & Naming Conventions

Follow the existing JavaScript style: two-space indentation, semicolons, double quotes, trailing commas in multiline structures, and explicit `node:` imports. Use `camelCase` for variables/functions, `PascalCase` only for classes, and kebab-case filenames such as `path-policy.mjs`. Keep modules narrowly scoped and favor deterministic, side-effect-light helpers. JSON and Markdown should remain readable without generated formatting noise.

## Testing Guidelines

Use `node:test` with `node:assert/strict`. Name tests `*.test.mjs` and colocate them with the harness module they exercise. The active runner must remain fail-closed for workspace reads, environment inheritance, timeouts, and acceptance failures. Fixture seed tests live under `seed/test/`; the case-specific acceptance test lives in `acceptance/`. Run `npm test` before submitting changes.

## Commit & Pull Request Guidelines

The current history uses Conventional Commit subjects, for example `feat(evals): establish hardened Slice 1 contract foundation`. Use an imperative `type(scope): summary` subject (`feat`, `fix`, `docs`, `test`, or `chore`) and keep each commit focused.

Pull requests should explain the intent, affected contracts or trust boundaries, and verification performed. Link related issues, call out schema or fixture compatibility changes, and include screenshots only for rendered documentation or other visual changes. Never claim evaluation success without reproducible command output or captured evidence.

## Project context

Read [`CONTEXT.md`](CONTEXT.md) before deciding where documentation or working
material belongs. Every tracked file must be a finished product result. Do not
commit working material or describe where private working material is stored.

<!-- gitnexus:start -->
## Code intelligence

Use available graph tools for shared interfaces, cross-module changes, and
refactors where caller impact matters. For localized edits, inspect the affected
source and run relevant checks. Graph coverage is a navigation aid, not proof
that a caller will break or that a change is correct.

Use the host's actual tool names. Refresh only the index needed for the task;
if it is unavailable, continue with source, references, and focused tests.
When preparing a commit with meaningful symbol changes, use available change
detection for that exact diff scope. Report material risks, not routine graphs.
<!-- gitnexus:end -->
