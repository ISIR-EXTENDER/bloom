#!/usr/bin/env bash
# Author a complete app through the Builder, then open it and drive it.
#
#   npm run e2e:builder
#
# Starts the real API on a throwaway store and the dashboard against it, so the save path, the
# validation and the seeding are exercised rather than mocked. No ROS: the gateways report
# "simulated" and the checks assert on what Bloom sends, not on what an arm does. The ROS half
# belongs to scripts/ros-sim-e2e.sh, which drives shipped apps on a live robot.
set -euo pipefail

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
OUT_DIR=${BLOOM_E2E_BUILDER_OUT:-"/tmp/bloom-builder-e2e"}
LOG_DIR="${OUT_DIR}/logs"
STARTUP_TIMEOUT=${BLOOM_E2E_STARTUP_TIMEOUT:-120}

free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
log() { printf '\n== %s\n' "$1"; }

http_ok() { curl -fsS --max-time 2 "$1" >/dev/null 2>&1; }
wait_for() {
  local what=$1 timeout=$2 check=$3 target=$4 waited=0
  until "${check}" "${target}"; do
    sleep 1
    waited=$((waited + 1))
    if ((waited >= timeout)); then
      echo "${what} did not come up within ${timeout}s; see ${LOG_DIR}" >&2
      exit 1
    fi
  done
}

rm -rf "${OUT_DIR}"
mkdir -p "${LOG_DIR}"

API_PORT=${BLOOM_E2E_API_PORT:-$(free_port)}
DASHBOARD_PORT=${BLOOM_E2E_DASHBOARD_PORT:-$(free_port)}
DASHBOARD_URL="http://127.0.0.1:${DASHBOARD_PORT}"

cleanup() {
  local status=$?
  # Each server runs in its own process group, so the kill reaches npm's Vite and uv's Python too.
  [[ -n "${DASHBOARD_PID:-}" ]] && kill -- "-${DASHBOARD_PID}" 2>/dev/null || true
  [[ -n "${API_PID:-}" ]] && kill -- "-${API_PID}" 2>/dev/null || true
  wait 2>/dev/null || true
  exit "${status}"
}
trap cleanup EXIT INT TERM

set -m
log "starting the API on port ${API_PORT}"
(
  cd "${BLOOM_ROOT}/backend"
  BLOOM_CONFIGURATION_DATABASE_PATH="${OUT_DIR}/bloom.db" \
    BLOOM_RUNTIME_STOP_STATE_PATH="${OUT_DIR}/runtime_stop.json" \
    BLOOM_CONFIGURATION_DIR="${OUT_DIR}/configurations" \
    BLOOM_CORS_ALLOWED_ORIGINS="${DASHBOARD_URL}" \
    BLOOM_ROBOT_NAME="Explorer" \
    BLOOM_ROS_EE_FRAME_ID="effector_frame" \
    exec uv run python -m apps.bloom_cli.main api run --host 127.0.0.1 --port "${API_PORT}"
) >"${LOG_DIR}/api.log" 2>&1 &
API_PID=$!

log "starting the dashboard on port ${DASHBOARD_PORT}"
(
  cd "${BLOOM_ROOT}"
  VITE_BLOOM_API_PROXY_TARGET="http://127.0.0.1:${API_PORT}" \
    exec npm run dev --workspace @bloom/dashboard -- \
    --host 127.0.0.1 --port "${DASHBOARD_PORT}" --strictPort
) >"${LOG_DIR}/dashboard.log" 2>&1 &
DASHBOARD_PID=$!
set +m

wait_for "the API" "${STARTUP_TIMEOUT}" http_ok "http://127.0.0.1:${API_PORT}/api/v1/health"
wait_for "the dashboard" "${STARTUP_TIMEOUT}" http_ok "${DASHBOARD_URL}"

log "running checks against ${DASHBOARD_URL}; results in ${OUT_DIR}"
status=0
BLOOM_DASHBOARD_URL="${DASHBOARD_URL}" BLOOM_API_URL="http://127.0.0.1:${API_PORT}" \
  node "${BLOOM_ROOT}/scripts/builder-e2e-checks.mjs" --out "${OUT_DIR}" || status=$?
exit "${status}"
