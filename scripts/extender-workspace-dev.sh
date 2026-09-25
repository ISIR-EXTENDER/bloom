#!/usr/bin/env bash
set -euo pipefail

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
# Bloom sits beside the ROS workspace on some machines and inside its `src/` on others, so the workspace is
# found rather than assumed: the sibling first, then the nearest ancestor that has been built.
find_extender_workspace() {
  local sibling="$(dirname "${BLOOM_ROOT}")/extender_workspace"
  if [[ -f "${sibling}/install/setup.bash" ]]; then
    printf '%s\n' "${sibling}"
    return 0
  fi
  local candidate="${BLOOM_ROOT}"
  while [[ "${candidate}" != "/" ]]; do
    if [[ -f "${candidate}/install/setup.bash" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
    candidate="$(dirname "${candidate}")"
  done
  printf '%s\n' "${sibling}"
}

EXTENDER_WORKSPACE=${EXTENDER_WORKSPACE:-"$(find_extender_workspace)"}
EXTENDER_SETUP_FILE=${EXTENDER_SETUP_FILE:-"${EXTENDER_WORKSPACE}/install/setup.bash"}
BLOOM_API_HOST=${BLOOM_API_HOST:-"127.0.0.1"}
BLOOM_API_PORT=${BLOOM_API_PORT:-"8000"}
BLOOM_FRONTEND_HOST=${BLOOM_FRONTEND_HOST:-"127.0.0.1"}
BLOOM_FRONTEND_PORT=${BLOOM_FRONTEND_PORT:-"5173"}
BLOOM_API_PROXY_TARGET=${BLOOM_API_PROXY_TARGET:-"http://127.0.0.1:${BLOOM_API_PORT}"}
BLOOM_PUBLIC_HOST=${BLOOM_PUBLIC_HOST:-""}
# auto maps the tablet's touch when it is plugged in; 1 always tries, 0 never does.
BLOOM_APPLY_TABLET_TOUCH_MAP=${BLOOM_APPLY_TABLET_TOUCH_MAP:-"auto"}
# auto picks the robot's camera through camera_interface; none skips it; or name a driver: usb_cam, camera_ros, kinova_vision.
BLOOM_CAMERA=${BLOOM_CAMERA:-"auto"}
BLOOM_CAMERA_TOPIC="/camera/color/image_raw/compressed"
BLOOM_CAMERA_LOG=${BLOOM_CAMERA_LOG:-"${BLOOM_ROOT}/backend/data/camera.log"}

API_PID=""
FRONTEND_PID=""
CAMERA_PID=""

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

  if [[ -n "${CAMERA_PID}" ]]; then
    kill -INT -- "-${CAMERA_PID}" 2>/dev/null || true
  fi
}

# The robot's camera on the topic Bloom's camera widgets read. A missing camera never stops Bloom.
start_camera() {
  [[ "${BLOOM_CAMERA}" == "none" ]] && return 0
  if ! ros2 pkg prefix camera_interface >/dev/null 2>&1; then
    echo "Camera: camera_interface is not built in ${EXTENDER_WORKSPACE}; skipping it."
    return 0
  fi
  if ros2 topic list --no-daemon 2>/dev/null | grep -qx "${BLOOM_CAMERA_TOPIC}"; then
    echo "Camera: ${BLOOM_CAMERA_TOPIC} is already published; not starting another."
    return 0
  fi

  local config driver="${BLOOM_CAMERA}" params=""
  config="$(ros2 pkg prefix camera_interface)/share/camera_interface/config"
  if [[ "${driver}" == "auto" ]]; then
    case "${BLOOM_ROBOT_NAME:-}" in
      [Kk]inova) driver="kinova_vision" ;;
      [Ee]xplorer) driver="usb_cam" params="${config}/explorer_camera.yaml" ;;
      *) driver="usb_cam" params="${config}/usb_camera.yaml" ;;
    esac
  elif [[ "${driver}" == "usb_cam" ]]; then
    params="${config}/usb_camera.yaml"
  fi

  if [[ -n "${params}" ]]; then
    local device
    device="$(awk '/video_device:/ { print $2 }' "${params}")"
    if [[ -n "${device}" && ! -e "${device}" ]]; then
      echo "Camera: ${device} is not plugged in; using the first webcam instead."
      params="${config}/usb_camera.yaml"
      device="$(awk '/video_device:/ { print $2 }' "${params}")"
      if [[ ! -e "${device}" ]]; then
        echo "Camera: no webcam at ${device}; skipping it."
        return 0
      fi
    fi
  fi
  if [[ "${driver}" == "kinova_vision" ]] && ! ros2 pkg prefix kinova_vision >/dev/null 2>&1; then
    echo "Camera: kinova_vision is not built in this workspace; skipping the Kinova camera."
    return 0
  fi

  mkdir -p "$(dirname "${BLOOM_CAMERA_LOG}")"
  echo "Starting the camera (${driver}) on ${BLOOM_CAMERA_TOPIC}, log in ${BLOOM_CAMERA_LOG}..."
  ros2 launch camera_interface camera.launch.py "driver:=${driver}" ${params:+"params_file:=${params}"} \
    >"${BLOOM_CAMERA_LOG}" 2>&1 &
  CAMERA_PID="$!"
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
  echo "Looked beside Bloom and up from ${BLOOM_ROOT} for a workspace with install/setup.bash." >&2
  echo "Build the ROS workspace first, or set EXTENDER_WORKSPACE to its root." >&2
  exit 1
fi

tablet_plugged_in() {
  command -v lsusb >/dev/null 2>&1 && lsusb -d "${TOUCH_USB_ID:-27c0:0818}" >/dev/null 2>&1
}
if [[ "${BLOOM_APPLY_TABLET_TOUCH_MAP}" == "1" ]] || { [[ "${BLOOM_APPLY_TABLET_TOUCH_MAP}" == "auto" ]] && tablet_plugged_in; }; then
  "${BLOOM_ROOT}/scripts/extender-tablet-touch-map.sh" ||
    echo "Tablet touch mapping failed; run scripts/extender-tablet-touch-map.sh --diagnose." >&2
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

source_extender_workspace
start_camera

echo "Starting Bloom API with ROS adapters..."
(
  cd "${BLOOM_ROOT}/backend"
  source_extender_workspace
  uv run python -m apps.bloom_cli.main api run-ros --host "${BLOOM_API_HOST}" --port "${BLOOM_API_PORT}"
) &
API_PID="$!"

# A pull that adds a dependency leaves node_modules behind, and Vite then reports it as unresolved code.
node "${BLOOM_ROOT}/scripts/install-if-stale.mjs"

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

Camera:   ${BLOOM_CAMERA_TOPIC} (${BLOOM_CAMERA}; BLOOM_CAMERA=none to skip)

Press Ctrl+C to stop everything.
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
