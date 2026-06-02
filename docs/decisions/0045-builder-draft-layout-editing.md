# 0045 - Builder Draft Layout Editing

## Status

Accepted

## Context

Bloom needs a production-level WYSIWYG builder inspired by the legacy `extender_ui` canvas. The first editing slice should
let users move widgets on the canvas without coupling pointer interaction, persistence, and inspector logic into one
large component.

## Decision

The dashboard builder now uses a local draft screen for layout editing:

- `BuilderWorkspace` owns the current draft screen for the selected screen.
- `BuilderCanvasItem` handles pointer-based movement and selection.
- `builderLayout` contains pure layout math for grid snapping, canvas clamping, and CSS transform scale parsing.
- `BuilderInspector` and `useSelectedBuilderWidget` keep selection display logic separate from canvas interaction.

Draft edits are intentionally not persisted yet. Saving through the configuration API and SQLite storage will be added
as a dedicated slice once move/resize/history behavior is stable.

## Consequences

- The builder can evolve toward drag, resize, undo/redo, and save without turning `BuilderWorkspace` into a monolith.
- Runtime remains unaffected because layout editing is isolated to builder-only components.
- Tests cover both the pure layout helpers and the user-visible canvas movement behavior.
