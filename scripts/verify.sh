#!/usr/bin/env bash
# Everything CI runs, in CI's order, against the working tree.
#
# CI checks out the commit; this checks what is on disk. A clean tree is what
# makes the two agree, so the first thing it reports is whether yours is dirty.
set -euo pipefail

cd "$(dirname "$0")/.."

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
npm run audit:frontend
# pip-audit resolves into a throwaway virtualenv, which needs ensurepip. A
# machine without python3-venv cannot run it at all, and that is a missing
# tool rather than a vulnerability, so say so instead of failing the run.
audit_output="$(npm run audit:backend 2>&1)" && audit_status=0 || audit_status=$?
if [ "$audit_status" -ne 0 ]; then
  # The message wraps mid-phrase, so match the word rather than the sentence.
  if grep -q "ensurepip" <<<"$audit_output"; then
    echo "skipped: backend audit needs python3-venv on this machine (CI runs it)."
    echo "         install it with: sudo apt install python3-venv"
  else
    echo "$audit_output"
    exit "$audit_status"
  fi
fi

echo "==> visual smoke"
npm run visual:smoke

echo "all green"
