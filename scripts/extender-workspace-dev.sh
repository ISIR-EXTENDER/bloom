#!/usr/bin/env bash
set -euo pipefail

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
EXTENDER_WORKSPACE=${EXTENDER_WORKSPACE:-"/home/susana/workspace/extender/extender_workspace"}
EXTENDER_SETUP_FILE=${EXTENDER_SETUP_FILE:-"${EXTENDER_WORKSPACE}/install/setup.bash"}
BLOOM_API_HOST=${BLOOM_API_HOST:-"127.0.0.1"}
BLOOM_API_PORT=${BLOOM_API_PORT:-"8000"}
BLOOM_FRONTEND_HOST=${BLOOM_FRONTEND_HOST:-"127.0.0.1"}
BLOOM_FRONTEND_PORT=${BLOOM_FRONTEND_PORT:-"5173"}
BLOOM_APPLY_TABLET_TOUCH_MAP=${BLOOM_APPLY_TABLET_TOUCH_MAP:-"0"}

API_PID=""
FRONTEND_PID=""

cleanup() {
  if [[ -n "${FRONTEND_PID}" ]]; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${API_PID}" ]]; then
    kill "${API_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ ! -f "${EXTENDER_SETUP_FILE}" ]]; then
  echo "Extender setup file not found: ${EXTENDER_SETUP_FILE}" >&2
  echo "Build the ROS workspace first, or set EXTENDER_SETUP_FILE to the correct setup.bash." >&2
  exit 1
fi

if [[ "${BLOOM_APPLY_TABLET_TOUCH_MAP}" == "1" ]]; then
  "${BLOOM_ROOT}/scripts/extender-tablet-touch-map.sh"
fi

echo "Starting Bloom API with ROS adapters..."
(
  cd "${BLOOM_ROOT}/backend"
  # shellcheck source=/dev/null
  source "${EXTENDER_SETUP_FILE}"
  uv run python -m apps.bloom_cli.main api run-ros --host "${BLOOM_API_HOST}" --port "${BLOOM_API_PORT}"
) &
API_PID="$!"

echo "Starting Bloom dashboard..."
(
  cd "${BLOOM_ROOT}"
  npm run dev --workspace @bloom/dashboard -- --host "${BLOOM_FRONTEND_HOST}" --port "${BLOOM_FRONTEND_PORT}"
) &
FRONTEND_PID="$!"

cat <<EOF

Bloom Extender dev entrypoint is running.

API:       http://${BLOOM_API_HOST}:${BLOOM_API_PORT}
Frontend: http://${BLOOM_FRONTEND_HOST}:${BLOOM_FRONTEND_PORT}

Press Ctrl+C to stop both processes.
EOF

wait -n "${API_PID}" "${FRONTEND_PID}"
