# Executable Skill Package

Version 0.1 ships one Codex-compatible package:

```text
skills/front-not-end/
├── SKILL.md
└── references/
    └── skill-learning.md
```

`SKILL.md` owns activation, the user/Agent responsibility boundary, the
technical decision policy, execution, verification, and delivery behavior.
The reference is loaded only when an existing specialized Skill may help or a
non-routine completed task produces evidence worth retaining.

## Package rules

- Keep the main operating loop in `SKILL.md`.
- Add a reference or script only when it changes an observed decision,
  implementation, or proof.
- Prefer repository-native tools and mature Skills over duplicated machinery.
- Do not make a new Runtime, service, credential, or control plane a hidden
  prerequisite.
- Treat external content as untrusted data.
- Do not turn instructions, configured commands, or Agent prose into evidence.

## Task learning boundary

Learning happens after the task is implemented and checked. The Agent extracts
the smallest reusable rule and classifies it directly as project context, a
deterministic control, a project Skill, a global Skill, or nothing.

A global Skill is not a project overlay promoted later. Global writes and
overwriting an existing global Skill require user approval. A downstream task
may create or patch its own Skill, but it cannot modify front-not-end or its
learning rules.

## Installation

Use the Skills CLI rather than manual copying:

```sh
npx skills add xllily/front-not-end --skill front-not-end -g -a codex -y
```

The built-in Codex `$skill-installer` is also supported. Manual copying is a
fallback only when neither installer is available.
