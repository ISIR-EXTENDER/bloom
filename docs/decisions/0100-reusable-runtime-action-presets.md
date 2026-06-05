# 0100 - Reusable Runtime Action Presets

## Context

Phase 4 migrates richer legacy command patterns from `extender_ui`: Petanque state-machine buttons, Explorer emergency
commands, saved-position flows, gripper actions, and bridge-style ROS messages.

Hard-coding these commands inside widget implementations would make Bloom robot-specific again. Duplicating the same
topic/message/payload on every widget also makes app maintenance fragile.

## Decision

Add app-level `action_presets` to `ApplicationConfig`.

Each preset stores generic runtime command metadata:

- stable preset id and user-facing name;
- optional command name;
- runtime kind, currently `topic-publish`;
- topic, message type, payload, or CLI-style payload text;
- tags for future grouping in builder UX.

Runtime command widgets can reference presets through `presetId`. The runtime dispatcher resolves the active app preset
before applying the app runtime policy and backend safety policies.

## Consequences

- Petanque, Explorer, and Sandbox can ship reusable command examples without adding app-specific widgets to Bloom core.
- Builder users can see and edit command presets from app configuration before wiring widgets.
- Runtime policy remains a separate guardrail: presets are convenient, not automatically trusted.
- Future adapters can extend `kind` beyond `topic-publish` without changing the screen/widget model.
