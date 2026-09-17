# 0059 - Production Readiness Review

## Status

Accepted.

## Context

Bloom is now far enough into the migration that comparing it against
`extender_ui` and `tablet_interface` is more useful than adding isolated
features. The old repos are not clean architecturally, but they contain working
product knowledge: real widget behavior, working ROS bridges, and UI choices
validated through actual usage.

## Decision

Use `docs/production-readiness-review.md` as the current migration-quality review
for Bloom. It captures:

- migration percentage by product area,
- legacy behaviors worth preserving,
- architecture gaps,
- frontend and backend refactoring plans,
- UX/UI fixes, especially for touch-first teleoperation controls.

## Consequences

- Slider and joystick behavior should be migrated with special care because the
  legacy design came from user feedback.
- Runtime ROS parity should reuse `tablet_interface` concepts, but through Bloom
  adapters instead of direct ROS leakage into the frontend.
- Future feature PRs should update this review or the current UX design handoff when they
  close a listed gap.

## Amendment, 2026-09-17

The review this decision names is finished and now lives at `docs/archive/production-readiness-review.md`. Its purpose
was to compare a migrating Bloom against `extender_ui` and `tablet_interface`; Bloom is the shipped interface, so there
is nothing left to migrate against. The decision's real consequence stands: slider and joystick ergonomics came from
user feedback and are changed deliberately, and ROS parity reaches the robot through adapters. A PR that closes a
product gap updates `docs/ux-design-handoff.md`, not the archived review.
