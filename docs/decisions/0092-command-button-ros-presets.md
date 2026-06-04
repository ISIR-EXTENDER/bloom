# 0092 - Command Button ROS Presets

## Status

Accepted.

## Context

Phase 4 continues migrating legacy action widgets. `toggle` already supports
typed ON/OFF ROS payloads, but Bloom also needs one-shot commands such as:

- state-machine transitions;
- emergency stop triggers;
- Arduino-style digital output commands;
- future saved pose or robot action triggers.

Creating a separate "ROS button" widget would make the builder harder to learn
and would duplicate command-button behavior.

## Decision

Keep `command-button` as the generic one-shot action widget and extend its
settings contract with optional ROS publish fields:

- `topic`;
- `messageType`;
- `payload`;
- `presetId`.

Add shared ROS command presets and CLI preview helpers in `@bloom/widgets`.

The runtime already turns a `command-button` with a topic into a
`topic-publish` intent, so the widget remains generic: without a topic it emits
a command intent, with a topic it emits a typed publish intent.

## Consequences

- Users can configure common one-shot ROS buttons without learning a new widget
  family.
- Explorer emergency stop and Petanque state-machine commands can share the
  same foundation.
- App-specific safety policies still live in runtime adapters and backend
  allowlists, not in the frontend widget contract.
- Future presets can be added without changing the renderer.
