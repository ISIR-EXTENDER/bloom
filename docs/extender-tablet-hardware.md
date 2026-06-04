# Extender Tablet Hardware Target

This document captures the current touchscreen target used for Extender tests. Keep it updated when the lab changes the
tablet, Linux display configuration, or touch mapping workflow.

## Current Touchscreen

| Field | Value |
| --- | --- |
| Name | HMTECH Raspberry Pi Touch Screen Monitor |
| Price reference | 63.99 EUR on 2026-05-06 |
| Panel resolution | 1024x600 |
| Image format | 16:9 |
| Size | 10.1 inches |
| Refresh rate | 60 Hz |
| Power consumption | 10 W |
| Connectors | HDMI + micro-USB |
| Touch | Multitouch |
| Purchase link | <https://www.amazon.fr/gp/product/B098762GVK/ref=ox_sc_act_title_3?smid=A2P7XMHXRVMQHR&th=1> |
| Box contents | 1 touchscreen, 1 HDMI cable, 1 micro-USB cable, 1 stand, 6 screws |

## Current Linux Display Setup

Although the physical panel is documented as `1024x600`, the current Linux display configuration applies `1920x1080`.
Bloom must therefore be tested on both:

- `1024x600`: native panel constraint and worst-case UI density.
- `1920x1080`: current configured output used during Extender tests.

Useful inspection commands:

```bash
xrandr --query
xinput list
```

Current touch mapping command:

```bash
xinput map-to-output "HID 27c0:0818" HDMI-1
```

## Symptoms To Watch

- Pointer and touch positions feel offset from visual controls.
- Touch events are mapped to the wrong monitor/output after boot or reconnect.
- Large runtime screens fit visually but touch targets feel too small on the physical tablet.
- Browser zoom or desktop scaling changes the effective target size.

## Manual Calibration Checklist

1. Connect HDMI and micro-USB touch cable.
2. Run `xrandr --query` and confirm the active output name, currently `HDMI-1`.
3. Run `xinput list` and confirm the touchscreen device name, currently `HID 27c0:0818`.
4. Apply the mapping:

   ```bash
   xinput map-to-output "HID 27c0:0818" HDMI-1
   ```

5. Open Bloom runtime and verify a joystick knob, slider thumb, and navigation button under touch.

## Automation Options

Start with the smallest reliable automation. The command depends on X11 `xinput`, so it should run after the graphical
session starts, not during early boot.

### Option A - Local Script

Bloom keeps a versioned helper script at `scripts/extender-tablet-touch-map.sh`. You can either run it from the repo or
copy it to `~/bin/extender-tablet-touch-map.sh` on the tablet:

```bash
./scripts/extender-tablet-touch-map.sh
```

Override names if Linux reports a different device or output:

```bash
TOUCH_DEVICE="HID 27c0:0818" DISPLAY_OUTPUT="HDMI-1" ./scripts/extender-tablet-touch-map.sh
```

### Option B - Desktop Autostart

If the tablet uses a desktop session, add `~/.config/autostart/extender-tablet-touch-map.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Extender tablet touch mapping
Exec=/home/susana/workspace/extender/bloom/scripts/extender-tablet-touch-map.sh
X-GNOME-Autostart-enabled=true
```

### Option C - User systemd Service

Use this when the desktop environment supports user services and the display variables are stable:

```ini
[Unit]
Description=Map Extender touchscreen to HDMI output
After=graphical-session.target

[Service]
Type=oneshot
Environment=DISPLAY=:0
ExecStart=/home/susana/workspace/extender/bloom/scripts/extender-tablet-touch-map.sh

[Install]
WantedBy=default.target
```

Enable with:

```bash
systemctl --user enable --now extender-tablet-touch-map.service
```

If `xinput` cannot connect to the display from systemd, prefer the desktop autostart approach.

## Bloom UI/UX Validation Target

For every production-level builder/runtime change, validate at least:

- `1024x600`: no essential button is unreachable; controls remain touchable.
- `1920x1080`: layout uses space well and does not become sparse or visually disconnected.
- Runtime teleop: joystick and slider touch positions match visible controls.
- Builder app config: cards, screen lists, and inspectors remain readable without horizontal scrolling.

The target is not only "no clipping"; it is calm, readable, touchable operation under real lab conditions.
