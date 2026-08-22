# Organization context

- The request context is the authoritative source of the current workspace and
  permissions. Callers must not supply or override either value.
- `project:create` is the permission required to create a project.
- The existing `src/platform-create-project.mjs` module is the supported
  validation, authorization, workspace-scope, and idempotent mutation path.
  Its repository `createOnce` operation atomically returns the first result for
  repeated use of the same workspace and operation identifier.
- This service runs on Node.js 22. The repository test command is the required
  pre-merge check for this fixture.
- Adding a database, cache, queue, or dependency requires a separate
  architecture decision and is outside this task.
