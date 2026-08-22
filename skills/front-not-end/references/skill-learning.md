# Skill reuse and task learning

Reuse mature capabilities before creating new ones. Learn from real task
evidence, then classify each reusable result directly as project-level or
global. A global Skill is not a project Skill promoted later.

## Reuse before creation

1. Inspect the project's and Host's available Skills before implementing a
   missing specialized capability. Prefer an exact, maintained fit over a new
   local interpretation.
2. If no local Skill fits and network use is allowed, search the ecosystem with
   `npx skills find`. Inspect the source, maintenance, Host assumptions,
   dependencies, and actual workflow; install count alone is not evidence of
   fit.
3. For one task, prefer temporary use with `npx skills use` without `--agent`,
   then apply its generated prompt in the current Host; do not start a nested
   coding Agent. When persistence is justified, use `npx skills add` instead of
   manually copying files. A project install may proceed as a reversible
   repository change when project policy allows it; a global install requires
   user approval.
4. Do not adopt an approximate Skill that introduces a new Agent Runtime,
   service, credential, or control plane merely to avoid implementing a small
   repository-fit solution.

**Done when:** the selected Skill materially changes the current design,
implementation, or proof, or you have established that reuse is not a fit.

## Learn after proof

Run this branch only after the requested task is implemented and its final
checks have run. The task trace is evidence; a generic best practice, an
unverified guess, one ordinary success, or the absence of user correction is
not.

Useful signals are:

- a user correction changed the technical method;
- an error or dead end revealed a non-obvious successful path;
- a judgment-heavy workflow repeated or has an identified second use;
- a missing guard, test, or inspection caused avoidable risk;
- a platform behavior required verified handling not covered by existing
  project or installed guidance.

For each signal, extract the smallest reusable rule: its trigger, action,
boundary, source evidence, and proof. Search existing project and global Skills
before creating anything. Patch an existing Skill when the evidence exposes a
real gap; do not duplicate it under a new name.

## Classify once

Classify each extracted rule independently. One task may produce a global
workflow and separate project facts, but do not duplicate the same rule in two
scopes.

| Result | Use when | Persist as |
| --- | --- | --- |
| Do not persist | One-off, obvious, speculative, or already covered | Nothing |
| Project context | Repository facts such as schema names, providers, commands, or team policy | The existing project instruction or documentation surface |
| Deterministic control | A machine-checkable invariant or repeatable operation | Test, script, lint rule, or check |
| Project Skill | A reusable judgment workflow depends on this repository, domain, stack, or organization | The project's existing Skill location |
| Global Skill | A reusable judgment workflow has no repository-specific assumptions and has transfer evidence | The Host's global Skill location |

Repeated success in independent projects is strong transfer evidence, not a
required project-to-global sequence. Official sources, removal of
repository-specific assumptions, the completed task, and an isolated replay
can together justify a global candidate.

Task learning may create or patch downstream Skills, project context, tests,
scripts, and checks. It must not modify `front-not-end/SKILL.md`, this reference,
or the rules that decide future learning. Changing the Harness itself is a
separate product task and requires the same defect in at least two real Tracer
Bullets plus stable regression scenarios that can reject a bad change.

## Create or update

Use `skill-creator` when it is available; otherwise produce a compatible Agent
Skill package. Use other installed Skill-authoring guidance only when it adds a
real check. Keep the package aligned with the project's Skill conventions and
with this shape:

```text
SKILL.md      trigger, decisions, and procedural steps
references/   domain knowledge loaded only when needed
scripts/      deterministic inspection, execution, or verification
assets/       files copied into outputs, only when required
```

The Skill must drive `knowledge → decision → inspection → execution →
verification`. It must not be a narrative of the completed task. Include only
the scripts or references that change behavior, and keep repository facts out
of a global Skill.

Generate and test the candidate in an isolated temporary workspace. Use the
observed failure as RED, then replay the original situation and at least one
meaningful variation with the candidate. Run deterministic checks for any
script. A candidate that cannot demonstrate the intended behavior stays out of
active Skill directories.

After validation, create or patch a project Skill as a visible, reversible
working-tree change unless repository instructions forbid it. Decide that a
Skill belongs globally before asking; then show its evidence and diff and
request approval for the global write. Also request approval before overwriting
an existing global Skill or executing a candidate's external side effects.
Never persist secrets, raw private data, or unnecessary transcript content as
learning evidence.

## Delivery

Do not add a learning checklist to routine task reports. When learning changed
the project, report the Skill, context, or deterministic control created and
the proof it passed. When a global write awaits approval, ask only for that
authorization and explain the cross-project effect.
