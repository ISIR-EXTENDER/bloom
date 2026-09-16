# 0128 - Read-only supervisor mirror

Date: 2026-09-16

## Context

The design review asks for a supervisor view on a second screen, but Bloom has no accepted control-handover protocol.
Reusing the operator runtime would expose movement, STOP, resume, and configured actions and could imply that opening a
browser transfers command authority. The manager also publishes no authoritative active-mode state.

## Decision

Add a separate per-app supervisor route that receives a projected runtime client with only connection observation,
`getRuntimeStopState`, and `listRosTopicStatus`.

- The mirror renders no app artboard or robot command controls.
- It states that the operator retains control and names the actions it cannot perform.
- The Runtime library opens the mirror in the current tab; Maintenance opens the current app in a separate tab.
- STOP and topic status refresh automatically, while a manual topic refresh remains available.
- A fresh mirror reports mode as not checked. It may show only a request observed in that browser session and never
  describes it as confirmed controller state.

## Consequences

Observation can be deployed on a second display without enlarging the robot-command surface. Shared backend STOP state
is visible but cannot be changed from the mirror. Any future supervisor command or handover feature requires a new
decision covering identity, ownership, acknowledgement, timeout, failure, and hardware-safety behavior.

## Validation

Projection, route, app-selection, separate-tab, and command-absence tests run in the dashboard suite. Visual smoke checks
the mirror at maintained viewports and verifies topic tiles stay inside the status list. The live browser result is
recorded in `docs/validation/2026-09-16-supervisor-mirror.md`.
