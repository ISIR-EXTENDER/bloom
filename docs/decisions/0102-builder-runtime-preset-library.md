# 0102 - Builder Runtime Preset Library

Date: 2026-06-05

## Context

Phase 4 migrated configurable ROS message buttons and app-level runtime policies. The next usability gap was that users
still had to know exact topics, message types, and payloads before they could create reusable command presets. This is
too close to console-level robotics work for Bloom's long-term goal.

## Decision

Add a first reusable command preset library in the widget foundation and expose it from the app configuration page:

- presets are grouped by intent, such as state machines, safety, bridge commands, and saved-position commands;
- app builders can add a library preset into the current app with one button;
- app builders can synchronize publish-topic and message-type guardrails from configured action presets;
- saved-position flows stay modeled as generic command presets instead of a new Explorer-specific widget.

The runtime contract remains unchanged. Library presets are converted to existing `RuntimeActionPreset` records, and the
runtime dispatcher continues to resolve commands through app-level presets and policies.

## Consequences

- Bloom becomes easier for non-web users without adding a new runtime abstraction.
- Runtime policy editing is less error-prone because app-level guardrails can be derived from selected presets.
- Saved-pose flows can be explored in Phase 4/5 while keeping Explorer-specific behavior behind adapters and app config.
