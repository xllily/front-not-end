# Active Development Cases

The repository has three active cases:

- [`existing-list-search-reuse`](existing-list-search-reuse/task.md) checks a
  product-requested project list with keyword search and stable “load more”.
- [`project-create-authorization`](project-create-authorization/task.md) checks
  authorized project creation, authoritative request scope, and duplicate-safe
  retries.
- [`webhook-retry-idempotency`](webhook-retry-idempotency/task.md) checks signed
  order updates, verified provider-account scope, and atomic retry handling.

Their organization contexts explicitly establish workspace data boundaries and
the existing platform capabilities the Agent must reuse. Those facts belong to
these scenarios and must not become defaults for unrelated applications.

The opt-in [`real-consumer-contract-slice`](real-consumer-contract-slice/task.md)
adds a runnable local MCP preview service with text/asset input and server-side
rejection before generation. Its stdio and handler checks run with
`npm run test:preview`. Its separate `npm run test:consumer -- --cli <path>` entry
checks discovery and dispatch with the exact pinned real CLI and a local model
stub. It does not extend the original runner's case allowlist. See the
[proof boundary and dependency hashes](../../../docs/evaluation.md#local-mcp-preview-slice).
