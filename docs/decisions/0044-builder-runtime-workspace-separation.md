# 0044 - Builder and Runtime Workspace Separation

## Status

Accepted

## Context

The legacy `extender_ui` builder worked well because its editing surface and runtime application were separate concerns:
operators could build screens with panels, inspectors, and canvas helpers, while the runtime showed a clean full-view app.
Bloom should preserve that behavior instead of turning runtime into a debug preview page.

## Decision

Bloom now keeps two dedicated dashboard workspaces:

- `BuilderWorkspace` renders configuration selection, the builder canvas, safe empty-screen placeholders, and the inspector.
- `RuntimeWorkspace` renders a full application view with screen tabs, runtime widgets, and runtime-safe empty-screen placeholders.
- Runtime action dispatch remains connected behind the widgets, but debug records and builder-only controls stay out of the app view.

## Consequences

- Future drag, resize, undo, and inspector features can evolve inside the builder without leaking into runtime.
- Runtime tests must keep checking that builder-only UI is absent from the app view.
- The split follows the migration principle from `extender_ui`: WYSIWYG authoring should preview what the final app will look like, but the final app should not carry authoring chrome.
