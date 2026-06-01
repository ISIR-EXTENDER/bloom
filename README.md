<p align="center">
  <img src="frontend/apps/bloom-dashboard/public/logo.png" alt="Bloom logo" width="220" />
</p>

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

## Getting Started

Backend:

```bash
cd backend
make test
make run
```

Useful backend commands:

| Command | Purpose |
| --- | --- |
| `make help` | List backend Make targets. |
| `make test` | Run backend tests through `uv`. |
| `make cli` | Show Bloom CLI help. |
| `make api` | Show Bloom API CLI help. |
| `make run` | Run the Bloom API locally with reload. |
| `make api-run` | Explicit alias for running the Bloom API locally. |
| `uv run python -m apps.bloom_cli.main version` | Print the backend version directly through Typer. |

Frontend:

```bash
npm install
npm run check
npm run dev
npm run build
```

During local development, the Vite dev server proxies `/api` to the backend at `http://localhost:8000`.
Start the backend with `cd backend && make run` before opening the dashboard if you want live configuration data.

The backend test target disables external pytest plugin autoloading so a sourced ROS environment cannot leak ROS-specific pytest plugins into Bloom's generic tests.

The backend API starts under `/api/v1`, with `/api/v1/health` as the first system endpoint.

Backend developer commands are exposed through the Typer CLI in `backend/apps/bloom_cli`.

## Python Environment

Use `uv` for backend dependency management and command execution whenever possible.

`uv run ...` may create a local `.venv/` next to the backend `pyproject.toml`; that environment is uv-managed and ignored by git. Do not install backend dependencies manually with `pip` unless there is a specific debugging reason.
