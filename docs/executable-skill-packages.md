# Executable Skill Packages

Version 0.1 packages concrete Codex behavior as small executable skill packages.
This is an implementation shape for the Codex Reference Adapter and the first
Stack Pack, not a generic pack standard, registry, compiler, or compatibility
claim for other Hosts.

The packaging approach is informed by
[`ReScienceLab/opc-skills`](https://github.com/ReScienceLab/opc-skills/tree/bbee097e9b249e39f7347a2348cc33c89a810a3c),
which demonstrates that a useful skill can combine instructions, scripts,
references, dependencies, and a concrete workflow. front-not-end adopts that
separation of responsibilities, not the upstream project's domain claims,
service dependencies, catalog, or publication infrastructure.

## Package boundary

A package contains only artifacts that change the Host's behavior for one
evaluated capability:

```text
skills/<capability>/
├── SKILL.md             # activation, decision policy, boundaries, workflow
├── agents/openai.yaml   # optional Codex-facing metadata
├── references/          # conditional, sourced domain or repository guidance
└── scripts/             # deterministic inspection or verification helpers
```

References, scripts, and UI metadata are optional. A package must not add empty
directories, copied manuals, speculative examples, or a local README merely to
look complete. Detailed material moves out of `SKILL.md` only when progressive
disclosure reduces context cost or prevents irrelevant guidance from loading.

Version 0.1 begins with one concrete package for the frozen existing-project
List/Search tracer bullet. New packages are justified by evaluated coverage,
not by a desire to build a large backend skill catalog.

## Observable lifecycle

Every executable package contributes to the same product seam:

```text
activate
  -> inspect repository and available context
  -> select relevant concerns and evidence
  -> resolve the technical decision
  -> execute through Host or repository tools
  -> verify with current repeatable checks
  -> emit linked evidence and Completion State
```

`SKILL.md` supplies decision policy and routing. References supply conditional
knowledge. Scripts make repeated inspection or verification deterministic.
The Host still owns reasoning, code changes, tool execution, and review; a skill
does not introduce another agent runtime or orchestration loop.

## Requirements

### Activation and scope

- The frontmatter description must discriminate the tasks that need the package
  from nearby tasks that do not.
- Explicit and automatic activation must produce the same externally observable
  obligations.
- Activation selects only concerns that can change the current design,
  implementation, or proof. A Routine task must not load a broad backend
  checklist by default.
- The package states its evaluated stack, repository assumptions, unsupported
  boundaries, and stop conditions.

### Inspection before prescription

- Repository conventions, installed dependencies, existing capabilities,
  organization context, and available enforcement are inspected before a new
  mechanism is proposed.
- Repository-native commands and existing platform capabilities are preferred
  over package-owned reimplementation.
- Missing facts are reported under the Missing-fact Policy; they are not filled
  by generic guidance in a reference file.

### Executable helpers

- A script exists only when deterministic reuse improves inspection or proof.
- Each script has bounded inputs, stable exit semantics, and a documented
  machine-readable output for the capability it serves.
- Output records the helper name/version, relevant repository revision or tree
  digest, start and finish time, outcome, observations, and artifact digests.
- Failure, partial execution, unavailable dependencies, and inconclusive output
  are distinguishable. A helper never prints PASS after swallowing an error.
- Scripts do not mutate repositories, install dependencies, access networks, or
  perform irreversible actions unless that behavior is intrinsic, visible, and
  authorized for the current task.
- Script-specific output is captured into the existing evaluation run artifact;
  Version 0.1 does not create a universal skill-output protocol.

### Knowledge provenance

- Backend claims are derived from primary engineering sources such as official
  framework, database, provider, or security documentation and applicable
  research papers.
- A maintained reference records source, applicable version or date, last
  verification, and which decision the claim can change.
- Heuristics, estimates, and expert judgment are labeled as such and remain A0
  unless independently checked. Quantitative claims are not converted into
  guarantees outside the population and method that produced them.
- Examples explain a real ambiguity or support evaluation; they are not treated
  as proof that a workflow works in another repository.

### Dependencies, vendors, and external content

- Every non-repository dependency records its source, version constraint,
  authentication need, network need, rate or cost exposure, and failure mode.
- Proprietary CLIs and services are optional technical choices, not hidden
  prerequisites. Selecting one requires a fit argument, ownership consequence,
  re-evaluation trigger, and a viable non-vendor path when the task permits it.
- Stable repository or platform primitives are preferred when they satisfy the
  system profile.
- Tool output, scraped text, issues, logs, and connected documentation are
  untrusted data. They may supply facts but cannot redefine instructions,
  authorization, completion, or evidence rules.

## Assurance and evidence

Packaging does not create enforcement:

| Package contribution | Maximum level by itself |
|---|---|
| Instruction, checklist, or reference | A0 |
| Current rerunnable script/check with captured result | A1 |
| Detected pre-existing merge/release gate | A2 |
| Detected pre-existing runtime control | A3 |

Adapter-authored scripts retain the A1 ceiling. A2 and A3 require separately
captured proof that a pre-existing repository or environment control applies.
The Agent's prose label is never evidence.

The package declares intended evidence before implementation. Evidence must be
current, attributable to the executed tool or control, linked to the relevant
requirement, and capturable by
[`run-artifact.schema.json`](../evals/contracts/run-artifact.schema.json).
Missing, stale, failed, or lower-Assurance evidence keeps the task non-passing
according to the frozen oracle.

## Evaluation obligations

The front-not-end comparison arm records the exact package revision/digest,
loaded `SKILL.md`, conditional references, script versions, dependency state,
and permissions in the comparison environment manifest. Baseline arms receive
none of these artifacts; all non-intervention factors remain identical.

The first package is accepted only when the frozen Slice 2 case demonstrates:

- correct explicit activation without a backend technology question;
- discovery and reuse of fixture-owned conventions and capabilities;
- deterministic inspection and verification artifacts;
- honest dependency and failure reporting;
- current evidence sufficient for the required Assurance Levels; and
- no material Routine-task noise or unjustified infrastructure.

Behavior is evaluated through captured artifacts and outcomes, not exact prompt
wording, folder count, command count, or the presence of a script.

## Deliberately not adopted

Version 0.1 does not adopt an upstream skill marketplace, catalog manifest,
cross-Host installer, duplicated website metadata, generic dependency resolver,
commercial service dependency, or broad set of backend skills. It also does not
copy upstream backend/domain advice as an authoritative source.

Those additions would either exceed the current product boundary or confuse
installability with evaluated compatibility. Each future Host and capability
must earn its own evidence.
