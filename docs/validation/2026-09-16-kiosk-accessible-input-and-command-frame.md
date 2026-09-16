# 2026-09-16 Kiosk, Accessible Input, And Command Frame Validation

## Scope

Repository-level validation of the merged runtime work from the kiosk shell through application-scoped command frames.
This record does not claim live robot, target-tablet, switch-device, or gamepad acceptance.

Product status is separate from evidence level: Bloom is the active Extender IHM and `extender_ui` is legacy, while the
live checks listed below remain pending.

## Accepted At This Level

- Runtime uses a 44 px kiosk bar without product/builder navigation.
- Maintenance actions and screen switching require a 1.5 second hold to enter the maintenance overlay.
- STOP is backed by the runtime API latch; resume requires a one-second hold.
- The Drive virtual IHM composes two joysticks plus Z/RZ sliders into one 6-DoF command.
- Neutral, Jaco, momentary Snake, gripper open/close, and speed controls use concrete configured payloads.
- Keyboard joystick input, step, latch, dwell, audio cues, per-axis dead zone, repeat guard, browser gamepad input, and
  scanner highlight/click behavior have focused automated coverage. The scanner test does not prove directional
  joystick output.
- `runtime_policy.command_frame_id` round-trips through JSON, API types, SQLite, builder editing, and seeded apps.
- Widget and gamepad contributions use the app's effective command frame; unknown frames are rejected by backend policy.
- Explorer and Kinova operator screens fit their configured canvases and have no overlapping interactive controls in
  the seed contract.

## Evidence

- Bloom PR #116, merged as `b01eb21`: dwell activation.
- Bloom PR #117, merged as `7377900`: application-scoped command frame and virtual-IHM completion.
- Post-merge backend, frontend, build, format/lint, security, and visual-smoke CI gates passed on `main`.
- Visual smoke produced 42 captures across the maintained viewport matrix.

Test totals are intentionally not made a durable contract; the release gate is that the complete current suites pass.

## Still Pending

- P1 code correction for switch scanning: expose four joystick directions as scannable step targets and assert that
  activation emits a movement intent. Scan and dwell composition also needs an explicit contract.
- Physical HMTECH `1024x600`, GNOME `1280x720`, and logical `1820x720` touch calibration and comfort pass.
- Live Explorer and Kinova motion in each allowed base/end-effector/hybrid frame.
- Physical gamepad mapping, disconnect/reconnect, and simultaneous-source behavior.
- Real switch/scanning and dwell use with intended operators.
- Audio-cue audibility and suitability in the lab.
- STOP behavior against the complete controller/hardware safety chain.
- Live rosbag recording and Petanque operator acceptance.

Use [the end-to-end protocol](../extender-petanque-validation.md) for those checks.
