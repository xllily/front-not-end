# Current Product Tracer Verification

The current validation asks whether front-not-end can help a frontend developer
turn product-only List/Search and mutation/authorization requests into safer,
repository-fitting backend changes.

## Scenario facts

The List/Search fixture explicitly states that project access is scoped to the
signed-in user's current workspace and that an existing query/cursor module is
the supported path.

The project-creation fixture additionally states that `project:create` is the
required permission and that an existing mutation helper owns authorization,
validation, scope, and idempotent repository creation.

Those are facts of the scenarios. The tests do not treat multi-tenancy or this
permission model as universal backend requirements.

## Observable behavior

For List/Search, the Agent should:

- keep scope inside request context even if a caller supplies another workspace;
- reuse the existing query and cursor capability;
- preserve stable “load more” behavior and input limits;
- avoid a new dependency or unnecessary infrastructure;
- preserve the existing project-details behavior; and
- run the repository checks before reporting completion.

For project creation, the Agent should:

- let authorized workspace administrators create a normalized project;
- reject other members without a repository side effect;
- ignore caller-supplied workspace or permission values;
- preserve the operation identifier so repository-backed retries create one
  project;
- reuse existing validation and mutation behavior without a new dependency;
- preserve the existing project-details behavior; and
- run the repository checks before reporting completion.

## Executable proof

Each fixture's repository tests verify its existing platform primitive. The
List/Search control-side acceptance verifies:

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

The project-creation control-side acceptance verifies:

- two submissions with the same operation identifier produce one stored
  project result;
- workspace and permission authority come only from request context;
- unauthorized requests produce no repository call or record;
- the runtime call path passes through `platform-create-project.mjs`;
- name and operation-identifier bounds retain existing validation;
- project details retain request-context scoping; and
- no dependency was added.

Before creating that snapshot or running a control test, acceptance uses the
same preflight as `npm run doctor`. It accepts only a resolved local Unix socket
or Windows named-pipe endpoint, binds subsequent Docker commands to that
endpoint, roundtrips a client-generated marker, verifies Node 22.23.2 from the
pinned image, and reads the diagnostic process's cgroup v1 or v2 PID, memory,
and CPU limits. Missing, unlimited, malformed, or oversized limits fail closed.

The acceptance test then runs in a disposable, permission-restricted container
against a bounded read-only snapshot. Harness tests prove that both unchanged
seeds fail, unknown case names are rejected, control environment secrets are
not inherited, and Agent-produced code cannot read a control file outside the
completed workspace. Security regressions also prove that host-loopback
connections receive no request, descendant links fail before execution, a
premature zero exit cannot forge success, a signal-ignoring process is
force-killed without a residual container, and terminal control sequences are
escaped. They also prove that forged stack formatting or `sourceURL` labels
cannot impersonate the allowlisted platform helper, that the completion
challenge is absent from Agent-visible module identities, that ESM relays and
workspace CommonJS cannot extend the control loader chain, that excessive
snapshot entries fail before container execution, and that restrictive host
`umask` values cannot make valid snapshots unreadable by the fixed container
user. Additional cleanup regressions preserve the original timeout, output,
sandbox, or diagnostic failure when later kill, container removal, or snapshot
disposal also fails.

## Current claim boundary

Passing a tracer proves only the behavior above for that fixture and Agent run.
It does not prove that every project needs tenant isolation, that all backend
concerns are covered, or that another Host behaves the same way. Comparative
claims require a real bare-Agent run and a front-not-end run from the same seed
and prompt.

The result also depends on trusted runner/control bytes, pinned image contents,
Docker daemon and daemon-side host, host kernel or Docker Desktop VM, and
container-runtime enforcement. It is not evidence against a malicious daemon,
image, kernel, or container escape.

The current fixtures and runtime-path proof require native ESM workspace code;
CommonJS workspace modules are outside this tracer contract.

The recorded List/Search comparison and project-creation product run are in
[`tracer-result.md`](tracer-result.md).
