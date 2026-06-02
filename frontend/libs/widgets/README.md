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
