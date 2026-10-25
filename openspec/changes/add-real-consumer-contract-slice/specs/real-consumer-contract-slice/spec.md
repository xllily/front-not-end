## ADDED Requirements

### Requirement: Runnable consumer-facing product slice

The project SHALL provide one opt-in Node ESM product case in which a user can generate a local preview card from either text or an existing allowlisted local asset. The Agent-visible request SHALL state the product result and existing contracts; acceptance-only assertions SHALL remain control-owned. The case SHALL make existing-capability inspection, a necessary compatibility correction, and acceptance one delivery path.

#### Scenario: Existing business capability with a consumer discovery gap
- **WHEN** the Agent inspects the provided MCP service for the preview request
- **THEN** the service exposes working text and asset business paths, and the case can be completed by correcting the consumer-facing contract without replacing the business handler or creating another capability-discovery project

### Requirement: Pinned real consumer dependency

Consumer acceptance MUST execute the actual Claude Code SDK CLI binary for the fixed target version, not a reimplementation of its parser or discovery behavior. The initial target SHALL be historical version 2.1.293. Before execution the control entry SHALL verify and record its version, binary SHA256/source, fixed runtime, case/source hashes and minimal configuration. A version change SHALL be reported as a different reproduction condition.

#### Scenario: Verified binary is available
- **WHEN** a legally available target binary passes the version/hash and sandbox preflight
- **THEN** the control entry runs that exact binary with fixed settings and retains enough non-secret metadata to reproduce the condition

#### Scenario: Consumer dependency is unavailable or mismatched
- **WHEN** the binary is missing, cannot run in the constrained runtime, or does not match the declared version/hash
- **THEN** consumer acceptance does not run and returns non-success with the exact missing dependency marked SKIP; local handler checks can report their own separate result
- **AND** a parser shim, a newer CLI or an unexecuted test is not reported as a real-consumer PASS

### Requirement: Discovery is proven by actual consumer requests

The control entry SHALL compare a top-level `oneOf` baseline with the compatible schema under the same pinned consumer, tool identity, business semantics and configuration. The only compared contract difference SHALL be the schema expression needed for compatibility. Discovery evidence MUST come from the actual model request emitted by that consumer and captured by the trusted local model endpoint.

#### Scenario: Baseline tool omission is reproduced
- **WHEN** the pinned CLI receives the baseline MCP tool whose input schema uses top-level `oneOf`
- **THEN** the captured model request omits the target tool, establishing the expected negative control

#### Scenario: Compatible schema preserves tool discovery
- **WHEN** the same CLI receives the compatible expression for the same tool
- **THEN** its captured model request includes that tool with the expected input fields

#### Scenario: Historical negative control does not reproduce
- **WHEN** the consumer accepts the baseline or no valid model request is captured
- **THEN** the run reports the unmet reproduction condition or failure explicitly and does not claim that the historical failure was reproduced or fixed

### Requirement: Actual dispatch and result association

After discovery, a deterministic local model stub SHALL send a bounded, fixed tool-use response to the real CLI. The CLI MUST make the actual MCP `tools/call`; the workspace service MUST execute its real handler and local preview callback; and the CLI MUST associate the resulting tool response with the requested tool-use identifier. A stub that itself calls the handler SHALL NOT count as consumer dispatch.

#### Scenario: Text preview is dispatched through the real consumer
- **WHEN** the local stub requests `preview_card` with `mode=text` and a non-empty `text`
- **THEN** the real CLI calls the workspace MCP handler, the local callback produces the expected preview, and the CLI sends the matching tool result back to the local model endpoint

#### Scenario: Existing asset preview remains usable
- **WHEN** the same path requests `preview_card` with `mode=asset` and an allowlisted `assetId`
- **THEN** the handler produces the asset preview and the CLI returns its associated result without treating the valid branch as an illegal input

### Requirement: Server-side input semantics survive schema flattening

The actual MCP handler SHALL enforce the branch and field constraints regardless of consumer-side schema enforcement. It MUST reject mismatched modes, missing branch parameters, simultaneous text and asset parameters, unknown assets, and unexpected fields with an explicit tool error before invoking the preview callback. Flattening the discovery schema SHALL NOT authorize additional combinations.

#### Scenario: Illegal combinations reach the service boundary
- **WHEN** control acceptance submits each invalid combination directly through the same MCP service handler, including combinations a consumer might reject locally
- **THEN** the service returns a clear rejection and the observed preview callback count and state remain unchanged

### Requirement: Case-specific consumer execution preserves isolation

The new consumer entry SHALL be trusted, fixed to this case, and separate from Agent workspace code. It MUST keep the existing three tracers' process permissions, network isolation, snapshot limits, resource bounds, preflight and receipt contracts unchanged. CLI, model stub and MCP service SHALL communicate only over loopback inside the same disposable network-isolated container; no host-loopback or external endpoint SHALL be required.

The CLI SHALL receive a fresh temporary HOME/config, a minimal environment allowlist and synthetic test credentials only. Agent handler code SHALL not inherit consumer credentials, gain child-process permission, read control-only material or access other process environments. The trusted control SHALL use challenge-bound model capture and completion evidence, enforce time/output bounds, and remove the exact owned processes/container on failure.

#### Scenario: Isolated local execution
- **WHEN** the preflight proves the fixed runtime, exact binary, internal loopback path and blocked external network route
- **THEN** the CLI and stub execute within that container using only the supplied local fixture data, with no real account, host configuration, credential mount or supplier call

#### Scenario: Workspace attempts to forge success
- **WHEN** workspace code emits a success string, attempts a model request without the private challenge, or omits a required control check
- **THEN** the control entry rejects completion and does not produce an accepted receipt or PASS

#### Scenario: Execution cannot be contained
- **WHEN** a required isolation condition fails, a deadline expires, or cleanup fails
- **THEN** the run reports failure, attempts exact owned-process/container cleanup, preserves the primary error and does not fall back to unrestricted host execution

### Requirement: Evidence and claims stay within the executed boundary

The case SHALL expose a reproducible opt-in command and report PASS, FAIL, SKIP and UNVERIFIED distinctly. Minimal evidence SHALL identify the actual Skill acquisition method and verifiable version/hash, or explicitly record none/unknown. No consumer compatibility, dispatch or handler result SHALL by itself establish real-model quality or causal Skill effectiveness. Generated run output, private transcripts and consumer binaries SHALL not be added to the repository.

#### Scenario: Local contract succeeds without a paid model run
- **WHEN** discovery, actual dispatch, valid branches, invalid combinations and required isolation checks succeed using the local deterministic stub
- **THEN** the report states those specific local contract checks passed and leaves real-model behavior and Skill uplift UNVERIFIED

#### Scenario: Existing checks still protect the product
- **WHEN** this case is added
- **THEN** the repository's required `npm test` checks pass, including affected boundary tests, and the existing tracer defaults and fail-closed behavior remain unchanged
