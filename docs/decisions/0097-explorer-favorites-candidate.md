# 0097 - Explorer Favorites Candidate

## Status

Accepted.

## Context

User-test operators need fast paths to common modes, layouts, positions, and
task presets. This should not create a separate favorites subsystem before the
storage model is normalized, but Phase 4 should validate the interaction shape
inside the Explorer candidate app.

## Decision

Add an `Explorer favorites` screen to the Explorer user-test fixture using
generic `command-button` and `event-log` widgets.

Favorites are modeled as configured commands, not as Bloom core concepts. The
screen includes example shortcuts for BOTH mode, tablet layout, and work pose.

## Consequences

- Bloom validates a fast operator shortcut surface without committing to a
  premature favorites database schema.
- App-specific adapters can later decide whether a favorite applies a profile,
  sends a ROS command, loads a saved pose, or calls another machine API.
- The future preset/favorites library can build on the same command/action
  contract already used by command buttons.
