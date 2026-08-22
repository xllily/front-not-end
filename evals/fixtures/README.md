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
