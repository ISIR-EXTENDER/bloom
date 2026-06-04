# 0095 - Explorer Safety Zones Candidate

## Status

Accepted.

## Context

The partner Explorer interface highlights QP and safety-zone controls as core
parts of user-test workflows. Bloom needs to support those workflows, but QP
semantics, safety-zone algorithms, and Explorer-specific mode names must not
become generic framework concepts.

## Decision

Add an `Explorer safety zones` screen to the Explorer user-test fixture using
existing generic widgets:

- `label` for concise operator guidance;
- `gauge` for a readable constraint/status indicator;
- `command-button` for enable, disable, and reset commands;
- `event-log` for calm feedback.

The screen keeps Explorer command names in app configuration. Future adapters
can bind them to ROS actions/services/topics or another robot API.

## Consequences

- Bloom can validate a safety-zone workflow before adding Explorer-specific
  adapters.
- Safety/QP UX remains testable in runtime and builder without coupling Bloom
  core to one robot.
- Later safety adapters should add explicit policy, audit, and confirmation
  behavior at the runtime/backend boundary.
