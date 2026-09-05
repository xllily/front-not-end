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
- tests the release gate's handling of missing, stale, failed, and paginated
  GitHub evidence without changing repository settings;
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
- the tagged commit is the current `master` head;
- the three required GitHub Actions CI checks succeeded on that exact commit;
- the latest JavaScript CodeQL analysis for that commit succeeded with a
  nonempty rule set, and there are no open High/Critical CodeQL alerts on
  `master`; missing or unreadable evidence blocks publication;
- the locked install, release gate tests, and product harness pass on Node.js 24;
- the standalone Skill archive passes the same package smoke check as CI; and
- the archive receives signed build provenance from the pinned `actions/attest`
  action before being retained as a release candidate.

The candidate job receives read access to contents, checks, and security events,
plus `id-token: write` and `attestations: write` for provenance. These permissions
are limited to the trusted tag workflow; PR CI remains read-only. The action
does not create artifact storage records or require `artifact-metadata: write`.

Only the final publish job receives `contents: write`, together with attestation
read access. It uses the repository's short-lived `GITHUB_TOKEN`; no repository
secret is required. After downloading the candidate, it verifies its checksum
and attestation against this repository's release workflow, the exact tag and
source commit, and GitHub-hosted runners. A successful release contains
`front-not-end-vX.Y.Z.tar.gz` and its `.sha256` checksum. Signed provenance is
retrievable through GitHub's attestation API; it does not expand the Skill archive.
Prerelease tags are published as GitHub prereleases. Rerunning a completed job
is idempotent when that release already contains both verified assets; it does
not replace published assets.

After repository-setting and release authorization, create a release from the
accepted current `master` commit with:

```sh
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

Do not move or reuse a published version tag. If a release is defective,
publish a corrected patch version. A transient failure can rerun against the
same untouched tag while it remains the current `master` commit. If source or
workflow code must change, merge the fix to
`master`, create a new version tag, and retain the failed run as evidence rather
than weakening the release gates.

## Verify a downloaded release

For `v0.2.0`, download both assets into an empty directory and verify them:

```sh
gh release download v0.2.0 --repo xllily/front-not-end \
  --pattern 'front-not-end-v0.2.0.tar.gz*'
sha256sum --check front-not-end-v0.2.0.tar.gz.sha256
gh attestation verify front-not-end-v0.2.0.tar.gz \
  --repo xllily/front-not-end \
  --signer-workflow xllily/front-not-end/.github/workflows/release.yml \
  --source-ref refs/tags/v0.2.0 \
  --deny-self-hosted-runners
```

On macOS, `shasum -a 256 --check` can replace `sha256sum --check`. To also pin an
independently verified source commit, add `--source-digest <commit-sha>` to the
attestation command. Verification establishes artifact identity and build
origin, not correctness beyond the three [documented fixture results](tracer-result.md).
These commands describe verification after publication; they do not assert that
a version has already been published.

The checksum identifies the published archive. Packaging does not promise
byte-identical archives across separate builds because tar metadata includes
packaging time. Fresh-install checks compare the installed Skill files with
the tagged source, alongside verification of the downloaded asset itself.

See GitHub's [attestation action](https://github.com/actions/attest) and
[verification CLI](https://cli.github.com/manual/gh_attestation_verify) for the
signature and source constraints.

## GitHub repository settings

Configure the following rules in GitHub before treating the automation as a
merge or release gate:

1. Protect `master` and require pull requests plus the `Test (Node 22)`,
   `Test (Node 24)`, and `Package skill` checks.
2. Require branches to be current before merging and dismiss stale approvals.
3. Add a tag ruleset for `v*.*.*` that restricts tag creation and deletion to
   release maintainers.
4. Enable immutable releases so published tags and assets cannot be changed.
5. Enable CodeQL default setup for JavaScript/TypeScript and resolve any open
   High/Critical findings before release. The release gate reads the successful
   scan and alerts; it never enables scanning or dismisses findings.
6. Enable secret scanning and secret push protection.
7. Keep the default `GITHUB_TOKEN` permission read-only. The release workflow
   scopes its required write permissions at job level.

These repository settings are external trust boundaries; the workflow files
cannot enforce them on their own.
