#!/usr/bin/env bash
set -euo pipefail

TOUCH_DEVICE=${TOUCH_DEVICE:-"HID 27c0:0818"}
TOUCH_DEVICE_PATTERN=${TOUCH_DEVICE_PATTERN:-"${TOUCH_DEVICE}"}
DISPLAY_OUTPUT=${DISPLAY_OUTPUT:-"HDMI-1"}
DISPLAY_MODE=${DISPLAY_MODE:-""}
DISPLAY_RATE=${DISPLAY_RATE:-"60.00"}
APPLY_DISPLAY_MODE=${APPLY_DISPLAY_MODE:-"0"}
CREATE_DISPLAY_MODE=${CREATE_DISPLAY_MODE:-"0"}
LOGICAL_DISPLAY_SIZE=${LOGICAL_DISPLAY_SIZE:-""}
PLACE_OUTPUT_LEFT_OF=${PLACE_OUTPUT_LEFT_OF:-""}
PLACE_OUTPUT_RIGHT_OF=${PLACE_OUTPUT_RIGHT_OF:-""}
USE_EXACT_TOUCH_MATRIX=${USE_EXACT_TOUCH_MATRIX:-"1"}
DISPLAY_SETTLE_SECONDS=${DISPLAY_SETTLE_SECONDS:-"0.5"}
WAIT_SECONDS=${WAIT_SECONDS:-"10"}
RETRY_INTERVAL_SECONDS=${RETRY_INTERVAL_SECONDS:-"1"}
DRY_RUN=0
INSTALL_AUTOSTART=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dry-run] [--apply-display-mode] [--install-autostart]

Maps the Extender touchscreen to the target display output.

Environment:
  TOUCH_DEVICE          Exact xinput device name. Default: HID 27c0:0818
  TOUCH_DEVICE_PATTERN  Fallback grep pattern when TOUCH_DEVICE is not found.
  DISPLAY_OUTPUT        xrandr output to map to. Default: HDMI-1
  DISPLAY_MODE          Optional xrandr mode, for example 1920x1080.
  DISPLAY_RATE          Optional xrandr rate. Default: 60.00
  APPLY_DISPLAY_MODE    Set to 1 to apply DISPLAY_MODE before touch mapping.
  CREATE_DISPLAY_MODE   Set to 1 to create DISPLAY_MODE with cvt when missing.
  LOGICAL_DISPLAY_SIZE  Optional scaled logical size, for example 1820x720.
  PLACE_OUTPUT_LEFT_OF  Optional output to place to the right of DISPLAY_OUTPUT.
  PLACE_OUTPUT_RIGHT_OF Optional output to place to the left of DISPLAY_OUTPUT.
  USE_EXACT_TOUCH_MATRIX Set to 1 to calculate the xinput matrix. Default: 1
  DISPLAY_SETTLE_SECONDS Seconds to wait after xrandr changes. Default: 0.5
  WAIT_SECONDS          Seconds to wait for display/input devices. Default: 10
  RETRY_INTERVAL_SECONDS Seconds between device checks. Default: 1

Examples:
  $(basename "$0")
  DISPLAY_MODE=1920x1080 APPLY_DISPLAY_MODE=1 $(basename "$0")
  DISPLAY_MODE=1920x1080 APPLY_DISPLAY_MODE=1 PLACE_OUTPUT_LEFT_OF=eDP-1 $(basename "$0")
  DISPLAY_MODE=1280x720 LOGICAL_DISPLAY_SIZE=1820x720 APPLY_DISPLAY_MODE=1 PLACE_OUTPUT_RIGHT_OF=eDP-1 $(basename "$0")
  $(basename "$0") --install-autostart
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --apply-display-mode)
      APPLY_DISPLAY_MODE=1
      ;;
    --install-autostart)
      INSTALL_AUTOSTART=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

run() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf 'DRY RUN:'
    printf ' %q' "$@"
    printf '\n'
    return
  fi

  "$@"
}

install_autostart() {
  local script_path autostart_dir desktop_file
  script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  autostart_dir="${HOME}/.config/autostart"
  desktop_file="${autostart_dir}/extender-tablet-touch-map.desktop"

  run mkdir -p "${autostart_dir}"
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "DRY RUN: write ${desktop_file}"
    return
  fi

  cat >"${desktop_file}" <<EOF
[Desktop Entry]
Type=Application
Name=Extender tablet touch mapping
Exec=/usr/bin/env DISPLAY_OUTPUT=${DISPLAY_OUTPUT} DISPLAY_MODE=${DISPLAY_MODE} DISPLAY_RATE=${DISPLAY_RATE} APPLY_DISPLAY_MODE=${APPLY_DISPLAY_MODE} CREATE_DISPLAY_MODE=${CREATE_DISPLAY_MODE} LOGICAL_DISPLAY_SIZE=${LOGICAL_DISPLAY_SIZE} PLACE_OUTPUT_LEFT_OF=${PLACE_OUTPUT_LEFT_OF} PLACE_OUTPUT_RIGHT_OF=${PLACE_OUTPUT_RIGHT_OF} USE_EXACT_TOUCH_MATRIX=${USE_EXACT_TOUCH_MATRIX} DISPLAY_SETTLE_SECONDS=${DISPLAY_SETTLE_SECONDS} ${script_path}
X-GNOME-Autostart-enabled=true
EOF

  echo "Installed desktop autostart entry: ${desktop_file}"
}

resolve_display_output() {
  xrandr --query | grep -q "^${DISPLAY_OUTPUT} connected"
}

resolve_touch_device() {
  if xinput list --name-only | grep -Fxq "${TOUCH_DEVICE}"; then
    return 0
  fi

  resolved_touch_device="$(xinput list --name-only | grep -E "${TOUCH_DEVICE_PATTERN}" | head -n 1 || true)"
  if [[ -n "${resolved_touch_device}" ]]; then
    TOUCH_DEVICE="${resolved_touch_device}"
    return 0
  fi

  return 1
}

wait_for_hardware() {
  local deadline
  deadline=$((SECONDS + WAIT_SECONDS))

  while true; do
    if resolve_display_output && resolve_touch_device; then
      return 0
    fi

    if ((SECONDS >= deadline)); then
      return 1
    fi

    sleep "${RETRY_INTERVAL_SECONDS}"
  done
}

read_screen_geometry() {
  xrandr --query | awk '/^Screen 0:/ { gsub(",", "", $10); print $8 "x" $10 }'
}

read_output_geometry_by_name() {
  local output_name="$1"
  xrandr --query | awk -v output="${output_name}" '
    $1 == output && $2 == "connected" {
      for (field_index = 3; field_index <= NF; field_index += 1) {
        if ($field_index ~ /^[0-9]+x[0-9]+\+[0-9-]+\+[0-9-]+$/) {
          print $field_index
          exit
        }
      }
    }
  '
}

read_output_geometry() {
  read_output_geometry_by_name "${DISPLAY_OUTPUT}"
}

geometry_width() {
  local geometry="$1"
  echo "${geometry%%x*}"
}

display_mode_available_for_output() {
  xrandr --query | sed -n "/^${DISPLAY_OUTPUT} connected/,/^[^ ]/p" | grep -q "^[[:space:]]*${DISPLAY_MODE}[[:space:]]"
}

display_mode_available_globally() {
  xrandr --query | grep -q "^[[:space:]]*${DISPLAY_MODE}[[:space:]]"
}

create_display_mode_if_needed() {
  local base_mode width height modeline mode_name mode_values

  if display_mode_available_for_output; then
    return 0
  fi

  if [[ "${CREATE_DISPLAY_MODE}" != "1" ]]; then
    return 1
  fi

  if ! command -v cvt >/dev/null 2>&1; then
    echo "cvt is required to create missing display mode '${DISPLAY_MODE}'." >&2
    exit 1
  fi

  base_mode="${DISPLAY_MODE%%_*}"
  if [[ ! "${base_mode}" =~ ^[0-9]+x[0-9]+$ ]]; then
    echo "DISPLAY_MODE '${DISPLAY_MODE}' cannot be auto-created. Use WIDTHxHEIGHT, for example 1920x720." >&2
    exit 1
  fi

  width="${base_mode%x*}"
  height="${base_mode#*x}"
  modeline="$(cvt "${width}" "${height}" "${DISPLAY_RATE%%.*}" | sed -n 's/^Modeline //p')"
  mode_name="$(awk '{ gsub(/"/, "", $1); print $1 }' <<<"${modeline}")"
  mode_values="${modeline#\"${mode_name}\"}"

  if [[ -z "${modeline}" || -z "${mode_name}" ]]; then
    echo "Could not generate a modeline for '${DISPLAY_MODE}'." >&2
    exit 1
  fi

  DISPLAY_MODE="${mode_name}"

  if ! display_mode_available_globally; then
    # shellcheck disable=SC2086
    run xrandr --newmode "${mode_name}" ${mode_values}
  fi

  if ! display_mode_available_for_output; then
    run xrandr --addmode "${DISPLAY_OUTPUT}" "${DISPLAY_MODE}"
  fi
}

apply_exact_touch_matrix() {
  local screen_geometry output_geometry screen_width screen_height output_width output_height output_x output_y
  local matrix

  screen_geometry="$(read_screen_geometry)"
  output_geometry="$(read_output_geometry)"

  if [[ -z "${screen_geometry}" || -z "${output_geometry}" ]]; then
    echo "Could not read screen/output geometry for exact touch mapping." >&2
    exit 1
  fi

  screen_width="${screen_geometry%%x*}"
  screen_height="${screen_geometry##*x}"
  output_width="${output_geometry%%x*}"
  output_geometry="${output_geometry#*x}"
  output_height="${output_geometry%%+*}"
  output_geometry="${output_geometry#*+}"
  output_x="${output_geometry%%+*}"
  output_y="${output_geometry##*+}"

  matrix="$(
    awk \
      -v output_width="${output_width}" \
      -v screen_width="${screen_width}" \
      -v output_x="${output_x}" \
      -v output_height="${output_height}" \
      -v screen_height="${screen_height}" \
      -v output_y="${output_y}" \
      'BEGIN {
        printf "%.8f 0 %.8f 0 %.8f %.8f 0 0 1",
          output_width / screen_width,
          output_x / screen_width,
          output_height / screen_height,
          output_y / screen_height
      }'
  )"

  # shellcheck disable=SC2086
  run xinput set-prop "${TOUCH_DEVICE}" "Coordinate Transformation Matrix" ${matrix}
}

if ! command -v xrandr >/dev/null 2>&1; then
  echo "xrandr is required to inspect display outputs." >&2
  exit 1
fi

if ! command -v xinput >/dev/null 2>&1; then
  echo "xinput is required to map the touchscreen to an output." >&2
  exit 1
fi

if ! wait_for_hardware; then
  echo "Display output '${DISPLAY_OUTPUT}' is not connected." >&2
  echo "Available outputs:" >&2
  xrandr --query | sed -n 's/^\([^ ]*\) connected.*/  - \1/p' >&2
  echo "Touch device '${TOUCH_DEVICE}' was not found." >&2
  echo "Fallback pattern '${TOUCH_DEVICE_PATTERN}' did not match any input device." >&2
  echo "Available input devices:" >&2
  xinput list --name-only | sed 's/^/  - /' >&2
  exit 1
fi

if [[ "${APPLY_DISPLAY_MODE}" == "1" ]]; then
  if [[ -z "${DISPLAY_MODE}" ]]; then
    echo "DISPLAY_MODE is required when APPLY_DISPLAY_MODE=1 or --apply-display-mode is used." >&2
    exit 1
  fi

  if [[ -n "${PLACE_OUTPUT_LEFT_OF}" && -n "${PLACE_OUTPUT_RIGHT_OF}" ]]; then
    echo "Use either PLACE_OUTPUT_LEFT_OF or PLACE_OUTPUT_RIGHT_OF, not both." >&2
    exit 1
  fi

  if ! create_display_mode_if_needed; then
    echo "Display mode '${DISPLAY_MODE}' is not available on '${DISPLAY_OUTPUT}'." >&2
    echo "Set CREATE_DISPLAY_MODE=1 to create custom modes such as 1920x720." >&2
    echo "Available modes:" >&2
    xrandr --query | sed -n "/^${DISPLAY_OUTPUT} connected/,/^[^ ]/p" >&2
    exit 1
  fi

  if [[ -n "${LOGICAL_DISPLAY_SIZE}" ]]; then
    run xrandr --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE}" --rate "${DISPLAY_RATE}" --scale-from "${LOGICAL_DISPLAY_SIZE}"
  else
    run xrandr --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE}" --rate "${DISPLAY_RATE}" --scale 1x1
  fi

  if [[ -n "${PLACE_OUTPUT_LEFT_OF}" ]]; then
    if ! xrandr --query | grep -q "^${PLACE_OUTPUT_LEFT_OF} connected"; then
      echo "Output '${PLACE_OUTPUT_LEFT_OF}' is not connected." >&2
      exit 1
    fi

    if [[ -n "${LOGICAL_DISPLAY_SIZE}" ]]; then
      run xrandr \
        --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE}" --rate "${DISPLAY_RATE}" --scale-from "${LOGICAL_DISPLAY_SIZE}" --pos 0x0 \
        --output "${PLACE_OUTPUT_LEFT_OF}" --auto --pos "$(geometry_width "${LOGICAL_DISPLAY_SIZE}")x0"
    else
      run xrandr \
        --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE}" --rate "${DISPLAY_RATE}" --scale 1x1 --pos 0x0 \
        --output "${PLACE_OUTPUT_LEFT_OF}" --auto --pos "$(geometry_width "${DISPLAY_MODE}")x0"
    fi
  fi

  if [[ -n "${PLACE_OUTPUT_RIGHT_OF}" ]]; then
    if ! xrandr --query | grep -q "^${PLACE_OUTPUT_RIGHT_OF} connected"; then
      echo "Output '${PLACE_OUTPUT_RIGHT_OF}' is not connected." >&2
      exit 1
    fi

    left_output_geometry="$(read_output_geometry_by_name "${PLACE_OUTPUT_RIGHT_OF}")"
    if [[ -z "${left_output_geometry}" ]]; then
      echo "Could not read geometry for '${PLACE_OUTPUT_RIGHT_OF}'." >&2
      exit 1
    fi

    if [[ -n "${LOGICAL_DISPLAY_SIZE}" ]]; then
      run xrandr \
        --output "${PLACE_OUTPUT_RIGHT_OF}" --auto --pos 0x0 \
        --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE}" --rate "${DISPLAY_RATE}" --scale-from "${LOGICAL_DISPLAY_SIZE}" --pos "$(geometry_width "${left_output_geometry}")x0"
    else
      run xrandr \
        --output "${PLACE_OUTPUT_RIGHT_OF}" --auto --pos 0x0 \
        --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE}" --rate "${DISPLAY_RATE}" --scale 1x1 --pos "$(geometry_width "${left_output_geometry}")x0"
    fi
  fi

  if [[ "${DISPLAY_SETTLE_SECONDS}" != "0" ]]; then
    run sleep "${DISPLAY_SETTLE_SECONDS}"
  fi
fi

if [[ "${USE_EXACT_TOUCH_MATRIX}" == "1" ]]; then
  apply_exact_touch_matrix
else
  run xinput map-to-output "${TOUCH_DEVICE}" "${DISPLAY_OUTPUT}"
fi

if [[ "${INSTALL_AUTOSTART}" == "1" ]]; then
  install_autostart
fi

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "Touchscreen '${TOUCH_DEVICE}' would be mapped to '${DISPLAY_OUTPUT}'."
else
  echo "Mapped touchscreen '${TOUCH_DEVICE}' to '${DISPLAY_OUTPUT}'."
fi
