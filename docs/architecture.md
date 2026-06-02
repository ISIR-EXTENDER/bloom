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

Planned boundaries should be introduced only with the feature that needs them:

- `frontend/libs/ros-bridge`: frontend-side live transport contracts, not raw ROS logic.
- `backend/libs/devices`: device models and command abstractions.
- `backend/libs/sessions`: runtime state for active UI sessions.
- `backend/libs/logging`: structured logging helpers.

## Product Navigation

Bloom should separate product entry points from robot interface execution:

- Landing page: introduces Bloom and offers a clear entry button to the main app.
- Main app shell: lets users choose between building/editing apps and running existing apps.
- App builder: edits applications, screens, widgets, layout, settings, and persistence.
- Runtime apps: renders a chosen robot interface for operation without builder controls.

Screen previews, canvas builders, and runtime apps should not live permanently on the landing page. They can appear there
temporarily during migration only as development previews.

## Dependency Direction

Apps may depend on libs. Libs should not depend on apps.

Generic libs may not import ROS. ROS integration stays behind adapter interfaces so Bloom can also run in tests, demos, or non-ROS projects.
