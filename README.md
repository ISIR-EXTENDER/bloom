<p align="center">
  <img src="docs/assets/readme/hero.png" alt="Bloom: give the gesture back. A tablet showing the Explorer Manager Drive screen with its STOP rail." width="100%" />
</p>

<p align="center">
  <a href="https://github.com/ISIR-EXTENDER/bloom/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ISIR-EXTENDER/bloom/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="ROS 2 Jazzy" src="https://img.shields.io/badge/ROS%202-Jazzy-31493f?style=flat-square" />
  <img alt="Node 24" src="https://img.shields.io/badge/Node-24%20LTS-7e967e?style=flat-square" />
  <img alt="Python 3.10 to 3.12" src="https://img.shields.io/badge/Python-3.10%E2%80%933.12-7e967e?style=flat-square" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-ffd89b?style=flat-square&labelColor=31493f" />
</p>

<p align="center">
  <a href="#why-bloom">Why Bloom</a> ·
  <a href="#watch-it-run">Watch it run</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#extender-tutorial">Extender tutorial</a> ·
  <a href="#preview">Preview</a> ·
  <a href="#design-language">Design language</a> ·
  <a href="#documentation">Documentation</a>
</p>

Bloom builds accessible web interfaces for robots and runs them in a focused kiosk. Compose screens visually, open the
saved app as a role on a tablet or desktop, and reach the robot through a policy-checked backend that keeps ROS at the
adapter boundary.

**Bloom is the active Extender operator interface (IHM).** `extender_ui` is legacy and remains only as a behaviour
reference and emergency rollback during live acceptance.

## Why Bloom

Extender's older interfaces coupled screen layout, input devices, ROS transport, and one robot. Bloom replaces that
pattern with one configurable interface system:

- **Build** reusable robot screens, controls, themes, profiles, and safety policies in the visual Builder.
- **Operate** the saved application in a focused Runtime with one explicit control owner, guarded maintenance,
  diagnostics, and a latched STOP.
- **Connect** it through FastAPI and WebSockets to ROS 2 or another machine adapter without putting transport code in
  the frontend.

Explorer Manager and Kinova Manager ship ready to run. The same model also provides accessible input profiles, a
read-only Supervisor mirror, plots, topic inspection, audit records, and shared JSON/SQLite configuration.

## Watch It Run

<p align="center">
  <a href="docs/assets/demo/bloom-demo.mp4"><img src="docs/assets/readme/demo-poster.png" alt="Play the five-minute Bloom walkthrough" width="80%" /></a>
</p>

**[Watch the five-minute walkthrough](docs/assets/demo/bloom-demo.mp4).** It creates an app and a screen in the
Builder, opens Explorer Manager as Operator, drives the arm, sends it home, switches frames in Joystick Lab, changes
Settings to Spanish, latches and resumes STOP, and reads live joint states and the Jacobian in Bloom Debug. Nothing is
mocked: it runs against `cartesian_manager`, `qontrol_controller` and the Explorer Gazebo simulation. The camera scene
uses a synthetic feed.

## Quickstart

This starts Bloom without ROS or robot hardware. You need Node.js 24 LTS, npm 11+, Python 3.10-3.12, and
[`uv`](https://docs.astral.sh/uv/).

### 1. Install

```bash
git clone https://github.com/ISIR-EXTENDER/bloom.git
cd bloom
npm install
cd backend
uv sync
cd ..
```

### 2. Run

From the repository root, start the API in one terminal:

```bash
cd backend
make run
```

Start the dashboard from the repository root in a second terminal:

```bash
npm run dev
```

### 3. Open

Visit [http://127.0.0.1:5173](http://127.0.0.1:5173). Choose **Builder** to compose an interface, or **Runtime** to
launch one of the shared applications.

The backend imports the tracked applications on first start. ROS diagnostics show `MISSING` when no ROS graph is
attached; that is expected in this quickstart and still lets you inspect the full UI safely.

## Extender Tutorial

This walkthrough connects Bloom to `cartesian_manager` and runs either Explorer in simulation or Kinova with fake
hardware. Complete the [Quickstart](#quickstart) installation first.

> [!CAUTION]
> Start with simulation or fake hardware. Bloom's STOP latches the software command path, but it does not replace the
> robot's hardware emergency stop, controller limits, or lab safety procedure. Single-switch directional teleoperation
> and combined scan-plus-dwell are still awaiting validation with the intended devices; see the
> [operator runtime guide](docs/operator-runtime.md#accessibility-profiles).

### 1. Build the Extender workspace

```bash
cd /path/to/extender_workspace
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
source install/setup.bash
```

### 2. Start one robot

For **Explorer simulation**:

```bash
cd /path/to/extender_workspace
source /opt/ros/jazzy/setup.bash
source install/setup.bash
ros2 launch cartesian_manager explorer.launch.py use_simulation:=true
```

> [!NOTE]
> On the current Jazzy install the Explorer simulation needs two runtime workarounds before the arm moves: stop the
> standalone `ros2_control_node` that blocks the Gazebo spawn, and bridge the Gazebo clock. Both are explorer_stack
> issues; the commands are in [the simulation run](docs/validation/ros-sim-e2e.md), which applies them for you.

Or, for **Kinova fake hardware**:

```bash
cd /path/to/extender_workspace
source /opt/ros/jazzy/setup.bash
source install/setup.bash
ros2 launch cartesian_manager kinova.launch.py use_simulation:=true
```

Keep that terminal running.

### 3. Start Bloom for that robot

In a new terminal, start the API with ROS adapters and the dashboard together.

For **Explorer**:

```bash
cd /path/to/bloom
EXTENDER_WORKSPACE=/path/to/extender_workspace \
BLOOM_ROBOT_NAME=Explorer \
BLOOM_ROS_COMMAND_FRAME_ID=base_link \
BLOOM_ROS_EE_FRAME_ID=ft_frame \
scripts/extender-workspace-dev.sh
```

For **Kinova**:

```bash
cd /path/to/bloom
EXTENDER_WORKSPACE=/path/to/extender_workspace \
BLOOM_ROBOT_NAME=Kinova \
BLOOM_ROS_COMMAND_FRAME_ID=base_link \
BLOOM_ROS_EE_FRAME_ID=effector_frame \
scripts/extender-workspace-dev.sh
```

The launcher sources the selected workspace, starts the ROS-enabled API on port `8000`, and starts the dashboard on
port `5173`. `Ctrl+C` stops both Bloom processes.

### Open Bloom From A Phone On The Same Wi-Fi

Keep the API on loopback and expose only Vite. Add these variables to either launcher command above:

```bash
BLOOM_FRONTEND_HOST=0.0.0.0 \
BLOOM_PUBLIC_HOST="$(hostname -I | awk '{print $1}')" \
scripts/extender-workspace-dev.sh
```

The launcher prints `Same-Wi-Fi URL: http://<lan-ip>:5173`. Open that URL from a phone or tablet on the same trusted
network. Browser API and WebSocket traffic stays on the same origin and Vite proxies it to Bloom on
`127.0.0.1:8000`; no direct API port or CORS change is needed. If a host firewall blocks it, allow TCP `5173` only from
the lab subnet. Do not port-forward this development server or use it on an untrusted network.

Every connected device reads and writes the same server-side `backend/data/bloom.db`; there are no browser-local JSON
configuration files to synchronize. Builder saves are visible after another device reloads. Avoid editing the same app
from two browsers at once because the last saved draft wins. Stop Bloom before copying the SQLite file for backup.
See the [deployment guide](docs/extender-workspace-deployment.md#same-wi-fi-access) for verification, custom ports, and
database operations.

### 4. Operate the Manager app

1. Open [http://127.0.0.1:5173](http://127.0.0.1:5173) and choose **Runtime**. The library lists the apps on this robot.
2. Select **Explorer Manager** or **Kinova Manager** to match the robot process, choose a role, and press
   **Open as Operator** or **Open as Bench**. The role opens its own Drive layout; a remembered role is marked but
   never opens by itself.
3. Before moving a control, read the kiosk bar: app, screen, status chip, command frame, publish rate, and role.
   `READY` describes the frontend-to-backend link; use the diagnostics below to verify the ROS path. A second Runtime
   tab stays inert until the first leaves and the second operator chooses **Take control**.
4. **Drive · Operator** carries plain words, **Slow / Medium / Fast** speed segments and larger targets; **Drive ·
   Bench** carries continuous speed limits in a status rail. Both send identical messages for the same gesture.
5. Hold the **⋯** button for 1.5 seconds to open **Maintenance**. Motion is held while it is open. It lists read-only
   facts and reaches **Settings**, **Switch role**, **Reload this app**, **Exit to library**, and a **More** group with
   the other screens (**Positions**, **Robot feedback**, **Command sources**, **Joystick lab**), the practice tour, the
   supervisor mirror and Help.
6. **Joystick lab** is the physical-joystick-equivalent workflow: choose a supported command frame, then use
   translation, height, rotation, pivot, modes and gripper on one screen, with the twist that was sent. Frame buttons
   stay disabled until every motion control is back at zero.
7. **Settings** adjusts the selected profile: text size, language, sound, input method (Touch, Dwell, Scan), how a push
   moves (Drag, Tap by tap, Keep going), and timing. Changes are a draft until **Save and resume**; **Discard changes**
   leaves without saving. The command frame is not a setting, because it changes what the app publishes.
8. **STOP** is always live, including over Maintenance, Settings and the practice tour. Press it to latch the command
   output, and resume only after checking the cause, with the one-second hold.
9. Open **Supervisor mirror** from the library to watch the app on a second screen. It reads live status and the shared
   STOP latch, but it has no movement, STOP, resume, publish or configured-action controls.

Both Manager apps share the same workflow. Explorer names `ft_frame` as its end-effector frame; Kinova names
`effector_frame` and adds the reviewed fault-reset action. Bloom offers `base_link` and `hybrid_frame` everywhere and
adds the end-effector frame only once a deployment names it, so no operator is offered a frame this robot's manager
would silently discard.

The operator shell is available in English, Spanish, and French, and the shipped operator words on the controls
(speeds, modes, turns, gripper verbs, directions) follow the profile's language. Topic names, frame IDs, axes and
numbers are never translated. Spanish and French still need a native speaker's review before participant use.

Before publishing an edited app, open **Builder > Apps > Open app > Review checklist**. Bloom derives geometry, minimum
sizes, sibling symmetry, pad pairs, profile coverage, command frame and topic-policy checks from the saved application.

### 5. Verify the command path

In another sourced ROS terminal:

```bash
source /opt/ros/jazzy/setup.bash
source /path/to/extender_workspace/install/setup.bash
ros2 topic info /joystick_cartesian_command
ros2 topic echo /joystick_cartesian_command
ros2 topic echo /cartesian_command
```

Move one Drive control and release it. The manager output should become non-zero while commanded and return to zero on
release. In Joystick Lab, select a frame while the controls are at zero and confirm the next
`/joystick_cartesian_command` message carries that `header.frame_id`. Bloom follows this path:

```text
browser control -> Bloom WebSocket -> ROS adapter -> /joystick_cartesian_command
                -> cartesian_manager -> /cartesian_command
```

Check Bloom itself from another terminal:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/ros/topics/status
```

The full pre-session checklist, including modes, gripper, gamepad, tablet, and STOP validation, is in
[Extender and Petanque end-to-end validation](docs/extender-petanque-validation.md).

<details>
<summary>Run on real hardware</summary>

Use the normal lab authorization and safety procedure first. Then replace the simulation launch with the matching
hardware command.

Explorer:

```bash
ros2 launch cartesian_manager explorer.launch.py use_simulation:=false
```

Kinova, replacing the address when needed:

```bash
ros2 launch cartesian_manager kinova.launch.py use_simulation:=false robot_ip:=192.168.1.10
```

</details>

## Preview

| Builder | Explorer Manager | Kinova Manager |
| --- | --- | --- |
| ![Bloom screen builder](docs/assets/screenshots/builder-screen-canvas.png) | ![Explorer Manager Drive screen](docs/assets/screenshots/runtime-explorer-drive.png) | ![Kinova Manager Drive screen](docs/assets/screenshots/runtime-kinova-drive.png) |

<details>
<summary>More product and runtime screens</summary>

| Home | Screen library | Runtime library |
| --- | --- | --- |
| ![Bloom landing page](docs/assets/screenshots/landing-page.png) | ![Bloom screen library](docs/assets/screenshots/builder-screen-library.png) | ![Bloom runtime app library](docs/assets/screenshots/runtime-library.png) |

| App configuration | Positions | Robot feedback |
| --- | --- | --- |
| ![Bloom app configuration](docs/assets/screenshots/app-configuration.png) | ![Explorer Manager positions](docs/assets/screenshots/runtime-explorer-positions.png) | ![Explorer Manager robot feedback](docs/assets/screenshots/runtime-explorer-feedback.png) |

| Joystick Lab | Command sources | Bloom Debug |
| --- | --- | --- |
| ![Explorer Manager Joystick Lab](docs/assets/screenshots/11-joystick-lab.png) | ![Explorer Manager command sources](docs/assets/screenshots/runtime-explorer-command-sources.png) | ![Bloom Debug runtime](docs/assets/screenshots/runtime-bloom-debug.png) |

</details>

The general preview set is captured from the ROS bench, so a control whose topic has no subscriber there reads as
unavailable. The Joystick Lab image and the walkthrough use a live ROS graph. Refresh the general set from a running dashboard and
isolated seeded backend with:

```bash
npx playwright install chromium
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 npm run capture:readme
```

The capture script exits non-zero for skipped screens or when the backend store differs from the committed shared
applications, so it cannot silently leave a stale image in this README.

Record the walkthrough from a seeded ROS-enabled runtime, with a visible cursor and captions. `--probe <dir>` runs it
quickly and saves one screenshot per scene instead:

```bash
BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 \
BLOOM_DEMO_ROS_SETUP=/path/to/extender_workspace/install/setup.bash \
npm run record:demo -- --camera feed.y4m
```

The recorder uses Playwright and `ffmpeg`; install Chromium with the command above and provide `ffmpeg` on `PATH`.

## What Ships Today

- Builder and kiosk runtime for shared application, screen, widget, theme, profile, and guardrail models.
- Touch, keyboard, and gamepad Cartesian input composed into one application-scoped 6-DoF command.
- Per-profile English, Spanish, and French runtime shells with an English fallback.
- Local-only guided operator practice and an action-based Builder review checklist.
- A read-only supervisor mirror with an explicit operator-ownership notice and no command client surface.
- Explorer and Kinova Manager workflows for Joystick Lab, Drive, Positions, Robot feedback, and Command sources.
- JSON and SQLite configuration storage, tracked seed applications, import/export, audit, and recording hooks.
- ROS 2 integration for `cartesian_manager`, generic topic publishing, service calls, and topic discovery.
- One 30 Hz latest-value teleop stream across every active control, with neutral commands sent immediately.
- Frontend, backend, security, contract, and visual checks in CI, plus an end-to-end run against the Explorer and
  Kinova simulations that checks each effect on the ROS graph.
- Role-based layouts: a profile names the screen it opens, and Drive ships as Bench and Operator.
- Widget cards built to the design system: minimum sizes that grow rather than clip, reserved regions for STOP,
  multi-series plot boards and pickers, a joint table, and a Jacobian with manipulability.

Single-switch directional teleoperation is covered by the current scan-step implementation and tests, but still needs
validation with the intended device. Browser reduced-motion preferences work; the equivalent saved profile setting
still needs wiring. Track these and the current design review in [the UX design handoff](docs/ux-design-handoff.md).

## Product Status

New Extender IHM work belongs in Bloom. The remaining work is explicit:

1. Complete the open design work: the 1024×600 collapse layouts, paired desktop apps, the save-a-pose flow, and
   deliberate handover only if supervisors are later allowed to command.
2. Validate the Bloom IHM on the target tablets, assistive inputs and robots. The simulations are covered by
   `npm run e2e:sim`, and visual servoing has been driven from Bloom on the new architecture.
3. Keep `extender_ui` rollback artifacts until the relevant live sessions are accepted.
4. Retain generic web/ROS boundaries so Bloom can serve robots beyond Extender.

Low-level Extender ROS packages remain active dependencies. The archived Petanque path keeps its explicit legacy
adapter until its future is decided.

## Design Language

<p align="center">
  <img src="docs/assets/readme/design-language.png" alt="Bloom design language: Cormorant Garamond headings, Atkinson Hyperlegible operator words, JetBrains Mono readouts, and the forest, sage, mist, cream, pollen, petal, lilac and STOP palette." width="100%" />
</p>

Bloom's interface is calm on purpose. Operator words use Atkinson Hyperlegible, readouts and topics a monospace face,
and colour carries meaning rather than decoration: forest for what is selected, pollen for what is held, lilac only in
Bloom Debug, and the STOP red nowhere else. Every widget declares a minimum size and grows rather than clips, and STOP
lives in a reserved region widgets cannot enter. The tokens, prototypes and screen specs are tracked in
[docs/design](docs/design); the artwork on this page is rendered from those tokens with
`node scripts/render-readme-art.mjs`.

## Repository Shape

```text
bloom/
  frontend/
    apps/bloom-dashboard/      # React product shell
    libs/api-client/           # Typed API client
    libs/ui/                   # Bloom design-system primitives
    libs/widgets/              # Widget contracts and settings
    libs/widget-renderers/     # Builder/runtime widget rendering
  backend/
    apps/bloom_api/            # FastAPI app
    apps/bloom_cli/            # Typer CLI
    libs/config/               # Configuration domain, JSON, SQLite
    libs/ros_adapters/         # Optional ROS 2 boundary
    libs/sessions/             # Runtime sessions, audit, recording, teleop
  docs/
```

## Shared Applications

The first time the backend starts it imports the applications committed under
`backend/seed/applications/`: Explorer Manager, Kinova Manager, Sandbox V0.0,
Explorer User Tests, Petanque Admin, Bloom Debug, and the webcam demo. A fresh clone comes up
with the same app library everyone else has.

Your own store lives in `backend/data/`, which is not tracked. Seeding never
overwrites an application you already have, so screens you rearrange in the
builder stay yours. To reset one back to the committed version, or to import
anything that is missing:

```bash
cd backend
uv run python -m apps.bloom_cli.main config seed
uv run python -m apps.bloom_cli.main config seed --force explorer-manager
```

To share an app you have built or changed, publish it and commit the file it
writes:

```bash
uv run python -m apps.bloom_cli.main config publish explorer-manager
git add ../backend/seed/applications/explorer-manager.json
```

To see what you have not shared yet:

```bash
uv run python -m apps.bloom_cli.main config status
```

It reads whichever store is configured and marks each application `shared`, `outdated`, `edited`, `local`, `missing`,
or `deleted`. The [operator guide](docs/operator-runtime.md#shared-applications-and-local-state) says what each means.

## Extender Reference

The [Extender tutorial](#extender-tutorial) is the normal development path. Its launcher accepts these useful
overrides:

- `EXTENDER_WORKSPACE` or `EXTENDER_SETUP_FILE` selects the ROS workspace to source. The default is an
  `extender_workspace` checkout next to this repository.
- `BLOOM_API_HOST` / `BLOOM_API_PORT` and `BLOOM_FRONTEND_HOST` / `BLOOM_FRONTEND_PORT` change the listening addresses.
- `BLOOM_API_PROXY_TARGET` overrides Vite's server-side API target; the launcher derives it from `BLOOM_API_PORT` by
  default.
- `BLOOM_PUBLIC_HOST` controls the same-Wi-Fi URL printed for wildcard frontend binds.
- `BLOOM_APPLY_TABLET_TOUCH_MAP=1` applies the target tablet's touch mapping before startup.

To run only the ROS-enabled API:

```bash
source /opt/ros/jazzy/setup.bash
source /path/to/extender_workspace/install/setup.bash
cd /path/to/bloom/backend
make ros-run
```

Useful validation endpoints:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/ros/topics
curl -fsS http://127.0.0.1:8000/api/v1/runtime/audit
```

The full Extender/Petanque validation protocol is in
[docs/extender-petanque-validation.md](docs/extender-petanque-validation.md).
The kiosk, controls, profiles, gamepad, and command-frame contract is in the
[operator runtime guide](docs/operator-runtime.md). Deployment settings and tablet startup are in the
[Extender workspace deployment guide](docs/extender-workspace-deployment.md).

Bloom changes a mode or toggle only after the runtime acknowledges the command. **Not sent** means the configured
gateway simulated the request; **Command failed** means it was blocked, unsupported, or failed. In both cases the
control keeps its previous state, so never read a visual toggle change as proof of robot motion.

Useful contract checks:

```bash
npm run validation:extender
npm run validation:frontend-backend
npm run validation:sandbox-runtime
npm run validation:sandbox-tablet
npm run validation:visual-servoing
npm run validation:petanque-parity
```

## Architecture

Core rules:

- Generic frontend/backend code must not import ROS directly.
- ROS-specific code belongs in `backend/libs/ros_adapters`.
- Widgets describe intent and settings; adapters decide how those intents reach a robot or machine.
- Runtime safety is enforced in the backend through allowlists, rate limits, validation, and audit logs.
- One backend runtime session owns robot commands at a time; STOP remains available to every authenticated operator.
- The builder and runtime must render the same screen model; runtime only removes editor affordances.
- App-specific visual identity belongs in app theme tokens, not hard-coded widget styles.

This keeps Bloom reusable for Extender, Petanque, non-ROS lab machines, and future supervision apps.

## Configuration Storage

Bloom supports file-backed JSON and SQLite:

```bash
cd backend
uv run python -m apps.bloom_cli.main config list --storage file
uv run python -m apps.bloom_cli.main config list --storage sqlite --database-path data/bloom.db
```

SQLite is the default store, at `backend/data/bloom.db`. It keeps the full configuration bundle plus normalized rows
for applications, screens, widgets, and theme assets. A machine that still has a file-backed
`backend/data/configurations/` is carried across into it the first time the API starts, so nothing is left behind.

File storage remains available with `BLOOM_CONFIGURATION_STORAGE=file`, and JSON stays the interchange format: the
shared bundles, `config import` / `config export`, and `config publish` all speak it whichever store is configured.
The app/screen API save-load flow and its differences from `extender_ui` are documented in
[docs/runtime-flow-vs-extender-ui.md](docs/runtime-flow-vs-extender-ui.md).

Legacy JSON helpers:

```bash
uv run python -m apps.bloom_cli.main config import-legacy-screen legacy-sandbox tests/fixtures/legacy/sandbox_control.json
uv run python -m apps.bloom_cli.main config import-legacy-application play-petanque tests/fixtures/legacy/application-play-petanque.json
```

## Security Defaults

Local development keeps authentication disabled. Shared lab, staging, and production-style runs should enable API keys
and explicit CORS origins:

```bash
export BLOOM_AUTH_ENABLED=true
export BLOOM_ADMIN_API_KEY='replace-with-admin-secret'
export BLOOM_OPERATOR_API_KEY='replace-with-operator-secret'
# Read-only: a supervisor mirror that cannot command the arm.
export BLOOM_OBSERVER_API_KEY='replace-with-observer-secret'
export BLOOM_CORS_ALLOWED_ORIGINS='http://tablet.local:5173,http://dashboard.local:5173'
export BLOOM_RUNTIME_CONTROL_REQUIRED=true
```

### ROS Command Backend

```bash
# cartesian_manager (default) or teleop_command for the legacy rollback path
export BLOOM_ROS_COMMAND_BACKEND=cartesian_manager
# A frame the manager knows: base_link, ft_frame/effector_frame, or hybrid_frame
export BLOOM_ROS_COMMAND_FRAME_ID=base_link
```

Since `cartesian_manager` PR #6, `frame_id` selects the frame the rotation part
is interpreted in: `base_link` is summed directly, `ft_frame` or
`effector_frame` is rotated into base with the live pose, and `hybrid_frame`
uses the manager's hybrid pose. The linear component follows the manager's base
convention. An unknown frame is rejected by Bloom when outside its deployment
allowlist and skipped by the manager if it reaches it. There is no general TF
lookup.

The deployment value is the fallback. In **Builder -> App configuration ->
Adapter guardrails**, set **Cartesian command frame** as the runtime-session
default. Joystick Lab may switch to another supported frame while the composed
twist is zero. Every virtual control and physical gamepad contribution still
shares the one effective session frame shown in the kiosk bar.

Use `X-Bloom-API-Key` for API calls. Admin keys can mutate configuration; operator keys can read configuration and use
runtime/ROS endpoints. Robot-facing HTTP calls also carry the browser's opaque `X-Bloom-Runtime-Session` lease. Bloom
sets that header itself; it is not an operator credential. Production settings intentionally fail to start without
authentication, an admin key, and runtime ownership enforcement.

Security docs:

- [docs/security-baseline.md](docs/security-baseline.md)
- [SECURITY.md](SECURITY.md)

## Testing

Run everything CI runs, in CI's order, before pushing:

```bash
npm run verify
```

It lints and tests the backend, then lints, builds and tests the frontend, audits dependencies, and runs the visual
gate. It warns when the working tree is dirty, because a push only carries what is committed. The individual steps are:

```bash
npm run check          # Biome lint and format
npm run build
npm run test
npm run visual:smoke
cd backend
make lint              # ruff lint and format check; `make format` applies formatting
make test
```

Additional checks:

```bash
npm run validation:extender
npm run e2e:sim -- --robot explorer   # or kinova: Bloom against the ROS simulation, no mocks
npm run validation:sandbox-tablet
npm run validation:sandbox-runtime
npm run validation:visual-servoing
npm run visual:smoke
npm run audit:security
npm run security:dynamic
```

Backend tests intentionally disable external pytest plugin autoloading so a sourced ROS environment cannot leak
ROS-specific pytest plugins into generic Bloom tests.

CI runs the backend on Python 3.10 and 3.12, the supported floor and the deployed version. Dependabot opens weekly pull
requests for npm, uv and GitHub Actions, grouping minor and patch updates; majors arrive one at a time.

## Tooling

| Tool | Recommended | Used for |
| --- | --- | --- |
| Node.js | `24` LTS, pinned in `.nvmrc` | Frontend workspaces, Vite, React, TypeScript tests. |
| npm | `>=11` | Workspace dependencies and frontend scripts. Ships with Node 24. |
| uv | latest stable | Backend dependency locking, tests, and CLI commands. |
| GitHub CLI | latest stable | PR creation, CI checks, and squash-merge workflow. |
| Playwright | installed through npm | Browser checks and README screenshots. |

Local work and CI both run Node.js 24, the current LTS line, read from `.nvmrc`; `npm run verify` refuses a Node
older than the `engines.node` floor in `package.json`, patch release included. On Ubuntu with the NodeSource repository, upgrade with:

```bash
sudo sed -i 's|node_[0-9]*\.x|node_24.x|' /etc/apt/sources.list.d/nodesource.list
sudo apt update
sudo apt install -y nodejs
node --version   # v24.x
```

Node 26 becomes LTS on 28 October 2026; move `.nvmrc` then.

## Documentation

High-signal project docs:

- [docs/README.md](docs/README.md)
- [docs/operator-runtime.md](docs/operator-runtime.md)
- [docs/design](docs/design): the design handoff, screen specs and implementation reviews
- [docs/validation/ros-sim-e2e.md](docs/validation/ros-sim-e2e.md)
- [docs/design-system.md](docs/design-system.md)
- [docs/component-styleguide.md](docs/component-styleguide.md)
- [docs/widget-ux-review.md](docs/widget-ux-review.md)
- [docs/production-readiness-review.md](docs/production-readiness-review.md)
- [docs/accessibility-plan.md](docs/accessibility-plan.md)
- [docs/ux-design-handoff.md](docs/ux-design-handoff.md)
- [docs/extender-tablet-hardware.md](docs/extender-tablet-hardware.md)
- [docs/extender-workspace-deployment.md](docs/extender-workspace-deployment.md)
- [docs/extender-petanque-validation.md](docs/extender-petanque-validation.md)
- [docs/legacy-retirement-gates.md](docs/legacy-retirement-gates.md)

Design decisions and migration notes live in [docs/decisions](docs/decisions). Add a new decision when an architectural,
UX, security, or adapter choice would be hard to infer from code alone.

## License

MIT. See [LICENSE](LICENSE).
