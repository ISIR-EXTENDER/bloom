# Joystick Lab End-to-End Validation

Date: 2026-09-16

Repository-level and ROS-bench validation of the Explorer and Kinova Manager Joystick Lab screen. This is not physical
robot, tablet, switch, or operator acceptance.

## Scope

- The tracked `manager_joystick_lab` screen is present in both Manager seeds.
- Runtime frame buttons use the backend capability report, remain visible when unavailable, and do not call a backend
  action to change the local session selection.
- A frame can change only while the composed twist is zero.
- The kiosk bar, virtual controls, and gamepad share the selected session frame.
- Direct, keyboard, and switch-scan controls remain reachable; momentary Snake releases on `pointercancel`.
- The live `1280x720` screen is compared with `Bloom Joystick Lab.dc.html`, the delivered interactive reference. The
  handoff names `images/11-joystick-lab.png`, but that file was not delivered.

## Live Stack

- Existing `cartesian_manager_node` using the installed Explorer parameters on `ROS_DOMAIN_ID=15`.
- Live `/joint_states`, `/ee_pose`, and `/ee_velocity` publishers.
- `bloom api run-ros` with an isolated SQLite store and configuration directory, robot `Explorer`, default frame
  `base_link`, and frame allowlist `base_link,ft_frame,hybrid_frame`.
- Vite dashboard at `1280x720`, connected to that API without mocks.

`scripts/ros-e2e-capture.mjs --only 11-joystick-lab` completed and wrote
`/tmp/bloom-joystick-lab-capture/11-joystick-lab.png`.

## Behavior Evidence

Playwright launched Explorer Manager, opened Joystick Lab through the maintenance hold, and verified:

- Tool stayed visible and disabled because Explorer did not report `effector_frame`;
- Hybrid selected at zero and changed the kiosk frame to `hybrid_frame`;
- three keyboard steps crossed the configured `0.2` dead zone;
- every frame button disabled with `Release controls` while the translation contribution was nonzero;
- releasing the key restored the supported frame controls.

A filtered live ROS echo received the command produced by that browser interaction:

```yaml
header:
  frame_id: hybrid_frame
twist:
  linear: {x: 0.12499999999999997, y: 0.0, z: 0.0}
  angular: {x: 0.0, y: 0.0, z: 0.0}
```

The backend runtime audit also recorded accepted `websocket_teleop` commands in `hybrid_frame`.

## Visual Comparison

The live capture and interactive reference agree on the required reading order: frame and mode choices first, then
Height/Translation, Rotation/Pivot, command echo, and fixed STOP. All controls remain above the STOP reserve, the
unsupported frame explains itself, the selected frame is visible in the kiosk, and no labels overlap at `1280x720`.

Two integration corrections came from the comparison:

- the handoff's `axes` fields were mapped to Bloom's canonical `axis_hints`, restoring blue translation guides, red
  rotation guides, and the truthful `ROTATION / ROTATION` detail strip;
- Rotation and Pivot were narrowed by one pixel so their right edge does not enter the fixed STOP reserve when the same
  screen is fitted to the maintained `1024x600` panel.

Bloom keeps its established 44 px kiosk and fixed 176x132 STOP rather than copying the prototype's larger decorative
shell. The screen uses the existing widget renderers, so its cards and diagnostics follow the shipped Bloom design
system instead of introducing a one-off joystick component.

## Automated Evidence

- Dashboard: 28 files, 341 tests passed.
- Widget renderers: 8 files, 86 tests passed.
- Widget model: 3 files, 88 tests passed.
- Backend: 312 tests passed, including all 17 seed contracts after the STOP-reserve correction.
- TypeScript project build and production workspace build passed.
- `npm run check` passed with the two pre-existing warnings recorded by the repository.

## Still Required

- Repeat the frame and release-to-zero checks on Explorer and Kinova hardware in every frame offered by each backend.
- Validate direct touch, the intended physical switch, and the actual gamepad with Robin.
- Confirm frame and mode labels with operators; the manager still reports no authoritative mode state.
