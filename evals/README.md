# Product Tracer

This directory contains the single runnable product tracer for Version 0.1:

```text
evals/
├── cases/development/existing-list-search-reuse/
│   ├── task.md
│   └── organization-context.md
├── fixtures/existing-list-search-reuse/
│   ├── seed/
│   └── acceptance/list-projects.test.mjs
└── harness/
    └── run-tracer-acceptance.mjs
```

The Agent sees only the copied seed, product request, and organization context.
The acceptance test remains outside the Agent workspace and runs afterward in
a separate restricted process.

This is minimum product validation, not a general evaluation platform.
