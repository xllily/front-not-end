# Continuous Integration and Releases

The repository has two intentionally separate automation paths. Pull requests
and changes to `master` prove the current product and package shape without
write access. A trusted version tag reruns those checks before publishing a
GitHub Release.

## Continuous integration

`.github/workflows/ci.yml` runs for every pull request, every push to `master`,
and manual dispatches. It:

- installs from `package-lock.json` with `npm ci`;
- runs the product harness on supported Node.js 22 and 24 lines;
- builds the standalone `front-not-end` Skill archive from committed files;
- checks the archive's exact package boundary and required Skill metadata; and
- retains the archive and SHA-256 checksum for seven days.

The workflow has read-only repository permission, does not persist checkout
credentials, receives no secrets, and cancels superseded runs for the same
branch or pull request. Third-party workflow dependencies are pinned to commit
SHAs. Dependabot proposes their updates monthly.

## Versioned releases

`.github/workflows/release.yml` runs only when a tag matching `v*.*.*` is
pushed. Before publishing, it requires all of the following:

- the tag is an annotated SemVer tag such as `v1.2.0` or `v1.2.0-rc.1`;
- the tagged commit is contained in `master`;
- the locked install and product harness tests pass on Node.js 24; and
- the standalone Skill archive passes the same package smoke check as CI.

Only the final publish job receives `contents: write`. It uses the repository's
short-lived `GITHUB_TOKEN`; no repository secret is required. A successful
release contains `front-not-end-vX.Y.Z.tar.gz` and its `.sha256` checksum.
Prerelease tags are published as GitHub prereleases. Rerunning a completed job
is idempotent when that release already contains both verified assets; it does
not replace published assets.

Create a release from an accepted `master` commit with:

```sh
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

Do not move or reuse a published version tag. If a release is defective,
publish a corrected patch version. A transient failure can rerun against the
same untouched tag. If source or workflow code must change, merge the fix to
`master`, create a new version tag, and retain the failed run as evidence rather
than weakening the release gates.

## GitHub repository settings

Configure the following rules in GitHub before treating the automation as a
merge or release gate:

1. Protect `master` and require pull requests plus the `Test (Node 22)`,
   `Test (Node 24)`, and `Package skill` checks.
2. Require branches to be current before merging and dismiss stale approvals.
3. Add a tag ruleset for `v*.*.*` that restricts tag creation and deletion to
   release maintainers.
4. Enable immutable releases so published tags and assets cannot be changed.
5. Keep the default `GITHUB_TOKEN` permission read-only. The release workflow
   scopes its one required write permission at job level.

These repository settings are external trust boundaries; the workflow files
cannot enforce them on their own.
