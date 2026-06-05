# 0099 - App Runtime Adapter Policies

Date: 2026-06-05

## Status

Accepted.

## Context

Phase 4 migrates more legacy robot widgets and app fixtures. Many widgets can publish to ROS topics or send teleop
commands, but each app should be able to describe which runtime adapters, topics, message types, and recording topics
are expected for that app.

The backend already owns the final runtime command safety policy. Bloom still benefits from app-level policies because
they make fixtures, demos, and builder/runtime UX more explicit.

## Decision

Add `runtime_policy` to `ApplicationConfig`.

The policy currently carries:

- allowed ROS publish topics;
- allowed ROS message types;
- allowed teleop targets;
- allowed recording topics.

The frontend runtime dispatcher uses this policy as an early app-level guard. The backend runtime policy remains the
authoritative safety boundary before commands reach ROS adapters.

## Consequences

Seeded Petanque, Sandbox, Explorer, and Bloom Debug apps now declare their expected runtime boundaries. Future builder
UX can expose these policies as app adapter settings without leaking ROS details into generic widget renderers.

