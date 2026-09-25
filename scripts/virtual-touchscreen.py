#!/usr/bin/env python3
"""Check the tablet touch mapping with a virtual touchscreen that carries the tablet's USB id.

It creates the device through uinput (root only), runs extender-tablet-touch-map.sh as the real one would be,
touches five points, and checks where the X pointer lands on DISPLAY_OUTPUT. Every touch is a click: run it with
nothing that matters on that screen, never while Bloom drives a robot.

    sudo -E scripts/virtual-touchscreen.py            # DISPLAY_OUTPUT=HDMI-1 by default
    sudo -E DISPLAY_OUTPUT=eDP-1 scripts/virtual-touchscreen.py
"""

import ctypes
import fcntl
import os
import re
import struct
import subprocess
import sys
import time
from pathlib import Path

UI_SET_EVBIT, UI_SET_KEYBIT, UI_SET_ABSBIT, UI_SET_PROPBIT = 0x40045564, 0x40045565, 0x40045567, 0x4004556E
UI_DEV_CREATE, UI_DEV_DESTROY = 0x5501, 0x5502
EV_SYN, EV_KEY, EV_ABS = 0, 1, 3
BTN_TOUCH, INPUT_PROP_DIRECT = 0x14A, 1
ABS_X, ABS_Y, ABS_MT_SLOT, ABS_MT_POSITION_X, ABS_MT_POSITION_Y, ABS_MT_TRACKING_ID = 0, 1, 0x2F, 0x35, 0x36, 0x39
RANGE = 4095
POINTS = [(0.25, 0.25), (0.75, 0.25), (0.5, 0.5), (0.25, 0.75), (0.75, 0.75)]
TOLERANCE_PX = 3

VENDOR, PRODUCT = (int(part, 16) for part in os.environ.get("TOUCH_USB_ID", "27c0:0818").split(":"))
OUTPUT = os.environ.get("DISPLAY_OUTPUT", "HDMI-1")
MAPPER = Path(__file__).resolve().parent / "extender-tablet-touch-map.sh"


class VirtualTouchscreen:
    def __init__(self) -> None:
        self.fd = os.open("/dev/uinput", os.O_WRONLY | os.O_NONBLOCK)
        fcntl.ioctl(self.fd, UI_SET_PROPBIT, INPUT_PROP_DIRECT)
        for event_type in (EV_SYN, EV_KEY, EV_ABS):
            fcntl.ioctl(self.fd, UI_SET_EVBIT, event_type)
        fcntl.ioctl(self.fd, UI_SET_KEYBIT, BTN_TOUCH)
        axes = (ABS_X, ABS_Y, ABS_MT_SLOT, ABS_MT_POSITION_X, ABS_MT_POSITION_Y, ABS_MT_TRACKING_ID)
        absmax = [0] * 64
        for axis in axes:
            fcntl.ioctl(self.fd, UI_SET_ABSBIT, axis)
            absmax[axis] = RANGE
        absmax[ABS_MT_SLOT], absmax[ABS_MT_TRACKING_ID] = 1, 65535
        user_dev = struct.pack(
            "80sHHHHi64i64i64i64i",
            b"Bloom virtual touchscreen",
            3,  # BUS_USB
            VENDOR,
            PRODUCT,
            1,
            0,
            *absmax,
            *([0] * 64),
            *([0] * 64),
            *([0] * 64),
        )
        os.write(self.fd, user_dev)
        fcntl.ioctl(self.fd, UI_DEV_CREATE)

    def _emit(self, event_type: int, code: int, value: int) -> None:
        os.write(self.fd, struct.pack("llHHi", 0, 0, event_type, code, value))

    def tap(self, x: float, y: float) -> None:
        ax, ay = round(x * RANGE), round(y * RANGE)
        for event_type, code, value in (
            (EV_ABS, ABS_MT_SLOT, 0),
            (EV_ABS, ABS_MT_TRACKING_ID, 1),
            (EV_ABS, ABS_MT_POSITION_X, ax),
            (EV_ABS, ABS_MT_POSITION_Y, ay),
            (EV_KEY, BTN_TOUCH, 1),
            (EV_ABS, ABS_X, ax),
            (EV_ABS, ABS_Y, ay),
            (EV_SYN, 0, 0),
        ):
            self._emit(event_type, code, value)
        time.sleep(0.15)
        for event_type, code, value in (
            (EV_ABS, ABS_MT_TRACKING_ID, -1),
            (EV_KEY, BTN_TOUCH, 0),
            (EV_SYN, 0, 0),
        ):
            self._emit(event_type, code, value)

    def close(self) -> None:
        fcntl.ioctl(self.fd, UI_DEV_DESTROY)
        os.close(self.fd)


def pointer_position() -> tuple[int, int]:
    x11 = ctypes.cdll.LoadLibrary("libX11.so.6")
    x11.XOpenDisplay.restype = ctypes.c_void_p
    display = x11.XOpenDisplay(None)
    if not display:
        sys.exit("Cannot open the X display: run with sudo -E so DISPLAY and XAUTHORITY come along.")
    x11.XDefaultRootWindow.restype = ctypes.c_ulong
    root = x11.XDefaultRootWindow(ctypes.c_void_p(display))
    child, root_back = ctypes.c_ulong(), ctypes.c_ulong()
    root_x, root_y, win_x, win_y, mask = (ctypes.c_int() for _ in range(5))
    x11.XQueryPointer(
        ctypes.c_void_p(display), root, ctypes.byref(root_back), ctypes.byref(child),
        ctypes.byref(root_x), ctypes.byref(root_y), ctypes.byref(win_x), ctypes.byref(win_y), ctypes.byref(mask),
    )
    x11.XCloseDisplay(ctypes.c_void_p(display))
    return root_x.value, root_y.value


def output_geometry() -> tuple[int, int, int, int]:
    query = subprocess.run(["xrandr", "--query"], capture_output=True, text=True, check=True).stdout
    match = re.search(rf"^{re.escape(OUTPUT)} connected.*? (\d+)x(\d+)\+(-?\d+)\+(-?\d+)", query, re.M)
    if not match:
        sys.exit(f"Output {OUTPUT} is not connected.")
    width, height, x, y = (int(value) for value in match.groups())
    return width, height, x, y


def main() -> int:
    if os.geteuid() != 0:
        sys.exit("uinput needs root: sudo -E scripts/virtual-touchscreen.py")
    screen = VirtualTouchscreen()
    try:
        time.sleep(1.5)  # X picks the new device up
        subprocess.run([str(MAPPER)], check=True, env={**os.environ, "DISPLAY_OUTPUT": OUTPUT})
        width, height, x0, y0 = output_geometry()
        failures = 0
        for px, py in POINTS:
            screen.tap(px, py)
            time.sleep(0.2)
            got = pointer_position()
            want = (round(x0 + px * (width - 1)), round(y0 + py * (height - 1)))
            ok = abs(got[0] - want[0]) <= TOLERANCE_PX and abs(got[1] - want[1]) <= TOLERANCE_PX
            failures += not ok
            print(f"{'ok  ' if ok else 'FAIL'} touch ({px:.2f}, {py:.2f}) -> pointer {got}, expected {want} on {OUTPUT}")
        print("Touch mapping verified." if failures == 0 else f"{failures} touch(es) landed off target.")
        return 1 if failures else 0
    finally:
        screen.close()


if __name__ == "__main__":
    sys.exit(main())
