#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  exit 0
fi

cd "$repo_root"

git config core.hooksPath .githooks

if [[ -f .githooks/pre-commit ]]; then
  chmod +x .githooks/pre-commit
fi

echo "Git hooks configured to use .githooks"
