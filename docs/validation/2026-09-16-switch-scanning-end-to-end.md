# Switch scanning, end to end against cartesian_manager — 2026-09-16

Bench session, no robot attached. Software chain under test: dashboard (Vite dev server) →
Bloom API with the rclpy gateways (`bloom api run-ros`) → `cartesian_manager` on the Jazzy
workspace, with `/joint_states`, `/ee_pose`, and `/ee_velocity` published by `ros2 topic pub`
so the runtime has live feedback. Explorer Manager, `base_link`, viewport 1280x720.

## What was verified

- The runtime reaches `READY` only when the runtime WebSocket is open, against the real API.
- Under the `One switch` profile the drive screen renders step targets: Forward, Left, stop,
  Right, Back for each pad, and +/readout/0/- for each slider. No `role="application"` node
  remains, so the scan set contains only controls a click can operate.
- The highlight walks the targets at `scan_period_ms`, and Space, Enter, a tap outside a
  control, or a tap on the switch bar fires the lit one.
- The switch bar spans the full width and is excluded from the scan set.
- STOP is inside the scanned container, so the scan set contains it.

## What was not verified

- No arm moved. `cartesian_manager` ran without `qontrol_controller` and without hardware,
  so this is a command-path result, not a motion result.
- No real switch device, sip-puff, or head pointer was used. The intended-device session
  remains open.
- Dwell combined with scanning is still not available; see the second code fix in the
  design handoff.

## Captures

Taken with `node scripts/ros-e2e-capture.mjs`, 1280x720, compared against
`Bloom UX design review 2/handoff/images/`. `01-runtime-ready` and `07-runtime-scanning`
match the reference in reading order, target sizes, and the switch bar. The reference shows
a 4x4 grid because its prototype app has four widgets; Bloom derives the scan set from the
screen's own widgets, so the grid follows the app's geometry instead.

One defect found and fixed during the session: a 260 px card clipped the fourth step target,
because the targets had a 56 px floor. They now shrink to the 44 px touch floor.
