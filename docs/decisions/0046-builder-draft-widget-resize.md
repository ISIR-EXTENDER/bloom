# 0046 - Builder Draft Widget Resize

## Status

Accepted

## Context

After draft widget movement, the next WYSIWYG builder capability is resizing widgets on the canvas. The old `extender_ui`
builder supported resizing well, but Bloom needs the behavior to stay aligned with widget-specific editor capabilities
instead of applying the same settings to every widget.

## Decision

Bloom now supports draft widget resize handles in the builder:

- `BuilderCanvasItem` exposes a resize handle next to the move/select surface.
- `builderLayout` computes grid-snapped resize results and clamps them to canvas bounds.
- Resize minimums come from each resolved widget definition, with a safe fallback for unknown widgets.
- The inspector reflects draft size changes immediately, while persistence remains a future API/SQLite slice.

## Consequences

- Widget-specific size constraints are part of the builder foundation.
- Runtime widgets remain unaffected because resize controls are builder-only.
- The save/history slices can reuse the same draft screen state and layout helpers.
