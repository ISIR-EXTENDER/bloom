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

echo "==> app contracts and version carriers"
npm run check:contracts

echo "==> dependency audits"
npm run audit:security

echo "==> dynamic security smoke"
# A throwaway store and port, so this never touches the local app library.
smoke_dir="$(mktemp -d)"
smoke_port=8765
(cd backend && BLOOM_CONFIGURATION_DATABASE_PATH="${smoke_dir}/bloom.db" BLOOM_CONFIGURATION_DIR="${smoke_dir}/configurations" \
  BLOOM_THEME_ASSET_DIR="${smoke_dir}/theme-assets" \
  uv run uvicorn apps.bloom_api.main:app --host 127.0.0.1 --port "${smoke_port}" > "${smoke_dir}/api.log" 2>&1) &
smoke_api_pid=$!
trap 'kill -- "${smoke_api_pid}" 2>/dev/null; pkill -f "uvicorn apps.bloom_api.main:app --host 127.0.0.1 --port ${smoke_port}" 2>/dev/null; rm -rf "${smoke_dir}"' EXIT
for _ in $(seq 1 30); do
  curl --fail --silent "http://127.0.0.1:${smoke_port}/api/v1/health" > /dev/null && break
  sleep 1
done
BLOOM_SECURITY_SCAN_BASE_URL="http://127.0.0.1:${smoke_port}" npm run security:dynamic

echo "==> visual smoke"
npm run visual:smoke

echo "all green"
