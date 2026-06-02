# 0028. Interactive Joystick Renderer

## Status

Accepted

## Context

`extender_ui` used `nipplejs` successfully for tactile joystick input, and joystick controls are core to reusable robot
teleoperation screens.
Bloom needs the same capability without coupling reusable React widgets to ROS topics or backend transport details.

## Decision

Add a dedicated joystick primitive in `@bloom/widget-renderers` using `nipplejs`.
The renderer reads declarative widget settings such as `binding`, `deadzone`, labels, color, and layout-derived size,
then emits a Bloom runtime action intent with a normalized `{ x, y }` vector.

The joystick renderer does not publish ROS messages directly.
Runtime adapters remain responsible for mapping vector intents to topics, services, or other robot commands.

## Consequences

- Joystick joins slider as a reusable interactive input primitive.
- The React renderer package owns browser interaction details; `@bloom/widgets` keeps only the generic vector intent
  contract.
- Future teleoperation widgets can reuse the same action boundary instead of creating ROS-specific UI components.
