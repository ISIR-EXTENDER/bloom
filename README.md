<p align="center">
  <img src="frontend/apps/bloom-dashboard/public/logo.png" alt="Bloom logo" width="220" />
</p>

# Bloom

Bloom is a configurable web interface framework for robot teleoperation, supervision, and device control.

It starts from the current Extender tablet interface and UI work, but the goal is broader: keep the web product generic enough for ISIR lab projects, while integrating with Extender through a clean ROS adapter layer.

## Work In Progress

Bloom is currently in foundation work before the full UI/database migration:

- Product navigation now separates the landing page from builder and runtime previews.
- The dashboard can load configurations, select applications/screens, and render a canvas preview from widget contracts.
- Runtime apps render without builder controls, scale `fit` canvases to the viewport, and show safe coming-soon states for empty screens.
- Runtime topic-publish intents dispatch through the backend ROS publish endpoint with simulated status when ROS is not configured.
- The visual direction is moving toward a light Bloom theme: beige, grey, white, high readability, tablet-friendly targets.
- Next major pieces are the real screen builder, runtime app routes, SQLite-backed app management, ROS adapters, and richer topic visualization.

## Repository Shape

```text
bloom/
  frontend/
    apps/
      bloom-dashboard/
    libs/
      api-client/
      ui/
      widgets/
      widget-renderers/
  backend/
    apps/
      bloom_api/
      bloom_cli/
    libs/
      config/
      db/
      ros_adapters/
  docs/
```

Planned libraries such as frontend transport bridges, backend device abstractions, runtime sessions, and structured
logging should be added only when the corresponding migration slice needs them.

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
| `make config` | Show Bloom configuration storage CLI help. |
| `make run` | Run the Bloom API locally with reload. |
| `make api-run` | Explicit alias for running the Bloom API locally. |
| `make ros-run` | Run the Bloom API with a ROS publisher gateway after sourcing ROS. |
| `uv run python -m apps.bloom_cli.main version` | Print the backend version directly through Typer. |
| `uv run python -m apps.bloom_cli.main config list --storage sqlite --database-path data/bloom.db` | List configuration IDs from SQLite storage. |

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

## Configuration Storage

Bloom keeps file-backed JSON storage as the default while SQLite is validated through migration slices.

Use the configuration CLI to exercise both paths:

```bash
cd backend
uv run python -m apps.bloom_cli.main config import sandbox tests/fixtures/configuration-bundle.json --storage sqlite --database-path data/bloom.db
uv run python -m apps.bloom_cli.main config list --storage sqlite --database-path data/bloom.db
uv run python -m apps.bloom_cli.main config export sandbox data/exports/sandbox.json --storage sqlite --database-path data/bloom.db
```

Legacy `extender_ui` JSON can be imported through explicit migration commands:

```bash
uv run python -m apps.bloom_cli.main config import-legacy-screen legacy-sandbox tests/fixtures/legacy/sandbox_control.json --application-id sandbox --application-name Sandbox --storage sqlite --database-path data/bloom.db
uv run python -m apps.bloom_cli.main config import-legacy-application play-petanque tests/fixtures/legacy/application-play-petanque.json --storage sqlite --database-path data/bloom.db
uv run python -m apps.bloom_cli.main config import-legacy-application-screens petanque-admin tests/fixtures/legacy/app-petanque-admin.json tests/fixtures/legacy/default_control.json tests/fixtures/legacy/default_live_teleop.json tests/fixtures/legacy/default_petanque.json --configuration-dir data/configurations
```

The FastAPI app can already use SQLite by constructing `Settings(configuration_storage="sqlite", configuration_database_path=...)`. File-backed storage remains the fallback until the full frontend and runtime migration have passed end-to-end tests.

The first real screen migration fixture is `tests/fixtures/petanque-admin-configuration-bundle.json`. It imports the
legacy Petanque admin app shell plus three real screens so the dashboard can render migrated controls, stream placeholders,
sliders, joysticks, toggles, and command buttons end-to-end.

## Tests And Coverage

Run the main validation suite before opening PRs:

```bash
npm run check
npm run test
npm run build
cd backend
make test
```

Current coverage focus:

- Backend FastAPI/configuration tests cover API routes, repositories, JSON import/export, and real legacy fixtures.
- Frontend widget tests cover contracts, editor operations, runtime intents, legacy conversion, render descriptors, and renderer behavior.
- Dashboard tests render the first migrated legacy Petanque admin screens from a real configuration bundle fixture.
- Integration tests round-trip real legacy JSON through frontend conversion, API-client semantics, backend persistence, and widget registry rendering.
- ROS adapter tests validate publish contracts through injected gateways so generic Bloom tests do not require ROS.
- Coverage is quality-focused rather than percentage-chasing for now; critical migration paths should be tested before UI polish.
- Future work should add explicit coverage reporting once the SQLite storage layer and runtime adapters stabilize.

## ROS Runtime Boundary

Bloom exposes ROS behavior through backend adapters instead of importing ROS in generic web code.

The first runtime endpoint is:

```bash
curl -X POST http://localhost:8000/api/v1/ros/topics/publish \
  -H "Content-Type: application/json" \
  -d '{"topic":"/petanque_state_machine/change_state","message_type":"std_msgs/msg/String","payload":{"data":"activate_throw"}}'
```

Without a configured ROS gateway, the backend returns `status: "simulated"`. Robot deployments can attach an `rclpy`
publisher gateway so the same API publishes real ROS messages.

To launch the API with a ROS publisher gateway:

```bash
source /opt/ros/humble/setup.bash
source /path/to/extender_workspace/install/setup.bash
cd backend
make ros-run
```

Keep `make run` for generic web development; use `make ros-run` only in a sourced ROS environment.

## Python Environment

Use `uv` for backend dependency management and command execution whenever possible.

`uv run ...` may create a local `.venv/` next to the backend `pyproject.toml`; that environment is uv-managed and ignored by git. Do not install backend dependencies manually with `pip` unless there is a specific debugging reason.
