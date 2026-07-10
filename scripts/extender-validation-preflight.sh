#!/usr/bin/env bash
set -euo pipefail

BLOOM_ROOT=${BLOOM_ROOT:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}
BLOOM_CONFIGURATION_DIR=${BLOOM_CONFIGURATION_DIR:-"${BLOOM_ROOT}/backend/data/configurations"}
EXTENDER_WORKSPACE=${EXTENDER_WORKSPACE:-"/home/susana/workspace/extender/extender_workspace"}
EXTENDER_SETUP_FILE=${EXTENDER_SETUP_FILE:-"${EXTENDER_WORKSPACE}/install/setup.bash"}
BLOOM_API_HOST=${BLOOM_API_HOST:-"127.0.0.1"}
BLOOM_API_PORT=${BLOOM_API_PORT:-"8000"}
BLOOM_FRONTEND_HOST=${BLOOM_FRONTEND_HOST:-"127.0.0.1"}
BLOOM_FRONTEND_PORT=${BLOOM_FRONTEND_PORT:-"5173"}
BLOOM_REFRESH_VALIDATION_CONFIGS=${BLOOM_REFRESH_VALIDATION_CONFIGS:-"0"}

copy_fixture() {
  local config_id="$1"
  local fixture_path="$2"
  local destination_path="${BLOOM_CONFIGURATION_DIR}/${config_id}.json"

  if [[ -f "${destination_path}" && "${BLOOM_REFRESH_VALIDATION_CONFIGS}" != "1" ]]; then
    echo "ok: ${config_id} already exists at ${destination_path}"
    return
  fi

  mkdir -p "${BLOOM_CONFIGURATION_DIR}"
  cp "${fixture_path}" "${destination_path}"
  echo "seeded: ${config_id} -> ${destination_path}"
}

assert_configuration() {
  local config_id="$1"
  local expected_app_id="$2"
  local expected_screen_id="$3"
  local config_path="${BLOOM_CONFIGURATION_DIR}/${config_id}.json"

  node -e '
const { readFileSync } = require("node:fs");
const [path, expectedAppId, expectedScreenId] = process.argv.slice(1);
const bundle = JSON.parse(readFileSync(path, "utf8"));
const app = bundle.applications?.find((candidate) => candidate.id === expectedAppId);
if (!app) {
  throw new Error(`${path} does not include application ${expectedAppId}`);
}
const screen = app.screens?.find((candidate) => candidate.id === expectedScreenId);
if (!screen) {
  throw new Error(`${path} does not include screen ${expectedScreenId}`);
}
' "${config_path}" "${expected_app_id}" "${expected_screen_id}"
  echo "ok: ${config_id} includes ${expected_app_id}/${expected_screen_id}"
}

copy_fixture "sandbox" "${BLOOM_ROOT}/tests/fixtures/sandbox-v0-configuration-bundle.json"
copy_fixture "bloom-debug" "${BLOOM_ROOT}/tests/fixtures/bloom-debug-configuration.json"
copy_fixture "petanque-admin" "${BLOOM_ROOT}/tests/fixtures/petanque-admin-configuration-bundle.json"

assert_configuration "sandbox" "sandbox" "sandbox_control"
assert_configuration "sandbox" "sandbox" "visual_servoing_monitor"
assert_configuration "bloom-debug" "bloom-debug" "runtime-topic-monitor"
assert_configuration "petanque-admin" "app-petanque-admin" "default_live_teleop"

if [[ -f "${EXTENDER_SETUP_FILE}" ]]; then
  echo "ok: Extender setup file found at ${EXTENDER_SETUP_FILE}"
else
  echo "warn: Extender setup file not found at ${EXTENDER_SETUP_FILE}"
  echo "      Build the ROS workspace before the live robot/simulation pass, or set EXTENDER_SETUP_FILE."
fi

cat <<EOF

Extender validation preflight is ready.

Configuration dir:
  ${BLOOM_CONFIGURATION_DIR}

Browser-only smoke:
  npm run visual:smoke

Live ROS/simulation lab:
  export BLOOM_CONFIGURATION_DIR="${BLOOM_CONFIGURATION_DIR}"
  scripts/extender-workspace-dev.sh

Then open:
  http://${BLOOM_FRONTEND_HOST}:${BLOOM_FRONTEND_PORT}/#/runtime

Validate from the runtime library:
  - Launch Sandbox V0.0 runtime
  - Launch Bloom Debug runtime
  - Launch Petanque admin runtime when the Petanque stack is available

Useful ROS checks:
  ros2 topic echo /teleop_cmd
  ros2 topic echo /snake_control/enable
  ros2 topic echo /visual_servoing/velocity_command
  ros2 topic echo /sandbox_controller/velocity_command
  curl http://${BLOOM_API_HOST}:${BLOOM_API_PORT}/api/v1/ros/topics/status
EOF
