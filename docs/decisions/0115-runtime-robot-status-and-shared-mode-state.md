# 0115 - Runtime Robot Status And Shared Mode State

Date: 2026-07-10

## Status

Accepted.

## Context

Sandbox V0.0 has several screens that can publish the same robot mode command on
`/cmd/mode`. Local toggle state made each screen look independent, so an operator
could switch B2 on one screen and still see B1 on another screen until touching
that second control.

Robot tests also needed lightweight status near the operator runtime instead of
requiring Bloom Debug for every check.

## Decision

Add dashboard-owned runtime mode state for the B1/B2 `/cmd/mode` controls.

- Compatible mode toggles still emit generic `topic-publish` intents.
- The dashboard recognizes `/cmd/mode` payloads `0` and `3` and updates shared
  runtime mode state.
- Widget renderers stay generic by accepting optional external control state by
  widget id.
- The runtime app shows a compact robot status strip with API/session/mode and
  critical topic diagnostics from `listRosTopicStatus`.

The mode value is an operator/runtime state, not a confirmed robot feedback
signal. A future robot adapter can replace or augment it with live controller
state when that topic/service exists.

## Consequences

- B1/B2 controls stay visually synchronized across Sandbox screens.
- Runtime screens can show critical topic readiness without opening Bloom Debug.
- Mode toggles no longer need misleading per-widget `initialValue` changes to
  present a preferred state.
- Backend ROS safety policy remains the final command boundary.
