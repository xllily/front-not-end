# Active Fixtures

[`existing-list-search-reuse`](existing-list-search-reuse/) is a small Node.js
repository with:

- an existing request-context-scoped project detail method;
- an existing query/cursor module;
- repository tests for that module; and
- a control-side acceptance test for the completed product change.

[`project-create-authorization`](project-create-authorization/) is a separate
small Node.js repository with:

- an existing request-context-scoped project detail method;
- an existing authorized, scoped, idempotent create helper;
- repository tests for that helper; and
- a control-side acceptance test for duplicate submissions, authorization,
  validation, compatibility, and dependency scope.

Copy `seed/` into a fresh temporary directory for every Agent run. Do not run
the Agent in this authoring checkout.

[`real-consumer-contract-slice`](real-consumer-contract-slice/seed/) contains a
standalone local MCP service and native tests. One handler validates both text
and the bundled `sample-card` asset, then returns self-contained HTML. The
default schema is a flat object; `--baseline` adds the historical top-level
`oneOf` expression without changing the handler. Run `npm run test:preview`
from the repository root for local service evidence. The separate fixed-case
`npm run test:consumer -- --cli <path>` entry captures actual requests and calls
from the pinned real CLI using a local model stub; it does not change the
original restricted runner's case allowlist. Its controller observes the same
handler and renderer, including generation counts before and after rejection.
See [dependency hashes and proof limits](../../docs/evaluation.md#local-mcp-preview-slice).
