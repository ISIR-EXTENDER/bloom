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
