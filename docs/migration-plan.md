# Bloom Migration Plan

This is the single source of truth for the Bloom migration roadmap.

Supporting documents:

- `docs/widget-migration-inventory.md`: reusable widget ideas discovered in `extender_ui` and Petanque.
- `docs/widgets-screens-apps-foundation-plan.md`: design notes behind the widgets/screens/apps foundation work.
- `docs/security-baseline.md`: minimum security posture for web/API/ROS-facing work.
- `docs/decisions/`: dated decisions and development journal entries.

## Product Goal

Bloom should let ISIR users create robot web apps without writing web code:

- compose apps from reusable screens;
- build screens visually through a WYSIWYG canvas;
- configure reusable widgets through typed settings;
- run apps without builder controls;
- keep ROS behind backend adapters;
- persist apps/screens/widgets through SQLite, with JSON import/export as a migration safety bridge;
- keep robot-facing web features minimally secure by default.

## Non-Goals During Migration

- Do not redesign robot controllers.
- Do not move low-level ROS control packages into Bloom.
- Do not delete legacy JSON files or legacy repos during transition.
- Do not mix ROS-specific behavior into generic frontend libraries.
- Do not replace working legacy functionality until the Bloom replacement is tested end-to-end.
- Do not expose unrestricted robot commands from configurable UI widgets.

## Current Status

Already merged:

- Monorepo skeleton, docs, MIT license, contribution rules, and commit conventions.
- Backend FastAPI foundation, Typer CLI, file-backed configuration API, JSON import/export, and SQLite configuration storage.
- Legacy JSON import paths for sandbox and Petanque application/screens.
- Frontend dashboard shell with product navigation, landing page, builder view, runtime view, and Bloom design-system foundation.
- Widget contracts, renderer registry, legacy conversion, widget palette, settings inspector, layout editing, resizing, and undo/redo.
- Runtime separation from builder controls, fit canvas mode, ROS topic publish API, runtime action dispatch, and WebSocket session contracts.
- App configuration flow with app identity, app-level theme tokens, and reusable screen membership.
- App configuration screen lifecycle actions: blank screen creation, screen duplication, and source-app labels for reusable screens.
- App/screen lifecycle API endpoints with dashboard usage for app and screen saves.
- README product preview screenshots generated from the real dashboard UI.
- First security baseline document and minimal API security headers.

Current branch:

- None. `main` is synced after `feat(config): add app screen storage api (#34)`.

## Roadmap

### Phase 0 - Baseline

Status: complete.

- Keep `extender_ui` and `input_interfaces/tablet_interface` alive as legacy sources.
- Create the Bloom monorepo with executable checks.
- Document architecture boundaries, naming, commit conventions, and product direction.

### Phase 1 - Safe Extraction

Status: foundation-complete, still receiving focused widget/runtime slices.

- Move reusable frontend logic into `frontend/libs`.
- Move backend API/CLI/configuration logic into `backend/apps` and `backend/libs`.
- Keep reusable widget logic independent from React where possible.
- Keep ROS-specific behavior inside `backend/libs/ros_adapters`.
- Add tests with each migrated slice.

Remaining focus in this phase:

- Keep migrating reusable widgets from `extender_ui` and Petanque.
- Strengthen frontend/backend contract checks around configuration data.

### Phase 2 - Storage And App Library

Status: started.

- Use SQLite-backed configuration storage as the long-term source of truth.
- Keep JSON import/export for migration, backups, and regression tests.
- Move from bundled configuration documents toward normalized concepts where useful:
  apps, screens, widgets, app themes, runtime bindings.
- Preserve the current app config UX while introducing a real screen library/store.

Already done in this phase:

- App and screen saves now use dedicated backend API endpoints instead of frontend-only full-bundle replacement.
- Reusable screen listing exposes source-app metadata for the early screen-library UX.

Remaining focus in this phase:

- Normalize SQLite storage beyond bundled configuration documents.
- Add app list/create/duplicate/archive flows backed by storage.
- Add screen list/create/duplicate/reuse/archive flows backed by storage.

### Phase 3 - Runtime ROS Integration

Status: started.

- Keep generic runtime widgets producing command intents.
- Route ROS behavior through backend adapters.
- Add live topic subscriptions through runtime sessions.
- Add configurable ROS message publishing for buttons/toggles.
- Add topic echo and lightweight timeseries visualization for debugging.
- Add intuitive recording/session controls for rosbag-style captures with selected topics and approved output folders.
- Add allowlists for publishable topics, message types, and payload shapes before real robot deployment.
- Keep ROS transport replaceable so standard ROS 2, `rmw_zenoh_cpp`, or a future Hiroz/Zenoh adapter can be evaluated
  without changing frontend widget contracts.

Next focus in this phase:

- WebSocket runtime topic subscriptions.
- Teleop publisher adapter inspired by `tablet_interface`, but isolated behind Bloom runtime services.
- Topic echo widgets and minimal PlotJuggler-like telemetry widgets.
- Topic inspector and recording adapter foundations for selecting topics and starting/stopping rosbag captures safely.

### Phase 4 - Legacy App Migration

Status: started with Petanque admin fixtures.

- Migrate screens one by one from real legacy JSON.
- Convert reusable Petanque widgets into generic Bloom widgets whenever topic names, labels, payloads, and adapters can
  be configured.
- Keep app-specific behavior behind extension boundaries.
- Validate each migrated app in builder and runtime.

Priority widget families:

- Control primitives: slider, joystick, toggle, action button.
- ROS/message primitives: configurable topic publish button/toggle, command intents, recording/session commands.
- Display primitives: camera/stream viewer, text/status, logs, topic echo, telemetry plot.
- Builder primitives: navigation widgets, inspector metadata, app/screen composition.
- Advanced reusable controls: gesture/trajectory input, saved preset/pose commands, media/action overlays.

### Phase 5 - Deployment And Legacy Retirement

Status: not started.

- Add authentication, authorization, CORS policy, runtime rate limiting, dependency audits, and basic dynamic security scans.
- Add Extender workspace deployment entrypoints only after the core app flow is stable.
- Validate Bloom against the full Extender + Petanque end-to-end pipeline.
- Mark legacy repos/packages as legacy only after Bloom covers the required workflows.
- Do not delete legacy repos during the transition.

## Ordered Next Steps

1. Start a builder UX/polish slice:
   app builder home, app config, screen builder, and runtime should feel like one coherent product flow.
2. Normalize SQLite app/screen storage:
   keep JSON import/export, but add dedicated app/screen persistence records behind the existing API contract.
3. Add runtime live ROS sessions:
   WebSocket topic subscriptions, topic echo, and teleop publisher adapter.
4. Migrate the next reusable widget family:
   configurable ROS/message action widgets, then slider/joystick and stream/log/plot widgets.
5. Add the first security checks around ROS publish intents:
   topic/message/payload allowlists, runtime session validation, and audit logging.
6. Run end-to-end checks with real legacy JSON and the live dashboard after each slice.

## Validation Rules

Before opening PRs:

```bash
npm run check
npm run test
npm run build
cd backend
make test
```

When UI changes affect the visible product flow:

```bash
npm run capture:readme
```

When ROS behavior is involved:

- Keep generic tests independent from ROS.
- Test ROS adapters through injected gateways.
- Validate manually in a sourced ROS workspace before replacing legacy runtime behavior.
- Validate that robot command endpoints reject unknown topics, message types, and malformed payloads.
