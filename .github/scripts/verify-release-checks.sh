#!/usr/bin/env bash

set -euo pipefail

repository=${1:?Repository is required}
release_commit=${2:?Release commit is required}

# Bind branch-scoped CodeQL alerts to the exact source being released.
master_commit=$(gh api "repos/$repository/git/ref/heads/master" --jq .object.sha)
if [[ "$master_commit" != "$release_commit" ]]; then
  echo "Release commit must be the current master head." >&2
  exit 1
fi

gh api --paginate --slurp \
  "repos/$repository/commits/$release_commit/check-runs?filter=latest&per_page=100" |
  jq -e --arg commit "$release_commit" '
    [.[] | .check_runs[]] as $checks |
    all(["Test (Node 22)", "Test (Node 24)", "Package skill"][];
      . as $name | any($checks[];
        .name == $name and .head_sha == $commit and
        .app.slug == "github-actions" and
        .status == "completed" and .conclusion == "success"))
  ' >/dev/null || {
    echo "All required CI checks must succeed on the release commit." >&2
    exit 1
  }

gh api --paginate --slurp \
  "repos/$repository/code-scanning/analyses?tool_name=CodeQL&ref=refs/heads/master&per_page=100" |
  jq -e --arg commit "$release_commit" '
    [.[][] | select(.commit_sha == $commit and .ref == "refs/heads/master" and
      .tool.name == "CodeQL") |
      select((.environment | fromjson | .language) as $language |
        $language == "javascript" or $language == "javascript-typescript")] |
    sort_by(.created_at) | last |
    . != null and .error == "" and .rules_count > 0
  ' >/dev/null || {
    echo "A successful JavaScript CodeQL analysis is required for the release commit." >&2
    exit 1
  }

gh api --paginate --slurp \
  "repos/$repository/code-scanning/alerts?tool_name=CodeQL&ref=refs/heads/master&state=open&per_page=100" |
  jq -e '
    if type != "array" or any(.[]; type != "array") then
      error("Expected paginated alert arrays")
    else
      [.[][] | select(.rule.security_severity_level == "high" or
        .rule.security_severity_level == "critical")] | length == 0
    end
  ' >/dev/null || {
    echo "Open High/Critical CodeQL alerts or unavailable alert evidence block release." >&2
    exit 1
  }

master_commit=$(gh api "repos/$repository/git/ref/heads/master" --jq .object.sha)
if [[ "$master_commit" != "$release_commit" ]]; then
  echo "Master changed during release verification; re-evaluate the candidate." >&2
  exit 1
fi

echo "Release CI and CodeQL checks passed for $release_commit."
