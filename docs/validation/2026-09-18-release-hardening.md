# Release hardening — 2026-09-18

What was reviewed and fixed in the day before 0.2.0 went out, and what an operator session still has to prove.
Evidence only: the behaviour it describes lives in [the operator runtime guide](../operator-runtime.md), and the
earlier pass is archived at [`docs/archive/2026-09-17-release-review.md`](../archive/2026-09-17-release-review.md).

## What was reviewed

Six passes, each against `main` as it stood, each reproducing what it reported:

| Pass | Looked at | Found |
| --- | --- | --- |
| Backend and security | STOP, ownership, sessions, storage, the ROS seams | 12, 2 high |
| Accessibility and input | keyboard, switch scanning, dwell, screen reader, targets | 12, 3 critical |
| Viewport sweep | every screen of every shipped app at its maintained panels | 3 fixed, 5 gaps recorded |
| Documentation | every page against the code | drift on 11 topics |
| Release readiness | the checklist, the gates, the release notes | 1 critical, 2 high |
| Frontend runtime | the day's own churn, for fixes that fought each other | 11, 4 high |

## What the simulation proves

`npm run e2e:sim` passed 12 of 12 on both robots, run self-contained, each check verified on the ROS graph rather
than in the page: teleop moves `/ee_pose` and releases to zero, Bench and Operator publish the same twist, the gripper
sends each robot's own range, STOP latches with a zero twist and `behaviour/passthrough`, the maintenance hold zeros a
held drive, the frame stamp reaches the wire, Go home dispatches and Release returns to passthrough, and Bloom Debug
reads joint states and the Jacobian.

The Explorer simulation needs three runtime workarounds on Jazzy, which the script applies and
[the simulation run](ros-sim-e2e.md) explains. They are `explorer_stack` bugs, not Bloom's.

## The fixes that matter most

- **STOP zeroes every accepted teleop target.** It zeroed one, so a session driving the other kept its last value
  until the socket closed.
- **STOP survives a publisher error.** Only `RuntimeError` was caught, so an rclpy handle error aborted the latch
  before the joint-target cancel and left a running move with the operator locked out.
- **An assistive resume asks twice.** A single switch press or a dwell cleared the latch, against what the control,
  this guide and the checklist all promise.
- **A switch or dwell operator can reach maintenance**, including while stopped, and STOP is the first scan target
  and the first tab stop rather than 28 seconds away.
- **Dwell requires a rest**, so a pointer crossing a control no longer fires it.
- **A stale control lease can be taken** (decision 0135), so a tablet that lost Wi-Fi no longer blocks every operator
  and every resume.
- **An app's own policy reaches the socket**, so a session on an app that declares no teleop target cannot stream one.
- **Bloom Debug fills on the simulation**: NaN velocity and effort on the passive gripper joints made every
  `/joint_states` sample invalid JSON.

## What is still open

- **Hardware.** Everything above is simulation, fixture or contract evidence. The Pivot sign is verified on the wire
  and not on an arm.
- **Spanish and French** wording needs a native speaker before participant use, STOP and the resume hold first.
- **1024×600** has no collapse layout: screens fit-scale to 0.8, and under the `one-switch` profile the switch strip
  takes enough canvas that targets fall below the touch floor. The lab panel runs 1280×720, where they do not.
- **Sandbox, Explorer User Tests and Petanque admin** place STOP in the corner rather than a reserved region, so some
  of their controls sit under it at the smallest panel. They are off the operator path; the sweep records each one.
- **The operator target floor** is written as 48 px, 56 px and 64 px in different places. One number has to win.
