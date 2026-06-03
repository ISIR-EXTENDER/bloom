# 0065 - Use Partner Interface As Explorer UX Inspiration

Status: accepted.

## Context

The Inria/AUCTUS `extender-interface` repository introduces a parallel Extender
HMI prototype focused on Explorer control-mode user tests. It includes useful UX
ideas: PMR-customizable layouts, B1-B4 mode buttons, a mode-aware joystick,
deploy/repli progress and cancellation, saved positions, local webcam, 3D robot
state, display presets, and diagnostic placeholders.

Bloom already has a broader product goal: reusable robot and machine web apps,
with clean frontend/backend separation, SQLite storage, generic widget
contracts, runtime adapters, tests, security, and accessibility foundations.

## Decision

Use `extender-interface` as UX inspiration for a future Explorer-specific Bloom
app or extension, not as a core architecture to copy.

Bloom should preserve:

- generic app/screen/widget/runtime models;
- backend adapter boundaries for ROS or non-ROS machines;
- app-level configuration for robot-specific modes and bindings;
- tested migrations from `extender_ui` and `tablet_interface`.

Explorer-specific control modes, AUCTUS bridge item names, URDF details, and
mode mappings must stay in app configuration or extension code.

## Consequences

- Bloom can later host an `Explorer User Tests` app that follows the partner
  control flow without turning Bloom into an Explorer-only product.
- The mode-aware joystick and action progress/cancel patterns become foundation
  candidates.
- AUCTUS `/auctus_ui` support may be evaluated as an optional backend adapter,
  not a frontend-wide dependency.
- `extender_ui` remains the reference for user-tested slider/joystick ergonomics.
- `tablet_interface` remains the reference for safe backend ROS runtime
  behavior.
