# Repository Guidelines

## Product-first delivery gate

The product Harness is the product. Evaluation exists only to verify product
behavior that already runs. For every proposed change, keep this order:

1. Name the observable capability a frontend user will gain.
2. Implement the smallest runnable vertical slice that provides it.
3. Run that slice with a real Coding Agent and retain reproducible result
   evidence.
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
Every phase report must begin with the new practical capability the user gained
and the evidence for it. If there is no new user capability, stop and reduce
scope before adding files or abstractions.

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

`npm test` runs the built-in `node:test` suite for the active Tracer acceptance runner. There is no compilation step; the project uses native ECMAScript modules (`.mjs`). Install dependencies with `npm ci` when starting from the committed lockfile.

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
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **front-not-end** (425 symbols, 910 relationships, 31 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/front-not-end/context` | Codebase overview, check index freshness |
| `gitnexus://repo/front-not-end/clusters` | All functional areas |
| `gitnexus://repo/front-not-end/processes` | All execution flows |
| `gitnexus://repo/front-not-end/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
