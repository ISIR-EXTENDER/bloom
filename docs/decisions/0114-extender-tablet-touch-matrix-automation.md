# 0114 - Extender Tablet Touch Matrix Automation

Status: accepted.

## Context

The HMTECH touchscreen used for Extender tests often needs manual X11 repair after reconnect or reboot:

```bash
xinput map-to-output "HID 27c0:0818" HDMI-1
```

During real hardware testing, several XRandR states created confusing touch offsets:

- forcing unsupported wide custom HDMI modes such as `1920x720` can fail with `Configure crtc failed`;
- changing display modes can temporarily leave stale scale/layout state;
- raw `xinput map-to-output` can map to the wrong virtual region after scaling.

The stable lab setup keeps the tablet at its accepted physical mode, `1280x720`, and exposes a wider logical workspace
with `--scale-from 1820x720`.

## Decision

`scripts/extender-tablet-touch-map.sh` now supports the complete tested setup:

- apply the tablet output mode intentionally;
- apply an optional logical tablet workspace through XRandR scaling;
- place the tablet output to the right of the laptop;
- calculate the `Coordinate Transformation Matrix` from active `xrandr` geometry;
- install a desktop autostart entry with the same options.

The current tested command is:

```bash
DISPLAY_MODE=1280x720 LOGICAL_DISPLAY_SIZE=1820x720 APPLY_DISPLAY_MODE=1 PLACE_OUTPUT_RIGHT_OF=eDP-1 ./scripts/extender-tablet-touch-map.sh
```

## Consequences

Touch mapping becomes reproducible without asking operators to remember low-level `xinput` details. The helper remains
X11-specific and should stay documented as Extender lab hardware support, not as a generic Bloom runtime dependency.
