# Widgets Library

Framework-independent widget registry and rendering contracts.

This package intentionally starts without React components or visual styling. It defines how Bloom maps configuration
widgets to registered capabilities, including safe handling for unknown widget kinds.

## Legacy Extender UI Mapping

`LEGACY_WIDGET_KIND_MAPPINGS` documents how existing `extender_ui` widget kinds should enter Bloom:

- reusable widgets map to current Bloom kinds, for example `joystick`, `slider`, `text`, `stream-display`, and `curves`;
- ROS/device widgets are marked as `adapter-required` until Bloom has explicit runtime adapters;
- app-specific widgets are kept visible but outside Bloom core until application extension points exist;
- unmapped widgets resolve to `unknown` so legacy configuration imports can fail safely instead of crashing rendering.

## Capability Metadata

`DEFAULT_WIDGET_DEFINITIONS` is the first Bloom widget catalog contract. Each capability describes:

- its category;
- default title, settings, and layout size;
- editor/runtime availability;
- runtime requirements such as streams, data sources, device adapters, or teleoperation adapters.

The metadata is still framework-independent. React renderers, inspector fields, and runtime adapters should consume this
contract instead of duplicating widget defaults.

## Canvas Layout

The widgets package also exposes framework-independent canvas helpers inspired by the working `extender_ui` editor:

- canonical widget layout rectangles: `x`, `y`, `width`, `height`;
- canvas presets and runtime fit modes;
- snap-to-grid helpers;
- artboard size and fit-scale helpers;
- legacy `rect: { x, y, w, h }` conversion.

These helpers are intended for editor state, layout rendering, and legacy migration adapters. They should remain free of
React and storage concerns.

## Settings Contracts

Widget settings contracts define defaults, field metadata, and validation for each Bloom widget kind. They are used to:

- normalize partial editor input with safe defaults;
- report clear validation errors before runtime;
- describe future inspector fields without duplicating settings knowledge in React components;
- keep widget configuration JSON serializable for API and SQLite persistence.
