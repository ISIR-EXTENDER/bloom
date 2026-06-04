# Architecture

Bloom is split into product apps and reusable libraries.

## Boundaries

- `frontend/apps/bloom-dashboard`: the browser app that users open.
- `frontend/libs/ui`: shared visual primitives.
- `frontend/libs/widgets`: configurable widgets and widget registry.
- `frontend/libs/widget-renderers`: runtime-safe widget rendering from widget descriptors.
- `frontend/libs/api-client`: typed client for the backend API.
- `backend/apps/bloom_api`: FastAPI app composition and HTTP entrypoints.
- `backend/apps/bloom_cli`: Typer command line entrypoint for local development and migration commands.
- `backend/libs/config`: application configuration models, repositories, and legacy JSON adapters.
- `backend/libs/db`: persistence and migrations.
- `backend/libs/ros_adapters`: the only backend layer that knows ROS topics, services, and actions.
- `backend/libs/sessions`: runtime state and connected UI session coordination.

Planned boundaries should be introduced only with the feature that needs them:

- `frontend/libs/ros-bridge`: frontend-side live transport contracts, not raw ROS logic.
- `backend/libs/devices`: device models and command abstractions.
- `backend/libs/logging`: structured logging helpers.

## Design System Boundary

Bloom's visual system is documented in `docs/design-system.md`.

Reusable primitives, theme presets, and semantic tokens belong in `frontend/libs/ui`. Product-area CSS in
`frontend/apps/bloom-dashboard` should focus on layout, builder/runtime-specific composition, and temporary migration
surfaces.

When a dashboard pattern repeats across product areas, promote it deliberately into `@bloom/ui` instead of copy/pasting
styles. When an app needs a different visual identity, add or configure theme tokens rather than forking widgets.

## Product Navigation

Bloom should separate product entry points from robot interface execution:

- Landing page: introduces Bloom and offers a clear entry button to the main app.
- Main app shell: lets users choose between building/editing apps and running existing apps.
- App builder: edits applications, screens, widgets, layout, settings, and persistence.
- Runtime app library: lets users choose or resume the app they want to operate.
- Runtime apps: renders a chosen robot interface for operation without builder controls, with small edit shortcuts back
  to the current app or screen when needed.
- Help page: explains current workflows step by step and keeps a visible freshness signal for handover.

Screen previews, canvas builders, and runtime apps should not live permanently on the landing page. They can appear there
temporarily during migration only as development previews.

## Builder Composition

The builder has two product levels:

- App configuration: edits app identity, app-level design tokens, and which existing screens belong to the app.
- Screen builder: edits one selected screen in a full-page WYSIWYG canvas with builder-only controls.
- Screen library: exposes reusable screens across apps with search, grouping, visual preview, builder entry, and runtime
  preview.
- Playground: opens selected runtime screens quickly for smoke tests before users commit to a saved app workflow.

During Phase 2, the app configuration page derives available screens from the selected configuration bundle while SQLite
also writes normalized app, screen, widget, and asset mirror rows. The bundle stays the lossless migration bridge until
the normalized schema is stable enough to reconstruct configurations directly from tables.

The app configuration page is also the screen lifecycle hub: users can create blank screens, duplicate existing screens,
add reusable screens from other apps, reorder screens, remove screens from the current app, then save/discard the draft
composition.

## Runtime Composition

Runtime uses the same screen model, widget layout model, and renderer pipeline as the builder. The difference is chrome:
builder tools are layered around the renderer, while runtime strips them away for operation.

The runtime entry point is an app library, not the last selected builder app. This keeps the user flow explicit:

- choose an app to operate;
- resume a recently opened app when useful;
- operate the app in a clean runtime view;
- jump back to edit app/screen only when a change is needed.

Status indicators should follow the same adapter boundary as runtime behavior. Backend/API state can be generic, but
robot, ROS, network, or hardware state must come from explicit adapters instead of being inferred in frontend-only code.

## Dependency Direction

Apps may depend on libs. Libs should not depend on apps.

Generic libs may not import ROS. ROS integration stays behind adapter interfaces so Bloom can also run in tests, demos, or non-ROS projects.
