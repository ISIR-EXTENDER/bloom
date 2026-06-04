#!/usr/bin/env bash
set -euo pipefail

TOUCH_DEVICE=${TOUCH_DEVICE:-"HID 27c0:0818"}
DISPLAY_OUTPUT=${DISPLAY_OUTPUT:-"HDMI-1"}

if ! command -v xrandr >/dev/null 2>&1; then
  echo "xrandr is required to inspect display outputs." >&2
  exit 1
fi

if ! command -v xinput >/dev/null 2>&1; then
  echo "xinput is required to map the touchscreen to an output." >&2
  exit 1
fi

if ! xrandr --query | grep -q "^${DISPLAY_OUTPUT} connected"; then
  echo "Display output '${DISPLAY_OUTPUT}' is not connected." >&2
  echo "Available outputs:" >&2
  xrandr --query | sed -n 's/^\([^ ]*\) connected.*/  - \1/p' >&2
  exit 1
fi

if ! xinput list --name-only | grep -Fxq "${TOUCH_DEVICE}"; then
  echo "Touch device '${TOUCH_DEVICE}' was not found." >&2
  echo "Available input devices:" >&2
  xinput list --name-only | sed 's/^/  - /' >&2
  exit 1
fi

xinput map-to-output "${TOUCH_DEVICE}" "${DISPLAY_OUTPUT}"
echo "Mapped touchscreen '${TOUCH_DEVICE}' to '${DISPLAY_OUTPUT}'."
