# Product Tracer

This directory contains two runnable product tracers for Version 0.1:

```text
evals/
├── cases/development/
│   ├── existing-list-search-reuse/
│   └── project-create-authorization/
├── fixtures/
│   ├── existing-list-search-reuse/
│   └── project-create-authorization/
└── harness/
    └── run-tracer-acceptance.mjs
```

The Agent sees only the copied seed, product request, and organization context.
The acceptance test remains outside the Agent workspace and runs afterward in
a separate restricted process.

This is minimum product validation, not a general evaluation platform.
