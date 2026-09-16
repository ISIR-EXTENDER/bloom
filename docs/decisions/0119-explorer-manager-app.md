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

## Z and RZ, and per-axis composition

The Drive screen carries working Z and RZ controls because the teleop adapter now
composes a full 6-DoF twist. See decision 0120.

## 2026-09-16 Amendment

Both original follow-ups are delivered:

- the Positions screen has a saved-position library with replay, rename/delete,
  and export of the manager's `joint_targets` block;
- `/ee_jac` is reduced to manipulability and plotted on Robot Feedback.

The Drive virtual IHM now contains two composed joysticks, return-to-center Z/RZ
sliders, Neutral, Jaco, momentary Snake with neutral release, and gripper
open/close values matching `tablet_interface` (`0.2`/`1.1`). Kinova Manager uses
the same screen contract and adds fault reset. One effective command frame applies
to every virtual and gamepad Cartesian contribution; app policy supplies its session default.
