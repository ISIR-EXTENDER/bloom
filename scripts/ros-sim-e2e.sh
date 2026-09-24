#!/usr/bin/env bash
# shellcheck disable=SC2329 # functions reached through trap and wait_for
set -euo pipefail

usage() {
  cat <<'EOF'
Drive Bloom end to end against a simulated Explorer or Kinova gen3.

  scripts/ros-sim-e2e.sh --robot explorer|kinova [--scenario manager|visual-servoing] [--out dir] [--reuse-stack]

Without --reuse-stack the script starts the cartesian_manager simulation on an isolated ROS domain, an API on a
throwaway SQLite store and a dashboard on free ports, runs scripts/ros-sim-e2e-checks.mjs and tears everything down.
With --reuse-stack it starts nothing and drives the dashboard at BLOOM_DASHBOARD_URL on the current ROS_DOMAIN_ID.

Environment:
  EXTENDER_WORKSPACE          extender_workspace root (default: ../extender_workspace)
  EXTENDER_SETUP_FILE         ROS setup file (default: $EXTENDER_WORKSPACE/install/setup.bash)
  BLOOM_E2E_EXTRA_PREFIX      extra ament prefixes, colon separated, prepended after sourcing
  BLOOM_E2E_ROS_DOMAIN_ID     ROS domain for a started stack (default: 42)
  BLOOM_E2E_API_PORT          API port for a started stack (default: a free port)
  BLOOM_E2E_DASHBOARD_PORT    dashboard port for a started stack (default: a free port)
  BLOOM_E2E_STARTUP_TIMEOUT   seconds to wait for each process (default: 120)
  BLOOM_DASHBOARD_URL         dashboard to drive with --reuse-stack (default: http://127.0.0.1:5173)
EOF
}

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
EXTENDER_WORKSPACE=${EXTENDER_WORKSPACE:-"$(cd "${BLOOM_ROOT}/.." && pwd)/extender_workspace"}
EXTENDER_SETUP_FILE=${EXTENDER_SETUP_FILE:-"${EXTENDER_WORKSPACE}/install/setup.bash"}
STARTUP_TIMEOUT=${BLOOM_E2E_STARTUP_TIMEOUT:-120}

ROBOT=""
SCENARIO="manager"
OUT_DIR=""
REUSE_STACK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --robot)
      ROBOT="${2:-}"
      shift 2
      ;;
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
    --out)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --reuse-stack)
      REUSE_STACK=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "${ROBOT}" in
  explorer)
    ROBOT_NAME="Explorer"
    # cartesian_manager d9a1fa5 moved Explorer's ee_frame from ft_frame to effector_frame, so both
    # arms now name their tool frame the same way. A frame the manager does not know is skipped
    # silently, which looks exactly like a broken web stack.
    EE_FRAME_ID="effector_frame"
    ;;
  kinova)
    ROBOT_NAME="Kinova"
    EE_FRAME_ID="effector_frame"
    ;;
  *)
    echo "--robot must be explorer or kinova" >&2
    exit 2
    ;;
esac

OUT_DIR=${OUT_DIR:-"${TMPDIR:-/tmp}/bloom-ros-sim-e2e-${ROBOT}-$(date +%Y%m%d-%H%M%S)"}
mkdir -p "${OUT_DIR}"
OUT_DIR=$(cd "${OUT_DIR}" && pwd)
LOG_DIR="${OUT_DIR}/logs"
mkdir -p "${LOG_DIR}"

LAUNCH_PID=""
BRIDGE_PID=""
API_PID=""
VS_PID=""
DASHBOARD_PID=""

log() {
  printf '[ros-sim-e2e] %s\n' "$*"
}

stop_group() {
  local pid="$1" name="$2"
  if [[ -z "${pid}" ]] || ! kill -0 -- "-${pid}" 2>/dev/null; then
    return
  fi
  log "stopping ${name}"
  kill -INT -- "-${pid}" 2>/dev/null || true
  for _ in $(seq 1 50); do
    kill -0 -- "-${pid}" 2>/dev/null || return 0
    sleep 0.2
  done
  kill -KILL -- "-${pid}" 2>/dev/null || true
}

cleanup() {
  # Every process was started in its own group, so a group kill reaches npm's Vite and the launch's Gazebo too.
  stop_group "${DASHBOARD_PID}" dashboard
  stop_group "${API_PID}" api
  stop_group "${VS_PID}" "visual servoing"
  stop_group "${BRIDGE_PID}" "clock bridge"
  stop_group "${LAUNCH_PID}" simulation
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

source_ros() {
  if [[ ! -f "${EXTENDER_SETUP_FILE}" ]]; then
    echo "Extender setup file not found: ${EXTENDER_SETUP_FILE}" >&2
    exit 1
  fi
  # ROS/colcon setup hooks are not guaranteed to be nounset-safe.
  set +u
  # shellcheck source=/dev/null
  source "${EXTENDER_SETUP_FILE}"
  if [[ -n "${BLOOM_E2E_EXTRA_PREFIX:-}" ]]; then
    local prefix
    local -a prefixes
    IFS=: read -r -a prefixes <<<"${BLOOM_E2E_EXTRA_PREFIX}"
    for prefix in "${prefixes[@]}"; do
      export AMENT_PREFIX_PATH="${prefix}:${AMENT_PREFIX_PATH}"
      export LD_LIBRARY_PATH="${prefix}/lib:${LD_LIBRARY_PATH:-}"
    done
  fi
  set -u
}

# Upstream spawns qontrol and forward_position_controller for the same joints, and whichever wins the race keeps
# them. When the wrong one wins, qontrol stays inactive and publishes no pose, so hand the interfaces over.
claim_joint_interfaces_for_qontrol() {
  # Both launches name it qontrol_explorer, Kinova included.
  local controller="qontrol_explorer"
  if ros2 control list_controllers 2>/dev/null | grep -qE "^${controller}\s+\S+\s+active"; then
    return 0
  fi
  log "qontrol is not active; taking the joint interfaces from forward_position_controller"
  ros2 control set_controller_state forward_position_controller inactive >/dev/null 2>&1 || true
  ros2 control set_controller_state "${controller}" active >/dev/null 2>&1 || true
}

free_port() {
  node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

wait_for() {
  local description="$1" timeout="$2"
  shift 2
  local deadline=$((SECONDS + timeout))
  until "$@" >/dev/null 2>&1; do
    if [[ -n "${LAUNCH_PID}" ]] && ! kill -0 "${LAUNCH_PID}" 2>/dev/null; then
      echo "The simulation launch exited while waiting for ${description}; see ${LOG_DIR}/launch.log." >&2
      return 1
    fi
    if ((SECONDS >= deadline)); then
      echo "Timed out after ${timeout}s waiting for ${description}." >&2
      return 1
    fi
    sleep 1
  done
}

log_has() {
  grep -aqE "$2" "$1"
}

topic_has_sample() {
  timeout 5 ros2 topic echo --once "$1" >/dev/null
}

http_ok() {
  curl -fsS -o /dev/null "$1"
}

source_ros
cd "${BLOOM_ROOT}"

if [[ "${REUSE_STACK}" == "1" ]]; then
  DASHBOARD_URL=${BLOOM_DASHBOARD_URL:-"http://127.0.0.1:5173"}
  log "reusing the stack at ${DASHBOARD_URL} on ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}"
  wait_for "the dashboard" 10 http_ok "${DASHBOARD_URL}"
  wait_for "the API behind the dashboard" 10 http_ok "${DASHBOARD_URL}/api/v1/health"
  wait_for "/ee_pose" 20 topic_has_sample /ee_pose
else
  export ROS_DOMAIN_ID=${BLOOM_E2E_ROS_DOMAIN_ID:-42}
  # Gazebo transport ignores ROS_DOMAIN_ID, so a second Explorer simulation would share the first one's world.
  if [[ "${ROBOT}" == "explorer" ]] && pgrep -f "[g]z sim" >/dev/null; then
    echo "A Gazebo simulation is already running. Stop it, or drive that stack with --reuse-stack." >&2
    exit 1
  fi
  if ros2 node list --no-daemon 2>/dev/null | grep -qx "/cartesian_manager"; then
    echo "A cartesian_manager already runs on ROS_DOMAIN_ID=${ROS_DOMAIN_ID}; pick another BLOOM_E2E_ROS_DOMAIN_ID." >&2
    exit 1
  fi
  if [[ "${SCENARIO}" == "visual-servoing" && "${ROBOT}" != "kinova" ]]; then
    # The servoing node names the gen3's frames in code; the Explorer waits for the node change
    # Robin will review (ssrpo/input_interfaces, feat/visual-servoing-frames).
    echo "--scenario visual-servoing runs on kinova today: the visual_servoing node names the gen3's frames." >&2
    exit 1
  fi
  if [[ "${ROBOT}" == "kinova" ]] && ! ros2 pkg prefix kortex_description >/dev/null 2>&1; then
    echo "kortex_description is not on AMENT_PREFIX_PATH. See docs/validation/ros-sim-e2e.md > Prerequisites." >&2
    exit 1
  fi

  API_PORT=${BLOOM_E2E_API_PORT:-$(free_port)}
  DASHBOARD_PORT=${BLOOM_E2E_DASHBOARD_PORT:-$(free_port)}
  DASHBOARD_URL="http://127.0.0.1:${DASHBOARD_PORT}"
  LAUNCH_LOG="${LOG_DIR}/launch.log"

  # Job control gives each background process its own process group.
  set -m

  log "launching the ${ROBOT} simulation on ROS_DOMAIN_ID=${ROS_DOMAIN_ID}"
  ros2 launch cartesian_manager "${ROBOT}.launch.py" use_simulation:=true gui:=false >"${LAUNCH_LOG}" 2>&1 &
  LAUNCH_PID=$!

  if [[ "${ROBOT}" == "explorer" ]]; then
    # Upstream: the standalone ros2_control_node cannot load GazeboSimSystem and waits forever, and the robot only
    # spawns once it exits. Nothing bridges the Gazebo clock either, so qontrol never publishes under sim time.
    wait_for "the stuck ros2_control_node" "${STARTUP_TIMEOUT}" \
      log_has "${LAUNCH_LOG}" "Waiting for data on 'robot_description'"
    log "working around the stuck ros2_control_node"
    pkill -g "${LAUNCH_PID}" -f "[r]os2_control_node" || true
    log "bridging the Gazebo clock"
    ros2 run ros_gz_bridge parameter_bridge "/clock@rosgraph_msgs/msg/Clock[gz.msgs.Clock" >"${LOG_DIR}/clock-bridge.log" 2>&1 &
    BRIDGE_PID=$!
  fi

  wait_for "the gripper controller" "${STARTUP_TIMEOUT}" log_has "${LAUNCH_LOG}" "activated.*gripper_controller"
  claim_joint_interfaces_for_qontrol
  wait_for "qontrol to publish /ee_pose" "${STARTUP_TIMEOUT}" topic_has_sample /ee_pose
  log "simulation ready"

  if [[ "${SCENARIO}" == "visual-servoing" ]]; then
    # Robin's node, unchanged, with its saved tag goals copied where a Save may rewrite them.
    VS_SHARE="$(ros2 pkg prefix visual_servoing)/share/visual_servoing/config"
    cp "${VS_SHARE}/saved_tag_goals.yaml" "${OUT_DIR}/saved_tag_goals.yaml"
    log "starting the visual servoing node"
    ros2 run visual_servoing visual_servoing --ros-args -p lambda:=0.4 \
      -p "yaml_path:=${OUT_DIR}/saved_tag_goals.yaml" \
      -p "yaml_path_transform_EEtoCAM:=${VS_SHARE}/handeye_tf_kinovaCam.yaml" \
      >"${LOG_DIR}/visual-servoing.log" 2>&1 &
    VS_PID=$!
  fi

  log "starting the API on port ${API_PORT}"
  (
    cd "${BLOOM_ROOT}/backend"
    BLOOM_CONFIGURATION_DATABASE_PATH="${OUT_DIR}/bloom.db" \
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

  wait_for "the API" "${STARTUP_TIMEOUT}" http_ok "http://127.0.0.1:${API_PORT}/api/v1/health"
  wait_for "the dashboard" "${STARTUP_TIMEOUT}" http_ok "${DASHBOARD_URL}"
  set +m
fi

log "running checks against ${DASHBOARD_URL}; results in ${OUT_DIR}"
status=0
CHECKS="ros-sim-e2e-checks.mjs"
[[ "${SCENARIO}" == "visual-servoing" ]] && CHECKS="ros-sim-e2e-visual-servoing-checks.mjs"
BLOOM_DASHBOARD_URL="${DASHBOARD_URL}" node "${BLOOM_ROOT}/scripts/${CHECKS}" \
  --robot "${ROBOT}" --out "${OUT_DIR}" || status=$?
exit "${status}"
