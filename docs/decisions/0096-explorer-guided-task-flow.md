# 0096 - Explorer Guided Task Flow

## Status

Accepted.

## Context

The Explorer/Extender tests include task-specific flows such as drink
assistance. The old UI had playful, task-specific widgets, but Bloom should
avoid hard-coding one activity into core. The reusable pattern is broader:
guided operator tasks with visual context, progress, start/pause/complete
actions, and calm feedback.

## Decision

Add an `Explorer drink mode` screen to the Explorer user-test fixture using
generic Bloom primitives:

- `label` for task instructions;
- `camera` for task context;
- `gauge` for progress;
- `command-button` for start, pause, and complete actions;
- `event-log` for feedback.

The screen keeps task commands in app configuration. Bloom core does not add a
drink-specific widget.

## Consequences

- Bloom can validate task-flow UX without a robot-specific implementation.
- Future task apps can reuse the same screen structure for meal, work, rehab,
  setup, or maintenance flows.
- Robot-specific sequencing and safety behavior belongs in adapters and runtime
  policy, not in widget renderers.
