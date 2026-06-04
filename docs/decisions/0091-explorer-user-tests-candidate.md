# 0091 - Explorer User Tests Candidate

## Status

Accepted.

## Context

Phase 4 migrates legacy widgets and useful app flows from `extender_ui`,
`tablet_interface`, Petanque, and the partner Explorer interface review. The
partner prototype contains valuable Explorer-specific user-test UX, but Bloom
must stay generic enough for other robots and non-ROS supervision projects.

Bloom also needed a reusable log/event display primitive. Raw console-style logs
are useful for debug screens, but operator runtime screens need calmer feedback:
severity, short summaries, optional details, and no unnecessary technical noise.

## Decision

Add a generic `event-log` widget foundation and map legacy `logs` toward it.

Add `tests/fixtures/explorer-user-tests-configuration-bundle.json` as a first
non-ROS candidate app for global Extender/Explorer user tests. The fixture uses
existing Bloom widget contracts:

- mode-aware joystick;
- scalar slider topic binding;
- configurable command buttons and toggles;
- camera, gauge, plot, and `robot-3d` placeholders;
- topic echo and topic plot debug widgets;
- `event-log` feedback widgets;
- profile-ready app metadata.

Explorer-specific semantics stay in app configuration or future Explorer
adapters, not in Bloom core widget definitions.

## Consequences

- Bloom gains a concrete app candidate for future Explorer runtime validation
  without coupling the framework to Explorer.
- Runtime/builder tests can now validate a richer app than Sandbox/Petanque
  while still using the same generic screen model.
- Saved positions, safety zones, drink mode, and final Explorer mode mappings
  remain app-extension work, not core framework work.
- Event feedback becomes reusable for robot actions, recording sessions, debug
  flows, and non-ROS supervision apps.
