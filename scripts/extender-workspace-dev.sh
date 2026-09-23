#!/usr/bin/env bash
set -euo pipefail

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
EXTENDER_WORKSPACE=${EXTENDER_WORKSPACE:-"$(dirname "${BLOOM_ROOT}")/extender_workspace"}
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
  # Each server runs in its own process group; killing only the subshell left
  # npm's Vite child running and holding the port.
  if [[ -n "${FRONTEND_PID}" ]]; then
    kill -- "-${FRONTEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${API_PID}" ]]; then
    kill -- "-${API_PID}" 2>/dev/null || true
  fi
}

# The address a phone on the same Wi-Fi actually reaches: the source of the default
# route. `hostname -I` lists every interface, and on a machine with Docker the first
# one is often a bridge, which would print a URL no device can open.
discover_lan_ip() {
  local address
  address="$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") print $(i + 1) }')"
  if [[ -z "${address}" ]]; then
    address="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
  fi
  printf '%s\n' "${address}"
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

if [[ "${BLOOM_FRONTEND_HOST}" == "0.0.0.0" || "${BLOOM_FRONTEND_HOST}" == "::" ]]; then
  if [[ -z "${BLOOM_PUBLIC_HOST}" ]]; then
    BLOOM_PUBLIC_HOST="$(discover_lan_ip)"
  fi
fi

# The API refuses runtime sockets from origins it does not know, so a phone on
# the same Wi-Fi needs its page origin allowed. An explicit setting wins.
if [[ -z "${BLOOM_CORS_ALLOWED_ORIGINS:-}" ]]; then
  BLOOM_CORS_ALLOWED_ORIGINS="http://127.0.0.1:${BLOOM_FRONTEND_PORT},http://localhost:${BLOOM_FRONTEND_PORT}"
  if [[ -n "${BLOOM_PUBLIC_HOST}" ]]; then
    BLOOM_CORS_ALLOWED_ORIGINS="${BLOOM_CORS_ALLOWED_ORIGINS},http://${BLOOM_PUBLIC_HOST}:${BLOOM_FRONTEND_PORT}"
  fi
  export BLOOM_CORS_ALLOWED_ORIGINS
fi

# Job control gives each background server its own process group.
set -m

echo "Starting Bloom API with ROS adapters..."
(
  cd "${BLOOM_ROOT}/backend"
  source_extender_workspace
  uv run python -m apps.bloom_cli.main api run-ros --host "${BLOOM_API_HOST}" --port "${BLOOM_API_PORT}"
) &
API_PID="$!"

if ! node "${BLOOM_ROOT}/scripts/check-node-version.mjs"; then
  echo "warning: the dashboard still starts, but tests will not run here. See README > Tooling." >&2
fi

echo "Starting Bloom dashboard..."
(
  cd "${BLOOM_ROOT}"
  VITE_BLOOM_API_PROXY_TARGET="${BLOOM_API_PROXY_TARGET}" \
    npm run dev --workspace @bloom/dashboard -- --host "${BLOOM_FRONTEND_HOST}" --port "${BLOOM_FRONTEND_PORT}" --strictPort
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
  if [[ -n "${BLOOM_PUBLIC_HOST}" ]]; then
    echo "Same-Wi-Fi URL: http://${BLOOM_PUBLIC_HOST}:${BLOOM_FRONTEND_PORT}"
  else
    echo "Could not detect a LAN address. Set BLOOM_PUBLIC_HOST to print the device URL."
  fi
  echo "WARNING: the Vite dev server and its proxied Bloom API are reachable from this network."
fi

wait -n "${API_PID}" "${FRONTEND_PID}"
