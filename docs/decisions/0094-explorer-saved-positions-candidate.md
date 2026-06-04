# 0094 - Explorer Saved Positions Candidate

## Status

Accepted.

## Context

Phase 4 is migrating useful legacy and partner-interface flows into Bloom without
turning Bloom core into an Explorer-specific application. Saved positions are a
good example: Explorer needs save/replay/cancel controls, but the same
interaction shape also appears in other robots and non-ROS machines as stored
commands, presets, favorites, or named poses.

## Decision

Add an `Explorer saved positions` screen to the Explorer user-test fixture using
existing generic Bloom widgets:

- `label` for operator guidance;
- `command-button` for save, load, and cancel commands;
- command action metadata for result/progress/cancel semantics;
- `event-log` for calm operator feedback.

The screen stores Explorer command names in app configuration only. Bloom core
does not introduce an Explorer pose widget or hard-code saved-position
semantics.

## Consequences

- The Explorer candidate app now covers a concrete saved-position workflow in
  runtime and builder tests.
- Future adapters can map the commands to ROS actions, services, topics, or a
  non-ROS control API.
- A later generic preset library can reuse the same command-button contract
  instead of introducing more widget families.
