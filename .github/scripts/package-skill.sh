#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: package-skill.sh <release-id> <output-directory> [git-ref]" >&2
  exit 2
fi

release_id=$1
output_directory=$2
source_ref=${3:-HEAD}

if [[ ! "$release_id" =~ ^v?[0-9A-Za-z][0-9A-Za-z.-]*$ ]]; then
  echo "Release identifier contains unsupported characters: $release_id" >&2
  exit 2
fi

repository_root=$(git rev-parse --show-toplevel)
mkdir -p "$output_directory"
output_directory=$(cd "$output_directory" && pwd)

archive_name="front-not-end-${release_id}.tar.gz"
archive_path="$output_directory/$archive_name"
checksum_path="$archive_path.sha256"

git -C "$repository_root" archive \
  --format=tar.gz \
  --prefix=front-not-end/ \
  --output="$archive_path" \
  "$source_ref:skills/front-not-end"

expected_entries=$'front-not-end/\nfront-not-end/SKILL.md\nfront-not-end/references/\nfront-not-end/references/skill-learning.md'
actual_entries=$(tar -tzf "$archive_path")

if [[ "$actual_entries" != "$expected_entries" ]]; then
  echo "Packaged Skill contents do not match the public package contract." >&2
  diff -u <(printf '%s\n' "$expected_entries") <(printf '%s\n' "$actual_entries") >&2 || true
  exit 1
fi

extraction_directory=$(mktemp -d "${TMPDIR:-/tmp}/front-not-end-package.XXXXXX")
cleanup() {
  rm -rf -- "$extraction_directory"
}
trap cleanup EXIT

tar -xzf "$archive_path" -C "$extraction_directory"
test -s "$extraction_directory/front-not-end/SKILL.md"
test -s "$extraction_directory/front-not-end/references/skill-learning.md"
grep -Fxq -- "name: front-not-end" "$extraction_directory/front-not-end/SKILL.md"

if command -v sha256sum >/dev/null 2>&1; then
  checksum=$(sha256sum "$archive_path" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  checksum=$(shasum -a 256 "$archive_path" | awk '{print $1}')
else
  echo "A SHA-256 checksum tool is required (sha256sum or shasum)." >&2
  exit 1
fi

printf '%s  %s\n' "$checksum" "$archive_name" > "$checksum_path"
printf '%s\n' "$archive_path"
