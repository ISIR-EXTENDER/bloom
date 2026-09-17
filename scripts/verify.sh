#!/usr/bin/env bash
# Everything CI runs, in CI's order, against the working tree.
#
# CI checks out the commit; this checks what is on disk. A clean tree is what
# makes the two agree, so the first thing it reports is whether yours is dirty.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! node scripts/check-node-version.mjs; then
  echo "error: the jsdom test suites cannot start on this Node; see README > Tooling to upgrade." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "note: working tree is dirty, so this verifies more than a push would."
fi

echo "==> backend lint"
(cd backend && make lint)

echo "==> backend tests"
(cd backend && make test)

echo "==> frontend lint and format"
npm run check

echo "==> frontend build"
npm run build

echo "==> frontend tests"
npm run test

echo "==> dependency audits"
npm run audit:security

echo "==> visual smoke"
npm run visual:smoke

echo "all green"
