#!/usr/bin/env bash
set -euo pipefail

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
EXTENDER_WORKSPACE=${EXTENDER_WORKSPACE:-"/home/susana/workspace/extender/extender_workspace"}
EXTENDER_SETUP_FILE=${EXTENDER_SETUP_FILE:-"${EXTENDER_WORKSPACE}/install/setup.bash"}
BLOOM_API_HOST=${BLOOM_API_HOST:-"127.0.0.1"}
BLOOM_API_PORT=${BLOOM_API_PORT:-"8000"}
BLOOM_FRONTEND_HOST=${BLOOM_FRONTEND_HOST:-"127.0.0.1"}
BLOOM_FRONTEND_PORT=${BLOOM_FRONTEND_PORT:-"5173"}
BLOOM_API_PROXY_TARGET=${BLOOM_API_PROXY_TARGET:-"http://127.0.0.1:${BLOOM_API_PORT}"}
BLOOM_PUBLIC_HOST=${BLOOM_PUBLIC_HOST:-""}
BLOOM_APPLY_TABLET_TOUCH_MAP=${BLOOM_APPLY_TABLET_TOUCH_MAP:-"0"}

API_PID=""
FRONTEND_PID=""

source_extender_workspace() {
  # ROS/colcon setup hooks are not guaranteed to be nounset-safe.
  set +u
  # shellcheck source=/dev/null
  source "${EXTENDER_SETUP_FILE}"
  set -u
}

cleanup() {
  if [[ -n "${FRONTEND_PID}" ]]; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${API_PID}" ]]; then
    kill "${API_PID}" 2>/dev/null || true
  fi
}

discover_lan_ip() {
  local addresses
  addresses="$(hostname -I 2>/dev/null || true)"
  printf '%s\n' "${addresses}" | awk '{ print $1 }'
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
  source_extender_workspace
  uv run python -m apps.bloom_cli.main api run-ros --host "${BLOOM_API_HOST}" --port "${BLOOM_API_PORT}"
) &
API_PID="$!"

echo "Starting Bloom dashboard..."
(
  cd "${BLOOM_ROOT}"
  VITE_BLOOM_API_PROXY_TARGET="${BLOOM_API_PROXY_TARGET}" \
    npm run dev --workspace @bloom/dashboard -- --host "${BLOOM_FRONTEND_HOST}" --port "${BLOOM_FRONTEND_PORT}"
) &
FRONTEND_PID="$!"

cat <<EOF

Bloom Extender dev entrypoint is running.

API:       http://${BLOOM_API_HOST}:${BLOOM_API_PORT}
Frontend: http://${BLOOM_FRONTEND_HOST}:${BLOOM_FRONTEND_PORT}
API proxy: ${BLOOM_API_PROXY_TARGET}

Press Ctrl+C to stop both processes.
EOF

if [[ "${BLOOM_FRONTEND_HOST}" == "0.0.0.0" || "${BLOOM_FRONTEND_HOST}" == "::" ]]; then
  if [[ -z "${BLOOM_PUBLIC_HOST}" ]]; then
    BLOOM_PUBLIC_HOST="$(discover_lan_ip)"
  fi

  if [[ -n "${BLOOM_PUBLIC_HOST}" ]]; then
    echo "Same-Wi-Fi URL: http://${BLOOM_PUBLIC_HOST}:${BLOOM_FRONTEND_PORT}"
  else
    echo "Could not detect a LAN address. Set BLOOM_PUBLIC_HOST to print the device URL."
  fi
  echo "WARNING: the Vite dev server and its proxied Bloom API are reachable from this network."
fi

wait -n "${API_PID}" "${FRONTEND_PID}"
