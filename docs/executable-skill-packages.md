# Executable Skill Package

The 0.2 contract retains one Codex-compatible package. Its Skill files are
unchanged from 0.1; the third tracer extends recorded product evidence:

```text
skills/front-not-end/
├── SKILL.md
└── references/
    └── skill-learning.md
```

`SKILL.md` owns activation, the user/Agent responsibility boundary, the
technical decision policy, execution, verification, and delivery behavior.
The reference is loaded when a specialized capability could materially change
the task, whether or not the Agent already knows a matching Skill, or when a
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

To install a specific published version from its verified Release archive,
first follow the [checksum and provenance verification](automation.md#verify-a-downloaded-release).
Then use the tested Skills CLI 1.5.23 to install into a fresh project:

```sh
mkdir verified-skill
tar -xzf front-not-end-v0.2.0.tar.gz -C verified-skill
export FNE_VERIFIED_SKILL="$(pwd)/verified-skill/front-not-end"
mkdir fresh-project
cd fresh-project
npx --yes skills@1.5.23 add "$FNE_VERIFIED_SKILL" --skill front-not-end -a codex -y
npx --yes skills@1.5.23 list -a codex
```

Start a new Codex task in that project after installation. Use a checkout of
the same version tag for the three fixtures and their runner; the standalone
archive contains only the Skill. These commands apply after that version is
published and do not themselves run an Agent or publish a release.

## Release artifact

Every accepted SemVer tag produces a GitHub Release containing the standalone
`front-not-end` Skill directory as a compressed archive and a SHA-256 checksum.
The release workflow packages only committed files from the tagged Skill tree,
checks the package boundary and required metadata, and publishes only after the
repository test suite, exact-commit CI and CodeQL gates, and checksum/provenance
verification pass. The archive remains limited to the Skill; attestations are
stored by GitHub and can be verified with `gh attestation verify`. See [Continuous Integration and
Releases](automation.md) for the release contract.
