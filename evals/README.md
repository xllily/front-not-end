# Product Tracer

This directory contains three runnable product tracers:

```text
evals/
├── cases/development/
│   ├── existing-list-search-reuse/
│   ├── project-create-authorization/
│   └── webhook-retry-idempotency/
├── fixtures/
│   ├── existing-list-search-reuse/
│   ├── project-create-authorization/
│   └── webhook-retry-idempotency/
└── harness/
    ├── pull-tracer-image.mjs
    ├── run-tracer-acceptance.mjs
    ├── runtime-call-proof.mjs
    └── tracer-sandbox.mjs
```

Each case supplies a copied seed, product request, and organization context.
The Agent's installed Skills and host memory can also affect its context; the
recorded result must disclose that exposure. The acceptance test remains
outside the Agent workspace and runs afterward in a disposable,
network-isolated container against a sanitized read-only snapshot.

This is minimum product validation, not a general evaluation platform.
