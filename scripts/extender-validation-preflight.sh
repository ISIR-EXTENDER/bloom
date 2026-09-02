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

seed_shared_applications() {
  local force_args=()
  if [[ "${BLOOM_REFRESH_VALIDATION_CONFIGS}" == "1" ]]; then
    while IFS= read -r seed_file; do
      force_args+=(--force "$(basename "${seed_file}" .json)")
    done < <(find "${BLOOM_ROOT}/backend/seed/applications" -name '*.json')
  fi

  # This runner asserts against the JSON files themselves, so it pins file
  # storage rather than following the API default.
  (cd "${BLOOM_ROOT}/backend" && uv run python -m apps.bloom_cli.main config seed \
    --storage file --configuration-dir "${BLOOM_CONFIGURATION_DIR}" "${force_args[@]}")
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

assert_widget_setting() {
  local config_id="$1"
  local expected_app_id="$2"
  local expected_screen_id="$3"
  local expected_widget_id="$4"
  local expected_setting_path="$5"
  local expected_json_value="$6"
  local config_path="${BLOOM_CONFIGURATION_DIR}/${config_id}.json"

  node -e '
const { readFileSync } = require("node:fs");
const [path, expectedAppId, expectedScreenId, expectedWidgetId, expectedSettingPath, expectedJsonValue] =
  process.argv.slice(1);
const bundle = JSON.parse(readFileSync(path, "utf8"));
const expected = JSON.parse(expectedJsonValue);
const app = bundle.applications?.find((candidate) => candidate.id === expectedAppId);
const screen = app?.screens?.find((candidate) => candidate.id === expectedScreenId);
const widget = screen?.widgets?.find((candidate) => candidate.id === expectedWidgetId);
if (!widget) {
  throw new Error(`${path} does not include widget ${expectedAppId}/${expectedScreenId}/${expectedWidgetId}`);
}
const actual = expectedSettingPath.split(".").reduce((value, key) => value?.[key], widget.settings);
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(
    `${path} expected ${expectedWidgetId}.settings.${expectedSettingPath}=${expectedJsonValue}, got ${JSON.stringify(actual)}`,
  );
}
' "${config_path}" "${expected_app_id}" "${expected_screen_id}" "${expected_widget_id}" "${expected_setting_path}" "${expected_json_value}"
  echo "ok: ${config_id} ${expected_widget_id}.settings.${expected_setting_path}=${expected_json_value}"
}

# The API seeds these itself on startup. This keeps the runner usable against a
# configuration directory that has never had a backend pointed at it, and it
# covers every shipped app rather than the three this script used to copy.
seed_shared_applications

assert_configuration "sandbox" "sandbox" "sandbox_control"
assert_configuration "sandbox" "sandbox" "visual_servoing_monitor"
assert_widget_setting "sandbox" "sandbox" "snake_control" "snake-mode-toggle" "initialValue" "false"
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
  ros2 topic echo /joystick_cartesian_command
  ros2 topic echo /cmd/mode
  ros2 topic echo /snake_control/enable
  ros2 topic echo /ui/visual_servoing/on
  ros2 topic echo /visual_servoing/velocity_command
  ros2 topic echo /visual_servoing/error_TAGtoTAGd
  ros2 topic echo /cartesian_command
  curl http://${BLOOM_API_HOST}:${BLOOM_API_PORT}/api/v1/ros/topics/status
EOF
