# Assurance and Completion

front-not-end separates a recommendation from a repeatable check, a merge gate, and runtime enforcement. The distinction is part of the user-visible contract.

## Assurance Levels

| Level | Name | Meaning | Example |
|---|---|---|---|
| A0 | Advisory | Model guidance with no independently repeatable check | A reminder to consider cache stampede behavior |
| A1 | Checkable | A test, command, query, or artifact can be rerun and inspected | Integration test or captured query plan |
| A2 | Gated | An existing hook, CI job, or command can prevent merge or release | Required CI check |
| A3 | Runtime-enforced | A database, IAM, sandbox, or platform control enforces the property | Database constraint or IAM deny policy |

Controls authored by the Version 0.1 Codex Adapter have an A1 ceiling. The adapter may detect and report pre-existing A2 or A3 controls supplied by a repository or execution environment, but it must not claim to create or enforce them.

If a task requires an unavailable Assurance Level, the adapter reports the lower actual level and keeps the result non-passing.

Skill packaging does not raise Assurance by itself. `SKILL.md`, reference
material, and checklists are A0. A current rerunnable helper may produce A1
evidence when its inputs, outcome, repository state, and artifact digest are
captured. The presence of a script or configured command without execution is
still not evidence. Adapter-owned helpers cannot create A2 or A3 enforcement.

For evaluation, the minimum level is frozen per oracle requirement before
Adapter output is observed. Each requirement also declares whether it blocks
completion, accepted evidence categories, and the deterministic `IN_PROGRESS`,
`FAIL`, or `BLOCKED` result used when actual assurance is below the minimum.
The evaluator derives actual assurance from evidence and enforcement
provenance; it does not trust the host's label. A2 and A3 require evidence that
a pre-existing repository or environment gate/control applies to the current
task.

## Evidence requirements

Evidence must be:

- required by an activated concern rather than selected after implementation;
- produced or observed for the current task and repository state;
- linked to the relevant claim;
- checked for success, failure, freshness, and relevance; and
- attributable to an executed tool, command, or external control where applicable.

The following are not evidence:

- an instruction telling the model to run a check;
- configuration showing that a check exists;
- an unrelated or stale result;
- pasted prose saying that a test passed;
- fabricated logs or artifacts; or
- the model's own assertion that work is complete.

## Completion States

| State | Meaning |
|---|---|
| IN_PROGRESS | Required implementation or evidence work remains and can still proceed. |
| PASS | Every requirement activated for the task has current, checked evidence. |
| FAIL | Executed evidence failed or the implementation violates an activated requirement. |
| BLOCKED | Progress requires an unavailable fact, permission, access, environment, or dependency for which no safe default exists. |

Version 0.1 has no WAIVED Completion State. A user may acknowledge a business risk or authorize an irreversible real-world action, but that acknowledgement is not technical evidence and cannot turn incomplete work into PASS. If required proof is intentionally skipped, the result remains non-passing and records why.

When several blocking requirements are non-passing, the deterministic
precedence is `FAIL > BLOCKED > IN_PROGRESS > PASS`. Benchmark contamination or
environment drift is handled separately as an invalid run; it does not become a
task-level PASS or FAIL and cannot contribute to a positive comparison verdict.

## Task status versus benchmark verdict

The active AI Coding Host may report a task-level Completion State when it links the underlying evidence. The Substitution Spike verdict is different: an independent deterministic evaluator derives it from the frozen oracle and captured artifacts and does not trust the task's self-reported state. In Version 0.1, the host is Codex.
