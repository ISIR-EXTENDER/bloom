# 0029. Interactive Action Renderers

## Status

Accepted

## Context

Bloom needs generic action widgets that can later drive ROS topics, backend commands, devices, or app-specific adapters.
The old `extender_ui` mixed some UI controls with runtime publishing details, which made reuse harder.

## Decision

Make command-like buttons and toggles interactive in `@bloom/widget-renderers`.
Button clicks emit `press` intents, and toggle clicks emit `toggle` intents with the next ON/OFF state.

The renderer stays transport-agnostic.
`@bloom/widgets` decides the generic intent shape, and future runtime adapters decide whether that intent becomes a
backend command, ROS topic publication, service call, or app-level transition.

## Consequences

- Action widgets become usable foundations for configurable apps without introducing ROS-specific React components.
- The ROS message button/toggle work remains covered by the same action boundary.
- Runtime dispatch can be implemented later without changing the renderer API.
