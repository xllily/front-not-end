# Development Case Register

This register defines the Adapter-visible development corpus. Exact case inputs
are added only with a reproducible fixture revision and valid `case.schema.json`
artifact. Expectations and oracle `deterministicRule` values are never stored
here.

| Planned case ID | Purpose | Freeze state |
|---|---|---|
| `z2o-reference-fit` | Bounded TypeScript/NestJS/PostgreSQL fit and production-shape journey | Not authored |
| `z2o-reference-mismatch-dev` | Visible boundary example for reference-stack rejection behavior | Not authored |
| `existing-list-search-reuse` | Routine/Material multi-tenant List/Search and capability discovery | Not authored |
| `high-webhook-credits` | High-risk idempotency, transactions, retries, ordering, and external effects | Not authored |
| `sensitive-data-lifecycle` | Migration, rollback, retention/deletion facts, and BLOCKED behavior | Not authored |
| `routine-negative-control` | False activation, irrelevant concerns, and ceremony/noise tolerance | Not authored |

`Not authored` is deliberate: the current repository has no immutable `HEAD`,
and a case cannot be frozen against an unborn fixture revision. This register is
not an oracle and must not be used for scoring.

Before a row becomes `FROZEN`, its case input, fixture manifest, task,
organization context, baseline `AGENTS.md`, comparison factors, and digests must
validate against the public contracts. A separately permissioned control-side
oracle must record the factual basis and Assurance requirement for every item.
