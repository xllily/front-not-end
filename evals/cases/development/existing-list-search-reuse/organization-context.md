# Organization context

- Every data-access path is tenant-scoped by the request context; callers must
  not supply or override a different tenant identifier.
- The existing `src/platform-query-page.mjs` module is the supported query and
  cursor path for list/search endpoints. Extend it only when its contract cannot
  express the product behavior.
- This service runs on Node.js 22. The repository test command is the required
  pre-merge check for this fixture.
- Adding a search cluster, cache, queue, or new persistence library requires a
  separate architecture decision and is outside this task.
