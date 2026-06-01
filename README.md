# Bloom

Bloom is a configurable web interface framework for robot teleoperation, supervision, and device control.

It starts from the current Extender tablet interface and UI work, but the goal is broader: keep the web product generic enough for ISIR lab projects, while integrating with Extender through a clean ROS adapter layer.

## Repository Shape

```text
bloom/
  frontend/
    apps/
      bloom-dashboard/
    libs/
      api-client/
      ros-bridge/
      ui/
      widgets/
  backend/
    apps/
      bloom_api/
    libs/
      db/
      devices/
      logging/
      ros_adapters/
      sessions/
  docs/
```

## Architecture Rules

- Generic web logic must not depend directly on ROS.
- ROS-specific code belongs in `backend/libs/ros_adapters`.
- Extender-specific configuration belongs in deployment/configuration, not low-level shared libraries.
- Development is local-first; do not add deployment tooling before there is a concrete need.
- Migration must be iterative: no legacy file is deleted until the replacement is tested and accepted.
- Tests should arrive with each migrated slice, not after the migration is done.

## First Checks

Backend:

```bash
cd backend
make test
```

Frontend:

```bash
npm install
npm run build
```

The backend test target disables external pytest plugin autoloading so a sourced ROS environment cannot leak ROS-specific pytest plugins into Bloom's generic tests.

## Python Environment

Use `uv` for backend dependency management and command execution whenever possible.

`uv run ...` may create a local `.venv/` next to the backend `pyproject.toml`; that environment is uv-managed and ignored by git. Do not install backend dependencies manually with `pip` unless there is a specific debugging reason.
