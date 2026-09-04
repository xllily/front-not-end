# Tracer Acceptance Runner

[`run-tracer-acceptance.mjs`](run-tracer-acceptance.mjs) executes an allowlisted
case acceptance test against a completed workspace:

The runner requires a working local Docker-compatible daemon exposed through
an absolute `unix://` endpoint or the local Windows `npipe://` form. Remote
`ssh://`, `tcp://`, and HTTP(S) endpoints, missing endpoints, and unknown forms
fail closed. Pull the pinned multi-architecture runtime image once, then run the
same preflight used automatically by acceptance:

```sh
npm run tracer:pull-image
npm run doctor
```

`npm run doctor` exits nonzero with a specific remediation when it cannot prove
the local endpoint, pinned runtime, bind mount, or resource limits. Successful
preflights are cached only within the current Node process and only for the
resolved endpoint plus pinned image; failures are never cached.

```sh
node evals/harness/run-tracer-acceptance.mjs \
  --workspace /path/to/workspace \
  --case project-create-authorization
```

Omitting `--case` preserves the original `existing-list-search-reuse` default.
Unknown case names fail before Agent-produced code is started.

Before snapshot or control execution, acceptance resolves and pins the effective
Docker endpoint. A uniquely named diagnostic container receives the production
PID, memory, and CPU limits, reads its process cgroup through
`/proc/self/cgroup` and `/proc/self/mountinfo`, and must report Node 22.23.2. A
cryptographic nonce in a random client temporary directory must also survive a
read-only bind-mount roundtrip. Missing or mismatched images, markers, cgroup
files, or effective limits fail before any control test can complete.

The runner snapshots only regular, single-link files under `package.json` and
`src/`; links, special files, nested filesystems, oversized inputs, and files
that change during the snapshot fail closed. It then starts a disposable,
non-root container with:

- a pinned Node image and no automatic image pull;
- no host or external network route;
- read-only snapshot and control mounts, with no host socket or repository
  mount;
- a scrubbed host environment plus Node filesystem/process permissions;
- dropped capabilities, `no-new-privileges`, and CPU, memory, PID, output, and
  container-execution wall-time limits; and
- host-controlled `SIGKILL` plus exact-container removal on timeout or failure.

Both diagnostic and acceptance containers have unique names and Harness labels.
Cleanup uses the exact verified endpoint and container ID (or the unique name if
creation did not return an ID). A cleanup failure is retained without replacing
the original execution failure.

The allowlisted control test receives a random challenge before Agent-produced
code is imported. The host accepts success only when every expected control
test completes and returns the matching receipt. Child output and reflected
arguments are escaped before they reach a terminal.

For runtime reuse checks, a control-owned module hook wraps the allowlisted
platform export with a per-run private marker bound to the exact repository
object. Repository calls outside that wrapper fail even if Agent code alters
stack formatting or module source labels. Frozen intrinsics and disabled
string code generation further prevent Agent code from replacing control-side
language primitives. Agent workspace code is limited to native ESM; CommonJS
is rejected before execution because its ambient loader API would cross this
control boundary.

## Trust assumptions

This boundary limits Agent-produced code; it is not a defense against a
compromised trusted computing base. A result assumes all of the following are
trusted:

- the checked-out runner and control-test bytes;
- the configured Docker client, accepted local daemon, and daemon-side
  host—Docker daemon access is host-equivalent, so the preflight proves routing
  and enforcement properties but not daemon integrity;
- the contents of the pinned image—the digest prevents tag drift but does not
  make vulnerable or malicious contents safe; and
- the host kernel or Docker Desktop VM/hypervisor, container runtime,
  namespaces, cgroups, default seccomp policy, and mount enforcement.

The Harness does not protect against a malicious daemon, image, kernel, or
container-runtime escape.

The selected test observes actual product behavior and the runtime call path
through the relevant existing platform helper. It does not accept response
wording, a comment, or an unused import as proof.
