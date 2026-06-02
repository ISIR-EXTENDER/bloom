# 0021. Widget Editor Capabilities

## Status

Accepted.

## Context

Legacy `extender_ui` widgets did not all expose the same editing controls. Some widgets were mainly visual, some needed
resizing, some had color/style controls, and some had specific settings fields. Bloom should not assume every widget can
use the same inspector UI.

## Decision

Extend widget capability metadata with editor capabilities:

- whether a widget can be moved;
- whether a widget can be resized;
- whether a widget exposes settings;
- which style/color fields are meaningful.

Keep this metadata framework-independent so future React inspectors, canvas editors, and app-specific widgets can consume
the same contract.

## Consequences

Bloom can build an editor that exposes only relevant controls per widget. This avoids copying the old UI's uneven
configuration behavior accidentally while still preserving the important fact that widgets have different editing needs.
