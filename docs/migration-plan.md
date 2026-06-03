# Bloom Migration Plan

This is the single source of truth for the Bloom migration roadmap.

Supporting documents:

- `docs/widget-migration-inventory.md`: reusable widget ideas discovered in `extender_ui` and Petanque.
- `docs/widgets-screens-apps-foundation-plan.md`: design notes behind the widgets/screens/apps foundation work.
- `docs/decisions/`: dated decisions and development journal entries.

## Product Goal

Bloom should let ISIR users create robot web apps without writing web code:

- compose apps from reusable screens;
- build screens visually through a WYSIWYG canvas;
- configure reusable widgets through typed settings;
- run apps without builder controls;
- keep ROS behind backend adapters;
- persist apps/screens/widgets through SQLite, with JSON import/export as a migration safety bridge.

## Non-Goals During Migration

- Do not redesign robot controllers.
- Do not move low-level ROS control packages into Bloom.
- Do not delete legacy JSON files or legacy repos during transition.
- Do not mix ROS-specific behavior into generic frontend libraries.
- Do not replace working legacy functionality until the Bloom replacement is tested end-to-end.

## Current Status

Already merged:

- Monorepo skeleton, docs, MIT license, contribution rules, and commit conventions.
- Backend FastAPI foundation, Typer CLI, file-backed configuration API, JSON import/export, and SQLite configuration storage.
- Legacy JSON import paths for sandbox and Petanque application/screens.
- Frontend dashboard shell with product navigation, landing page, builder view, runtime view, and Bloom design-system foundation.
- Widget contracts, renderer registry, legacy conversion, widget palette, settings inspector, layout editing, resizing, and undo/redo.
- Runtime separation from builder controls, fit canvas mode, ROS topic publish API, runtime action dispatch, and WebSocket session contracts.
- App configuration flow with app identity, app-level theme tokens, and reusable screen membership.
- README product preview screenshots generated from the real dashboard UI.

Current branch:

- `feat/builder-screen-lifecycle`
- Adds blank screen creation, screen duplication, source-app labels for reusable screens, and an updated app config preview.

## Roadmap

### Phase 0 - Baseline

Status: complete.

- Keep `extender_ui` and `input_interfaces/tablet_interface` alive as legacy sources.
- Create the Bloom monorepo with executable checks.
- Document architecture boundaries, naming, commit conventions, and product direction.

### Phase 1 - Safe Extraction

Status: mostly complete, still receiving feature slices.

- Move reusable frontend logic into `frontend/libs`.
- Move backend API/CLI/configuration logic into `backend/apps` and `backend/libs`.
- Keep reusable widget logic independent from React where possible.
- Keep ROS-specific behavior inside `backend/libs/ros_adapters`.
- Add tests with each migrated slice.

Next focus in this phase:

- Finish production-level builder workflows.
- Keep migrating reusable widgets from `extender_ui` and Petanque.
- Strengthen frontend/backend contract checks around configuration data.

### Phase 2 - Storage And App Library

Status: started.

- Use SQLite-backed configuration storage as the long-term source of truth.
- Keep JSON import/export for migration, backups, and regression tests.
- Move from bundled configuration documents toward normalized concepts where useful:
  apps, screens, widgets, app themes, runtime bindings.
- Preserve the current app config UX while introducing a real screen library/store.

Next focus in this phase:

- Save app/screen builder edits through SQLite-backed API paths in normal dashboard usage.
- Add app list/create/duplicate/archive flows backed by storage.
- Add screen list/create/duplicate/reuse/archive flows backed by storage.

### Phase 3 - Runtime ROS Integration

Status: started.

- Keep generic runtime widgets producing command intents.
- Route ROS behavior through backend adapters.
- Add live topic subscriptions through runtime sessions.
- Add configurable ROS message publishing for buttons/toggles.
- Add topic echo and lightweight timeseries visualization for debugging.

Next focus in this phase:

- WebSocket runtime topic subscriptions.
- Teleop publisher adapter inspired by `tablet_interface`, but isolated behind Bloom runtime services.
- Topic echo widgets and minimal PlotJuggler-like telemetry widgets.

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

- Add Extender workspace deployment entrypoints only after the core app flow is stable.
- Validate Bloom against the full Extender + Petanque end-to-end pipeline.
- Mark legacy repos/packages as legacy only after Bloom covers the required workflows.
- Do not delete legacy repos during the transition.

## Ordered Next Steps

1. Push and merge `feat(builder-screen-lifecycle)`.
2. Start a builder UX/polish slice:
   app builder home, app config, screen builder, and runtime should feel like one coherent product flow.
3. Add SQLite-backed app/screen lifecycle API usage from the dashboard:
   save, list, duplicate, and archive through backend storage instead of relying on bundled document replacement only.
4. Add runtime live ROS sessions:
   WebSocket topic subscriptions, topic echo, and teleop publisher adapter.
5. Migrate the next reusable widget family:
   configurable ROS/message action widgets, then slider/joystick and stream/log/plot widgets.
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
