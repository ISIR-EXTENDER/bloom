<p align="center">
  <img src="frontend/apps/bloom-dashboard/public/logo.png" alt="Bloom logo" width="220" />
</p>

<p align="center">
  Configurable web interfaces for robot teleoperation, supervision, and device control.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-7f987f?style=for-the-badge" /></a>
  <img alt="React" src="https://img.shields.io/badge/React-19-f4efe4?style=for-the-badge&logo=react&logoColor=1d3a31" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-Backend-7f987f?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img alt="ROS ready" src="https://img.shields.io/badge/ROS-adapters-dfa83b?style=for-the-badge" />
</p>

<p align="center">
  <a href="#preview">Preview</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#tooling">Tooling</a> ·
  <a href="#architecture-rules">Architecture</a> ·
  <a href="docs/design-system.md">Design System</a> ·
  <a href="docs/component-styleguide.md">Components</a> ·
  <a href="docs/widget-ux-review.md">Widget UX</a> ·
  <a href="docs/production-readiness-review.md">Readiness</a> ·
  <a href="docs/extender-tablet-hardware.md">Tablet Hardware</a> ·
  <a href="docs/extender-workspace-deployment.md">Extender Deployment</a> ·
  <a href="docs/extender-petanque-validation.md">Validation</a> ·
  <a href="#tests-and-coverage">Tests</a> ·
  <a href="docs/security-baseline.md">Security</a> ·
  <a href="docs/accessibility-plan.md">Accessibility</a> ·
  <a href="docs/widgets-screens-apps-foundation-plan.md">Foundation Plan</a>
</p>

Bloom is a configurable web interface framework for robot teleoperation, supervision, and device control.

It starts from the current Extender tablet interface and UI work, but the goal is broader: keep the web product generic enough for ISIR lab projects, while integrating with Extender through a clean ROS adapter layer.

Bloom is not limited to ROS projects. A non-ROS workspace could use the same builder, screens, widgets, SQLite storage,
and runtime API while replacing the ROS adapter with another integration layer, such as an HTTP API, WebSocket service,
MQTT bridge, C++ supervision gateway, or future Zenoh-based adapter. In that model, Extender is one workspace/project,
Petanque and Sandbox are apps inside it, and another lab machine could have its own project with apps that supervise or
control a different backend.

## What Bloom Gives You

| Build apps visually | Keep ROS isolated | Ship reusable widgets |
| --- | --- | --- |
| Compose apps, screens, layouts, and app-level design tokens from a tablet-friendly builder. | Frontend and generic backend logic stay independent from ROS; robot or machine behavior enters through adapters. | Widgets are described by contracts so they can be reused across Extender, Petanque, and future ISIR apps. |

## Preview

These screenshots are refreshed as the Bloom UI foundations evolve.

| Landing page | Builder home | App configuration |
| --- | --- | --- |
| ![Bloom landing page](docs/assets/screenshots/landing-page.png) | ![Bloom builder home](docs/assets/screenshots/builder-home.png) | ![Bloom app configuration](docs/assets/screenshots/app-configuration.png) |

To update them locally, run the backend and dashboard, then capture the current UI:

```bash
npm run capture:readme
```

## Work In Progress

Bloom is currently moving from foundation and legacy migration work toward deployment hardening:

Current review snapshot: Bloom has completed the Phase 4 legacy widget/app foundation and has started Phase 5 deployment
hardening. Command allowlists, command rate limits, runtime audit, topic catalog, recording gateway, Bloom Debug
controls, reusable command presets, app runtime policies, migrated fixture apps, seeded runtime smoke tests, API-key
roles, configurable CORS, global HTTP rate limiting, and dependency audit scripts are in place. The next focus is deeper
full-robot validation, normalized SQLite bundle reconstruction, concrete robot action adapters, and deployment entrypoints
before legacy retirement. See `docs/production-readiness-review.md` and `docs/migration-plan.md` for the current roadmap.

- Product navigation now separates the landing page from builder and runtime previews.
- Product routes now reset scroll/focus to useful page context, so browser and in-app navigation keep standard
  affordances instead of landing mid-page.
- The dashboard can load configurations, select applications/screens, and render a canvas preview from widget contracts.
- Builder drafts can now be saved or discarded through the configuration API.
- App configuration can edit app identity, app-level design tokens, create/duplicate screens, and reuse screens from other apps.
- App configuration is now part of visual smoke coverage because it is a primary builder workflow.
- App configuration now starts feeling more tactile: reusable screens are grouped by type and can be dragged into an app
  flow, with buttons kept as accessible fallbacks.
- App configuration can reorder screens with drag/drop or explicit Move up/down buttons, so tablet users are not forced
  into a single interaction style.
- The shared screen library now shows on-demand content previews so reusable screens stay easy to scan before editing or
  launching runtime preview.
- The builder includes a Playground section for quick runtime checks before users create or save a full app workflow.
- App themes can save inspiration references such as a moodboard image and website URL; moodboard images now go through
  a backend asset endpoint instead of being embedded as data URLs in app config.
- App and screen saves now use dedicated backend API endpoints, and SQLite keeps normalized mirror tables for apps,
  screens, widgets, and theme assets while preserving JSON import/export.
- A Help / Get Started page is available from the top navigation and explains current Bloom workflows step by step.
- A first security baseline now documents minimum web/API/ROS controls, with API security headers covered by tests.
- Builder screens can add, duplicate, and remove widgets from the shared widget palette.
- Builder inspectors render widget title and settings fields from shared widget contracts.
- App configuration can now edit runtime command guardrails and reusable command presets, so recurring ROS/state-machine
  actions can be shared across widgets without hard-coding robot behavior in Bloom core.
- App configuration exposes a first command preset library and can synchronize publish-topic/message-type guardrails from
  the presets selected for the app.
- Runtime apps render without builder controls, scale `fit` canvases to the viewport, and show safe coming-soon states for empty screens.
- Runtime apps no longer reserve Bloom Debug layout space unless the debug panel is mounted, giving operator controls
  more useful room on tablet viewports.
- Runtime display widgets now include useful first foundations for labels, gauges, lightweight plots, and robot-3D
  extension placeholders instead of generic placeholder text.
- Lightweight plots support area, sparkline, and bar variants with units and optional Y bounds for simple telemetry
  screens before Bloom needs a heavier chart dependency.
- Runtime feedback widgets now include a generic `event-log` primitive with severity filtering and calm operator-facing
  defaults, so logs can become readable events instead of raw console noise.
- A first `Explorer User Tests` candidate fixture demonstrates control modes, action progress metadata, supervision,
  debug, and profile-ready screens without coupling Bloom core to Explorer-specific semantics.
- Seeded app fixtures are tested so shipped apps do not accidentally include empty runtime screens.
- Runtime now starts from an app library, offers recently opened app shortcuts, and keeps small edit shortcuts back to
  the current app or screen.
- Backend runtime sessions expose a WebSocket contract for live UI connections, topic subscriptions, topic samples, and teleop command acknowledgements.
- Runtime topic-publish intents dispatch through the backend ROS publish endpoint with simulated status when ROS is not configured.
- Runtime command safety includes topic/message/payload allowlists, command rate limits, and audit records for HTTP ROS
  publishes and WebSocket teleop commands.
- Apps can declare runtime adapter policies for allowed publish topics, message types, recording topics, and teleop
  targets; the frontend uses them for early feedback while the backend remains the final safety boundary.
- Mode-aware joystick intents can now map to runtime teleop commands and, in ROS mode, publish Extender `TeleopCommand`
  messages on `/teleop_cmd`.
- One-shot command buttons can now carry optional ROS topic/message/payload settings and shared presets for common
  commands such as state-machine transitions, emergency stop, and digital output triggers.
- Saved-position save/replay/cancel flows are modeled as generic command presets, so richer preset variants can be wired
  later through adapters without introducing Explorer-specific widgets in Bloom core.
- The Explorer user-test candidate includes a saved-position screen built from generic command buttons, so save/replay
  and cancel flows can be validated before adapter-specific wiring exists.
- The Explorer user-test candidate includes a safety-zone screen that models QP/safety workflows with generic status,
  command, and event widgets.
- The Explorer user-test candidate includes a guided drink-mode task screen that stays generic enough for other
  assistance workflows.
- The Explorer user-test candidate includes a favorites screen for fast operator shortcuts while keeping favorites as
  app-level commands for now.
- Petanque-style trajectory input is now covered by a generic `gesture-pad` widget that emits angle/power intents while
  keeping ROS topics and app semantics configurable.
- A sandbox teleop lab screen validates joystick and scalar slider bindings against the ROS sandbox simulation.
- A first Bloom Debug fixture can request runtime topic subscriptions and render live samples in echo and lightweight plot widgets.
- Bloom Debug topic plots now render first-party live SVG telemetry with area, sparkline, or bar variants, keeping the
  latest value prominent without adding a heavier chart dependency.
- Bloom Debug can inspect the topic catalog, refresh runtime audit records, start/stop a safe recording request for
  selected topics, and use topic echo pause/clear/copy actions during live debugging.
- Petanque, Sandbox, Bloom Debug, Explorer User Tests, and Webcam demo fixtures are smoke-tested in runtime so migrated
  apps do not silently regress to blank or unfinished screens.
- Runtime canvases keep builder geometry intact while fitting to the viewport.
- Visual smoke checks now cover landing, builder home, app configuration, and runtime at `1024x600`, `1280x800`, and
  `1920x1080`.
- The visual direction is moving toward a light Bloom theme: beige, grey, white, high readability, tablet-friendly targets.
- Runtime/status UX is intentionally calm: backend/API status can be shown first, while robot/ROS/network indicators
  must come from explicit adapters before Bloom claims they are connected.
- Next major pieces are deployment/security hardening, bundle reconstruction from normalized SQLite rows, concrete
  rosbag adapter wiring, deploy/repli action adapters, and full Extender/Petanque robot validation.

## In-App Help

Bloom includes a Help page in the dashboard so future users can learn the product without reading the codebase first.
The guide covers what Bloom can do, how to create/configure apps, how to reuse screens, how to edit a WYSIWYG canvas,
and how to preview runtime screens.

The Help page also contains a small documentation freshness card. For now the dates are manually maintained in
`frontend/apps/bloom-dashboard/src/help/help-content.ts`; update them when user-facing workflows or docs change. Later,
Bloom can replace the code reference date with GitHub release or commit metadata.

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
      sessions/
  docs/
```

Planned libraries such as frontend transport bridges, backend device abstractions, and structured logging should be
added only when the corresponding migration slice needs them.

## Architecture Rules

- Generic web logic must not depend directly on ROS.
- ROS-specific code belongs in `backend/libs/ros_adapters`.
- Non-ROS integrations should use the same adapter boundary instead of leaking protocol-specific code into widgets.
- Extender-specific configuration belongs in deployment/configuration, not low-level shared libraries.
- Robot commands must pass through typed backend validation and future topic/message allowlists before reaching ROS.
- Development is local-first; do not add deployment tooling before there is a concrete need.
- Migration must be iterative: no legacy file is deleted until the replacement is tested and accepted.
- Tests should arrive with each migrated slice, not after the migration is done.

## Accessibility

Bloom treats accessibility as part of the product foundation, not as a final polish pass. The dashboard should stay
keyboard reachable, readable on tablets, understandable without color alone, and calm enough for real robot operation.

See `docs/accessibility-plan.md` for the current accessibility statement, quick wins, and testing roadmap. When changing
UI, docs, interactions, or app themes, include an accessibility check in the PR.

## Validation And Legacy Retirement

Phase 5 validation is tracked in `docs/extender-petanque-validation.md`. Legacy retirement rules are tracked in
`docs/legacy-retirement-gates.md`.

Short version: do not delete or archive legacy workflows during the transition. `extender_ui`, `tablet_interface`, and
Petanque packages remain rollback paths until Bloom is validated end-to-end and accepted by users.

## Extender Workspace Deployment

Bloom now includes a transition launcher for the Extender lab workspace:

```bash
scripts/extender-workspace-dev.sh
```

It sources the Extender ROS workspace, starts the Bloom API with ROS adapters, and starts the dashboard dev server. See
`docs/extender-workspace-deployment.md` for variables, tablet mapping, validation steps, and the legacy-retirement rule.

## Extender Tablet Target

The current Extender touchscreen target and Linux calibration workflow are documented in
`docs/extender-tablet-hardware.md`. It includes the HMTECH screen specs, the `xrandr` / `xinput` commands currently used
for touch mapping, automation options, and the viewport sizes Bloom should validate: `1024x600` and `1920x1080`.

## Design System

Bloom's design system is documented in `docs/design-system.md`. It explains the mood-board direction, token model,
theme presets, touch/tablet rules, runtime/builder guidelines, and current critiques.

Typography is controlled through open-source fonts bundled by `@bloom/ui`: `Cormorant Garamond` for refined display,
`Atkinson Hyperlegible` for readable UI text, and `JetBrains Mono` for debug/code-like values.

Reusable component examples and promotion rules live in `docs/component-styleguide.md`. Visual smoke checks cover the
key tablet/desktop viewports and primary product routes with `npm run visual:smoke`.

Widget-specific usability notes live in `docs/widget-ux-review.md`. Update it when a widget family changes behavior,
touch affordances, or runtime/debug information density.

When adding UI, prefer semantic Bloom tokens from `@bloom/ui`, keep app-specific visual identity in theme presets or app
configuration, and update the design system notes when a reusable pattern becomes stable.

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
| `make audit` | Run Python dependency vulnerability audit through `pip-audit`. |
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
The proxy also forwards runtime WebSocket traffic, so local joystick teleop uses `/api/v1/runtime/ws` from the browser.

## Security And Deployment Defaults

Local development keeps authentication disabled so UI and adapter work stays fast. Staging and production deployments
should enable API-key authentication and restrict dashboard origins:

```bash
export BLOOM_AUTH_ENABLED=true
export BLOOM_ADMIN_API_KEY='replace-with-admin-secret'
export BLOOM_OPERATOR_API_KEY='replace-with-operator-secret'
export BLOOM_CORS_ALLOWED_ORIGINS='http://tablet.local:5173,http://dashboard.local:5173'
```

Use the `X-Bloom-API-Key` header for API calls. Admin keys can mutate apps, screens, and assets; operator keys can read
configuration and use runtime/ROS endpoints. Production settings intentionally fail to start without authentication and
an admin key.

Dependency audits:

```bash
npm run audit:security
```

Basic dynamic security smoke against a running backend:

```bash
npm run security:dynamic
```

Set `BLOOM_SECURITY_SCAN_BASE_URL`, `BLOOM_SECURITY_SCAN_ORIGIN`, and `BLOOM_SECURITY_SCAN_API_KEY` when scanning a
non-default staging deployment.

The backend test target disables external pytest plugin autoloading so a sourced ROS environment cannot leak ROS-specific pytest plugins into Bloom's generic tests.

The backend API starts under `/api/v1`, with `/api/v1/health` as the first system endpoint.

Backend developer commands are exposed through the Typer CLI in `backend/apps/bloom_cli`.

## Tooling

Bloom is developed with a small local-first toolchain. Keep these tools available before contributing:

| Tool | Recommended | Used for |
| --- | --- | --- |
| Node.js | `>=20` | Frontend workspaces, Vite, React, TypeScript tests. |
| npm | `>=10` | Workspace dependency installation and frontend scripts. |
| uv | latest stable | Backend Python dependency locking, tests, and CLI commands. |
| GitHub CLI | latest stable | PR creation, CI checks, and squash-merge workflow. |
| Playwright | installed through npm | Browser-level checks and README screenshot capture. |

Useful setup and verification commands:

```bash
# JavaScript and browser tooling
npm install
npx playwright install chromium

# Python tooling
uv self update
cd backend
uv lock --check
uv sync

# GitHub CLI tooling
gh auth status
gh pr checks --help
```

If `gh` was installed locally, make sure `~/.local/bin` appears before `/usr/bin` in `PATH` so the recent GitHub CLI is used. The modern CLI is useful for commands such as `gh pr checks --watch`.

## Configuration Storage

Bloom keeps file-backed JSON storage as the default while SQLite is validated through migration slices.

SQLite now stores the full configuration bundle plus normalized mirror rows for applications, screens, widgets, and
theme assets. The full bundle remains the lossless migration bridge while the normalized schema stabilizes.

Use the configuration CLI to exercise both paths:

```bash
cd backend
uv run python -m apps.bloom_cli.main config import sandbox tests/fixtures/configuration-bundle.json --storage sqlite --database-path data/bloom.db
uv run python -m apps.bloom_cli.main config import webcam-visualizer tests/fixtures/webcam-visualizer-configuration-bundle.json --storage sqlite --database-path data/bloom.db
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

The first standalone demo app fixture is `tests/fixtures/webcam-visualizer-configuration-bundle.json`. It validates a
local browser webcam screen without ROS first, then leaves room for future ROS camera adapters.

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

Without a configured ROS gateway, the backend returns `status: "simulated"`. Robot deployments can attach `rclpy`
gateways so the same API publishes real ROS messages, runtime WebSocket teleop commands publish
`extender_msgs/msg/TeleopCommand` on `/teleop_cmd`, and topic subscriptions stream `topic_sample` messages back to
debug widgets.

To launch the API with a ROS publisher gateway:

```bash
source /opt/ros/humble/setup.bash
source /path/to/extender_workspace/install/setup.bash
cd backend
make ros-run
```

Keep `make run` for generic web development; use `make ros-run` only in a sourced ROS environment.
Generated ROS Python messages require `numpy`, so it is part of the backend dependency set even though the generic web
API can still run without ROS sourced.

## Python Environment

Use `uv` for backend dependency management and command execution whenever possible.

`uv run ...` may create a local `.venv/` next to the backend `pyproject.toml`; that environment is uv-managed and ignored by git. Do not install backend dependencies manually with `pip` unless there is a specific debugging reason.
