# Architecture

Bloom is split into product apps and reusable libraries.

Bloom is the active Extender IHM. `extender_ui` is legacy; its fixtures and interaction history may inform Bloom, but
new product behavior belongs in this architecture.

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
- Runtime apps: renders a chosen robot interface as a kiosk, with only truthful operating state and the fixed STOP on
  the primary surface. Navigation, diagnostics, screen switching, and editing live behind a deliberate maintenance hold.
- Supervisor mirror: renders a selected app's read-only status on a separate stable route. It observes connection,
  robot, configured default frame, STOP latch, and topic readiness while the operator runtime retains every command
  control.
- Help page: explains current workflows step by step and keeps a visible freshness signal for handover.

Screen previews, canvas builders, and runtime apps do not belong on the landing page. The landing page routes into the
actual Builder and Runtime products.

Current refactoring direction:

- Keep the top-level app shell responsible for theme, navigation, and route selection only.
- Move builder orchestration into focused builder route/controllers.
- Move runtime orchestration into focused runtime route/controllers.
- Keep configuration selection and persistence glue separate from presentational pages.
- Avoid letting `App.tsx` become the long-term home for product logic as builder/runtime features grow.

## Builder Composition

The builder has two product levels:

- App configuration: edits app identity, app-level design tokens, and which existing screens belong to the app.
- Screen builder: edits one selected screen in a full-page WYSIWYG canvas with builder-only controls.
- Screen library: exposes reusable screens across apps with search, grouping, visual preview, builder entry, and runtime
  preview.
- Playground: opens selected runtime screens quickly for smoke tests before users commit to a saved app workflow.

Configurations are stored in SQLite by default (`0123`), which keeps the lossless bundle alongside normalized app,
screen, widget, and asset rows. Reads rebuild from the normalized rows, so a field added to `ApplicationConfig` must be
added to the mirror as well or it is silently dropped on the way out. File storage stays available with
`BLOOM_CONFIGURATION_STORAGE=file`.

A store is migrated once, when its repository is built, and never again on a read: migrating per call opened a write
transaction even with nothing pending, so a listing failed while the CLI held a write. Connections run in WAL with a
15 s busy timeout, so the API keeps reading the last committed version while `config seed` writes.

SQLite upgrades are ordered and transactional (`0130`). The canonical bundle backfills document fields introduced
after an older normalized schema, and Bloom refuses a database or configuration document written by a newer schema.
Every normalized field addition therefore needs a numbered migration and an old-schema snapshot test; rerunning the
latest table builder is not a migration.

Applications the team shares are committed as JSON under `backend/seed/applications/` and imported into whichever store
is configured when it is missing them (`0122`). That is the split: JSON is the interchange format, the store is runtime
state. Seeding never overwrites, so a machine's own screen layouts survive; `bloom config publish` is how local work
becomes shared.

The app configuration page is also the screen lifecycle hub: users can create blank screens, duplicate existing screens,
add reusable screens from other apps, reorder screens, remove screens from the current app, then save/discard the draft
composition. It owns application-wide runtime guardrails, including the default Cartesian command frame and allowed
publish, recording, teleop, and service targets. Runtime may
select another supported frame for the current session only while motion is zero; virtual controls and physical
gamepads continue to share one effective frame.

Its Builder review is a derived validation surface, not another configuration model. Geometry, interactive bounds,
overlap, command frame, and widget destinations are read from the saved application; profile preview and JSON export
are recorded only when those real actions occur.

## Save And Load Flow

The browser is never the source of truth. An edit travels the same path every time:

1. The builder edits an `ApplicationConfig` or a `ScreenConfig`.
2. The dashboard calls `PUT /api/v1/configurations/{config_id}/applications/{app_id}`, or
   `PUT /api/v1/configurations/{config_id}/applications/{app_id}/screens/{screen_id}` for one screen.
3. The backend repository persists it. With SQLite it writes the full JSON bundle plus normalized rows for apps,
   screens, widgets, runtime policies, action presets, profiles, and theme assets.
4. Later reads reconstruct from the normalized rows when they exist, with the bundle JSON as the export and migration
   fallback.
5. The runtime library opens the saved app and screen through the same API contract.

Saved apps and screens survive a backend restart, and the legacy JSON fixtures under `backend/tests/fixtures/legacy/`
still round-trip through the configuration API.

## Runtime Action Flow

Command widgets emit generic intents such as `explorer.deploy`, `explorer.repli`, or `explorer.pose.load.home`. The
dashboard posts them to `POST /api/v1/runtime/actions` with `config_id`, `app_id`, and either `preset_id` or `command`.
Robot-facing HTTP requests carry the WebSocket session ID in `X-Bloom-Runtime-Session`, and the backend checks that
lease both when it authorizes the request and again at the final adapter operation. STOP is exempt; resume is not.

The backend then reloads the saved configuration, resolves the command against the app's saved `action_presets`,
rejects anything no saved preset backs, parses the payload, applies the app runtime policy, applies the global ROS
policy and rate limit, publishes through the configured gateway, and audits the accepted or rejected operation.

The browser can therefore ask for a saved command, but it cannot invent a topic, message type, or payload for a
concrete robot action. Direct topic-publish widgets stay supported for debug and simple controls, and they pass the
same policy, payload, rate-limit, and audit path.

The details the robot side observes are preserved deliberately: joystick values stay normalized to the unit-disk
contract, teleop uses the runtime WebSocket `teleop_cmd` contract against configured targets such as
`/joystick_cartesian_command`, several widgets and a physical gamepad compose one 6-DoF twist with per-axis scaled dead
zones and release-to-zero, and one effective Cartesian command frame stamps every contribution.

## Runtime Composition

Runtime uses the same screen model, widget layout model, and renderer pipeline as the builder. The difference is chrome
and input orchestration: builder tools surround the renderer, while runtime provides a 44 px kiosk bar, backend-latched
STOP, profile behavior, and input composition around the canonical artboard. ADR 0127 fixes that shared bar at 44 px;
screen-local headers consume the remaining body rather than changing the kiosk budget.

The runtime entry point is an app library, not the last selected builder app. This keeps the user flow explicit:

- choose an app to operate;
- resume a recently opened app when useful;
- verify the app, robot, connection, profile, and command frame in the kiosk bar;
- operate the app without builder or product navigation under the hand;
- hold for maintenance before switching screens, opening diagnostics, or returning to editing.

Touch, keyboard, step/latch/dwell behavior, composable switch scanning, and browser gamepads belong above the adapter
boundary. They are designed to produce normalized contributions for the same runtime intent and teleop composer, so ROS
adapters receive a composed command rather than knowledge of the device. Scanning renders directional step targets,
and dwell can activate either a direct target or the highlighted target through SWITCH without changing the adapter.

`RuntimeSessionManager` owns the command lease. The WebSocket session claims and releases it explicitly; the API client
adds that session ID to robot-facing HTTP requests. A final server-side execution gate serializes those operations with
lease release, so a command that passed initial authorization cannot run after the owner's final zero. Release blocks
new claims, neutralizes tracked teleop targets, and then permits deliberate handover. STOP is outside the lease; resume
is inside it. Production cannot disable this boundary. See ADR 0129.

Guided runtime practice sits above the same accessibility layer but outside the action path. It receives app labels and
profile behavior, but no runtime action client, intent callback, or teleop contribution callback. Leaving the practice
replacement surface is what restores the live artboard and its command interfaces.

The supervisor mirror is another intentionally separate boundary. `createSupervisorRuntimeClient` projects the full
runtime client down to connection observation plus `getRuntimeControlState`, `getRuntimeStopState`, and
`listRosTopicStatus`. The mirror component cannot receive claim, release, publish, teleop, configured-action, STOP, or
resume methods. Its `#/runtime/supervisor/:config/:app` route can open on a second display without transferring
ownership from the operator session. The backend reports the owning session's frame, last mode request, and whether it
is moving, and the mirror shows those; `cartesian_manager` publishes no authoritative mode, so the mode stays labelled
as requested. The server enforces the same boundary with the observer role (ADR 0131).

The current operator contract is maintained in `docs/operator-runtime.md`.

Status indicators should follow the same adapter boundary as runtime behavior. Backend/API state can be generic, but
robot, ROS, network, or hardware state must come from explicit adapters instead of being inferred in frontend-only code.
The same boundary gates widgets: runtime resolves their declared requirements against the backend capability report,
keeps explicitly unavailable widgets visible and inert with the reported reason, and treats a missing report as unknown.

## Principles

These used to sit on the landing page; they are for the people working on Bloom, so they live here.

- Generic web logic stays independent from ROS.
- Robot-specific behaviour enters through explicit adapters.
- Every migrated slice ships with tests before it becomes the default path.

## Dependency Direction

Apps may depend on libs. Libs should not depend on apps.

Generic libs may not import ROS. ROS integration stays behind adapter interfaces so Bloom can also run in tests, demos, or non-ROS projects.

App configurations may declare runtime adapter policies for allowed topics, message types, recording topics, and teleop
targets. These policies improve runtime UX and fixture clarity, but backend adapter policies remain the final safety
boundary before commands reach ROS or any other machine protocol.
