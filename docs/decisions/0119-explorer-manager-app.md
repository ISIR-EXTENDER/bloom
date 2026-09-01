# 0119 - Explorer Manager app and confirm-press

Date: 2026-09-01

## Context

Bloom's Extender apps were inherited from `extender_ui` screen-for-screen. They
are organised around what the old UI happened to have, not around what
`cartesian_manager` actually does.

The manager has three mutually exclusive branches — impedance, velocity, and
position — and sums every activated input rather than arbitrating between them.
Neither fact is visible anywhere in Bloom.

## Decision

Add an **Explorer Manager** app whose screens follow the manager's own structure.

| Screen | Manager branch | Purpose |
| --- | --- | --- |
| Drive | velocity | Translation and rotation joysticks, max velocity, gripper, geometric mode selection, snake hold |
| Positions | position | Named joint targets, and a Release control that cancels them |
| Robot feedback | — | `/ee_pose`, `/ee_velocity`, `/joint_states`, and `/cartesian_command` |
| Command sources | — | This tablet, visual servoing, and the summed manager output side by side |

Add `confirm_press` to the command-button widget: an armed first press, a
dispatching second press, and a timeout that disarms.

## Rationale

**Named positions need a confirm.** A `behaviour/joint_target/<name>` request is
dispatched once and the manager reports no progress. There is no interrupt, no
feedback, and no way to know how far the arm has travelled. An accidental press
is a moving robot. A confirm press is the cheapest honest mitigation, and the
timeout exists so a button armed and abandoned cannot be completed minutes later
by someone who did not arm it.

**Release is a first-class control, not a preset.** `behaviour/passthrough`
publishes an empty `JointState` on `/joint_target_command`, which is the manager's
cancel signal. Burying that in an action-preset menu would mean the only way to
stop a moving arm is three taps deep.

**Command sources deserve a screen.** Because the manager sums inputs, an
operator seeing unexpected motion cannot tell whether it is theirs, the joystick,
or visual servoing. Showing the three traces together turns a mystery into a
reading.

**Feedback is separated from control.** The QP publishes `pose_EE`, `vel_EE` and
`Jacobian_EE`; Bloom used almost none of it. Putting commanded velocity next to
measured velocity makes a controller problem distinguishable from a UI problem.

## Consequences

- New fixture, seeded configuration, and coverage in the frontend/backend
  coherence check.
- `/visual_servoing_cartesian_command` added to the backend recording allowlist.
- `confirm_press`, `confirm_label` and `confirm_timeout_seconds` are available to
  every command button, defaulting to off so existing apps are unchanged.

## Known gap: Z and RZ are not drivable

The teleop adapter maps **one joystick to either linear or angular**, chosen by
`mode_id`. There is no way for a second widget to contribute `linear.z` or
`angular.z`, so a 6-DoF twist cannot be composed from separate controls.

The Sandbox app appears to have Z and RZ sliders, but they publish scalars to
`/cmd/joystick_z` and `/cmd/joystick_rz`, which nothing in the manager stack
subscribes to. In `extender_ui` those fed a teleop store that assembled the full
twist; in Bloom they reach nothing.

Rather than ship the same dead controls, the Drive screen documents the gap.
Fixing it means letting the teleop adapter accumulate per-axis contributions from
multiple widgets, which is its own piece of work.

## Follow-up

- Per-axis teleop composition, so Z and RZ work.
- A saved-position library in Bloom itself, rather than only in
  `explorer_params.yaml`. Bloom can persist poses live; the manager can only
  reach names it was configured with, so the two need bridging.
- Manipulability from `/ee_jac`, which is published and entirely unused.
