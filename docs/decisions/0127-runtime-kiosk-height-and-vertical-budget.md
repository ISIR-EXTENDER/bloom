# 0127 - Runtime kiosk height and vertical budget

Date: 2026-09-16

## Context

Bloom's runtime already uses one fixed 44 px status bar. The current design-review kiosk specification agrees and gives
the controls 556 px of a `1024x600` panel. Two narrative handoff notes still describe an earlier specification and
settings capture as using 56 px, while the settings proposal separately calls its own screen header 56 px. Without a
recorded distinction, later settings and tour work could either enlarge the shared kiosk bar or budget the same header
twice.

The 44 px touch floor is a separate minimum for interactive targets. It does not determine the status bar height, and
this decision does not waive or redefine target-size validation.

## Decision

Keep the shared runtime kiosk bar at 44 px.

- Runtime layouts subtract 44 px once from the viewport before budgeting their body: 556 px remain at `1024x600`, and
  676 px remain at `1280x720`.
- Lot 1 settings and lot 3 guided tours use those body budgets. A screen-local header may be 56 px, as in the settings
  proposal, but it consumes part of the remaining body and does not redefine or stack another shared kiosk bar.
- `--runtime-operator-bar-height: 44px` and `.runtime-kiosk-bar { flex: 0 0 44px; }` remain the implementation values.
- Any future height change must update this decision, the kiosk specification, runtime CSS, reference captures, and the
  settings/tour budgets together.

## Rationale

The compact bar preserves truthful app, robot, link, frame, profile, gamepad, and Maintenance state while returning 12
px to controls compared with the historical 56 px proposal. The runtime's main task is operating the robot; enlarging
status chrome would reduce space for controls without adding an operator action.

Separating shared chrome from an internal screen header also resolves the apparent 44/56 contradiction without
discarding the settings composition. Each number describes a different layer.

## Consequences

- The existing kiosk implementation does not need a code change.
- Settings and tours must fit below the 44 px bar at every supported panel size and may not assume a 56 px shared bar.
- A 56 px local settings header is acceptable only inside the available body budget.
- Visual validation should measure the shared bar independently of target-size checks.

## Validation

The runtime stylesheet and kiosk shell tests establish the 44 px implementation contract. The dated live capture in
`docs/validation/2026-09-16-kiosk-height-decision.md` checks the maintained runtime at `1280x720` against the design
review reference.
