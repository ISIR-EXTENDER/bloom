#!/usr/bin/env bash
# shellcheck disable=SC2329
set -euo pipefail

usage() {
  cat <<'EOF'
Keep a simulated Explorer or Kinova, the Bloom API and the dashboard alive while demo GIFs are recorded.

  scripts/demo-gifs-stack.sh --robot explorer|kinova --out dir

Same start-up as scripts/ros-sim-e2e.sh (which runs its checks and tears down); this one writes <out>/stack.env
(DASHBOARD_URL, API_PORT, ROS_DOMAIN_ID) once everything answers and stays up until <out>/stop exists or it
receives SIGTERM. Every child runs in its own process group and only those groups are killed.

Environment: EXTENDER_WORKSPACE, EXTENDER_SETUP_FILE, BLOOM_E2E_EXTRA_PREFIX, BLOOM_E2E_ROS_DOMAIN_ID (42),
BLOOM_E2E_API_PORT (8020), BLOOM_E2E_DASHBOARD_PORT (5180), BLOOM_E2E_STARTUP_TIMEOUT (180).

A second API and dashboard pair (ports +1: 8021 and 5181, VIEW_DASHBOARD_URL in stack.env) serves the robot-view
page. The runtime control lease is per API process and the first session to claim it keeps it, so a Bloom Debug
page on the operator's API would hold the lease and the operator app would never read READY. The viewer pair only
reads the ROS graph; it never carries a control the recorder presses.
EOF
}

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
EXTENDER_WORKSPACE=${EXTENDER_WORKSPACE:-"$(cd "${BLOOM_ROOT}/.." && pwd)/extender_workspace"}
EXTENDER_SETUP_FILE=${EXTENDER_SETUP_FILE:-"${EXTENDER_WORKSPACE}/install/setup.bash"}
STARTUP_TIMEOUT=${BLOOM_E2E_STARTUP_TIMEOUT:-180}

ROBOT=""
OUT_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --robot) ROBOT="${2:-}"; shift 2 ;;
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "${ROBOT}" in
  explorer) ROBOT_NAME="Explorer" ;;
  kinova) ROBOT_NAME="Kinova" ;;
  *) echo "--robot must be explorer or kinova" >&2; exit 2 ;;
esac
EE_FRAME_ID="effector_frame"
[[ -n "${OUT_DIR}" ]] || { echo "--out is required" >&2; exit 2; }
mkdir -p "${OUT_DIR}/logs"
OUT_DIR=$(cd "${OUT_DIR}" && pwd)
LOG_DIR="${OUT_DIR}/logs"
rm -f "${OUT_DIR}/stop" "${OUT_DIR}/stack.env"

LAUNCH_PID=""; BRIDGE_PID=""; API_PID=""; DASHBOARD_PID=""; VIEW_API_PID=""; VIEW_DASHBOARD_PID=""
log() { printf '[demo-stack] %s\n' "$*"; }

stop_group() {
  local pid="$1" name="$2"
  if [[ -z "${pid}" ]] || ! kill -0 -- "-${pid}" 2>/dev/null; then return 0; fi
  log "stopping ${name}"
  kill -INT -- "-${pid}" 2>/dev/null || true
  for _ in $(seq 1 50); do kill -0 -- "-${pid}" 2>/dev/null || return 0; sleep 0.2; done
  kill -KILL -- "-${pid}" 2>/dev/null || true
}
cleanup() {
  stop_group "${VIEW_DASHBOARD_PID}" "viewer dashboard"
  stop_group "${VIEW_API_PID}" "viewer api"
  stop_group "${DASHBOARD_PID}" dashboard
  stop_group "${API_PID}" api
  stop_group "${BRIDGE_PID}" "clock bridge"
  stop_group "${LAUNCH_PID}" simulation
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

set +u
# shellcheck source=/dev/null
source "${EXTENDER_SETUP_FILE}"
if [[ -n "${BLOOM_E2E_EXTRA_PREFIX:-}" ]]; then
  IFS=: read -r -a prefixes <<<"${BLOOM_E2E_EXTRA_PREFIX}"
  for prefix in "${prefixes[@]}"; do
    export AMENT_PREFIX_PATH="${prefix}:${AMENT_PREFIX_PATH}"
    export LD_LIBRARY_PATH="${prefix}/lib:${LD_LIBRARY_PATH:-}"
  done
fi
set -u
cd "${BLOOM_ROOT}"

wait_for() {
  local description="$1" timeout="$2"; shift 2
  local deadline=$((SECONDS + timeout))
  until "$@" >/dev/null 2>&1; do
    if [[ -n "${LAUNCH_PID}" ]] && ! kill -0 "${LAUNCH_PID}" 2>/dev/null; then
      echo "The simulation launch exited while waiting for ${description}; see ${LOG_DIR}/launch.log." >&2; return 1
    fi
    ((SECONDS >= deadline)) && { echo "Timed out after ${timeout}s waiting for ${description}." >&2; return 1; }
    sleep 1
  done
}
log_has() { grep -aqE "$2" "$1"; }
topic_has_sample() { timeout 5 ros2 topic echo --once "$1" >/dev/null; }
http_ok() { curl -fsS -o /dev/null "$1"; }

export ROS_DOMAIN_ID=${BLOOM_E2E_ROS_DOMAIN_ID:-42}
if [[ "${ROBOT}" == "explorer" ]] && pgrep -f "[g]z sim" >/dev/null; then
  echo "A Gazebo simulation is already running." >&2; exit 1
fi
leftover_nodes=$(ros2 node list --no-daemon 2>/dev/null | tr '\n' ' ')
if [[ -n "${leftover_nodes}" ]]; then
  echo "ROS_DOMAIN_ID=${ROS_DOMAIN_ID} is not empty (${leftover_nodes})." >&2; exit 1
fi
API_PORT=${BLOOM_E2E_API_PORT:-8020}
DASHBOARD_PORT=${BLOOM_E2E_DASHBOARD_PORT:-5180}
DASHBOARD_URL="http://127.0.0.1:${DASHBOARD_PORT}"
VIEW_API_PORT=$((API_PORT + 1))
VIEW_DASHBOARD_PORT=$((DASHBOARD_PORT + 1))
VIEW_DASHBOARD_URL="http://127.0.0.1:${VIEW_DASHBOARD_PORT}"
LAUNCH_LOG="${LOG_DIR}/launch.log"

set -m
log "launching the ${ROBOT} simulation on ROS_DOMAIN_ID=${ROS_DOMAIN_ID}"
ros2 launch cartesian_manager "${ROBOT}.launch.py" use_simulation:=true gui:=false >"${LAUNCH_LOG}" 2>&1 &
LAUNCH_PID=$!
if [[ "${ROBOT}" == "explorer" ]]; then
  wait_for "the stuck ros2_control_node" "${STARTUP_TIMEOUT}" log_has "${LAUNCH_LOG}" "Waiting for data on 'robot_description'"
  log "working around the stuck ros2_control_node"
  pkill -g "${LAUNCH_PID}" -f "[r]os2_control_node" || true
  log "bridging the Gazebo clock"
  ros2 run ros_gz_bridge parameter_bridge "/clock@rosgraph_msgs/msg/Clock[gz.msgs.Clock" >"${LOG_DIR}/clock-bridge.log" 2>&1 &
  BRIDGE_PID=$!
fi
wait_for "the gripper controller" "${STARTUP_TIMEOUT}" log_has "${LAUNCH_LOG}" "activated.*gripper_controller"
if ! ros2 control list_controllers 2>/dev/null | grep -qE "^qontrol_explorer\s+\S+\s+active"; then
  log "qontrol is not active; taking the joint interfaces from forward_position_controller"
  ros2 control set_controller_state forward_position_controller inactive >/dev/null 2>&1 || true
  ros2 control set_controller_state qontrol_explorer active >/dev/null 2>&1 || true
fi
wait_for "qontrol to publish /ee_pose" "${STARTUP_TIMEOUT}" topic_has_sample /ee_pose
log "simulation ready"

log "starting the API on port ${API_PORT}"
(
  cd "${BLOOM_ROOT}/backend"
  BLOOM_CONFIGURATION_DATABASE_PATH="${OUT_DIR}/bloom.db" \
    BLOOM_RUNTIME_STOP_STATE_PATH="${OUT_DIR}/runtime_stop.json" \
    BLOOM_CONFIGURATION_DIR="${OUT_DIR}/configurations" \
    BLOOM_CORS_ALLOWED_ORIGINS="${DASHBOARD_URL},http://localhost:${DASHBOARD_PORT}" \
    BLOOM_ROBOT_NAME="${ROBOT_NAME}" \
    BLOOM_ROS_EE_FRAME_ID="${EE_FRAME_ID}" \
    exec uv run python -m apps.bloom_cli.main api run-ros --host 127.0.0.1 --port "${API_PORT}"
) >"${LOG_DIR}/api.log" 2>&1 &
API_PID=$!
log "starting the dashboard on port ${DASHBOARD_PORT}"
VITE_BLOOM_API_PROXY_TARGET="http://127.0.0.1:${API_PORT}" \
  npm run dev --workspace @bloom/dashboard -- --host 127.0.0.1 --port "${DASHBOARD_PORT}" --strictPort \
  >"${LOG_DIR}/dashboard.log" 2>&1 &
DASHBOARD_PID=$!
log "starting the viewer API on port ${VIEW_API_PORT}"
(
  cd "${BLOOM_ROOT}/backend"
  BLOOM_CONFIGURATION_DATABASE_PATH="${OUT_DIR}/bloom-view.db" \
    BLOOM_RUNTIME_STOP_STATE_PATH="${OUT_DIR}/runtime_stop_view.json" \
    BLOOM_CONFIGURATION_DIR="${OUT_DIR}/configurations-view" \
    BLOOM_CORS_ALLOWED_ORIGINS="${VIEW_DASHBOARD_URL},http://localhost:${VIEW_DASHBOARD_PORT}" \
    BLOOM_ROBOT_NAME="${ROBOT_NAME}" \
    BLOOM_ROS_EE_FRAME_ID="${EE_FRAME_ID}" \
    exec uv run python -m apps.bloom_cli.main api run-ros --host 127.0.0.1 --port "${VIEW_API_PORT}"
) >"${LOG_DIR}/api-view.log" 2>&1 &
VIEW_API_PID=$!
log "starting the viewer dashboard on port ${VIEW_DASHBOARD_PORT}"
VITE_BLOOM_API_PROXY_TARGET="http://127.0.0.1:${VIEW_API_PORT}" \
  npm run dev --workspace @bloom/dashboard -- --host 127.0.0.1 --port "${VIEW_DASHBOARD_PORT}" --strictPort \
  >"${LOG_DIR}/dashboard-view.log" 2>&1 &
VIEW_DASHBOARD_PID=$!
wait_for "the API" "${STARTUP_TIMEOUT}" http_ok "http://127.0.0.1:${API_PORT}/api/v1/health"
wait_for "the dashboard" "${STARTUP_TIMEOUT}" http_ok "${DASHBOARD_URL}"
wait_for "the viewer API" "${STARTUP_TIMEOUT}" http_ok "http://127.0.0.1:${VIEW_API_PORT}/api/v1/health"
wait_for "the viewer dashboard" "${STARTUP_TIMEOUT}" http_ok "${VIEW_DASHBOARD_URL}"
set +m

cat >"${OUT_DIR}/stack.env" <<EOF
DASHBOARD_URL=${DASHBOARD_URL}
API_PORT=${API_PORT}
VIEW_DASHBOARD_URL=${VIEW_DASHBOARD_URL}
VIEW_API_PORT=${VIEW_API_PORT}
ROS_DOMAIN_ID=${ROS_DOMAIN_ID}
EOF
log "READY ${DASHBOARD_URL} (ROS_DOMAIN_ID=${ROS_DOMAIN_ID}); touch ${OUT_DIR}/stop to end"
while [[ ! -f "${OUT_DIR}/stop" ]]; do
  if ! kill -0 "${LAUNCH_PID}" 2>/dev/null; then log "the simulation exited"; exit 1; fi
  sleep 2
done
log "stop requested"
