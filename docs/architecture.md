# Architecture

Bloom is split into product apps and reusable libraries.

## Boundaries

- `frontend/apps/bloom-dashboard`: the browser app that users open.
- `frontend/libs/ui`: shared visual primitives.
- `frontend/libs/widgets`: configurable widgets and widget registry.
- `frontend/libs/ros-bridge`: frontend-side transport contracts, not raw ROS logic.
- `frontend/libs/api-client`: typed client for the backend API.
- `backend/apps/bloom_api`: FastAPI app composition and HTTP entrypoints.
- `backend/libs/db`: persistence and migrations.
- `backend/libs/devices`: device models and command abstractions.
- `backend/libs/ros_adapters`: the only backend layer that knows ROS topics, services, and actions.
- `backend/libs/sessions`: runtime state for active UI sessions.
- `backend/libs/logging`: structured logging helpers.

## Dependency Direction

Apps may depend on libs. Libs should not depend on apps.

Generic libs may not import ROS. ROS integration stays behind adapter interfaces so Bloom can also run in tests, demos, or non-ROS projects.

