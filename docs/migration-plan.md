# Bloom Migration Plan

This is the single source of truth for the Bloom migration roadmap.

Supporting documents:

- `docs/widget-migration-inventory.md`: reusable widget ideas discovered in `extender_ui` and Petanque.
- `docs/widgets-screens-apps-foundation-plan.md`: design notes behind the widgets/screens/apps foundation work.
- `docs/partner-interface-review.md`: review of the Inria/AUCTUS `extender-interface` prototype and what Bloom should
  take from it.
- `docs/security-baseline.md`: minimum security posture for web/API/ROS-facing work.
- `docs/decisions/`: dated decisions and development journal entries.

## Product Goal

Bloom should let ISIR users create robot web apps without writing web code:

- compose apps from reusable screens;
- build screens visually through a WYSIWYG canvas;
- configure reusable widgets through typed settings;
- run apps without builder controls;
- keep ROS behind backend adapters;
- keep non-ROS machine integrations possible through the same adapter boundary;
- persist apps/screens/widgets through SQLite, with JSON import/export as a migration safety bridge;
- keep robot-facing web features minimally secure by default.

## Non-Goals During Migration

- Do not redesign robot controllers.
- Do not move low-level ROS control packages into Bloom.
- Do not delete legacy JSON files or legacy repos during transition.
- Do not mix ROS-specific behavior into generic frontend libraries.
- Do not encode Extender, Petanque, or ROS naming into generic app/screen/widget models.
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
- App theme inspiration metadata for moodboard images and website references, kept separate from the applied palette.
- Profile-ready app model for display presets, font scale, theme preference, preferred control layout, and
  motor-accessibility presets.
- App/screen lifecycle API endpoints with dashboard usage for app and screen saves.
- README product preview screenshots generated from the real dashboard UI.
- First security baseline document and minimal API security headers.
- Shared widget-kind contract checks keep frontend and backend configuration models aligned.
- Partner `extender-interface` review captured as Explorer-specific UX inspiration, not as a core architecture to copy.

Current branch:

- `feat/production-readiness-review-controls`: production readiness review,
  slider/joystick polish, widget renderer modularization, and runtime widget CSS
  cleanup.

## Roadmap

### Phase 0 - Baseline

Status: complete.

- Keep `extender_ui` and `input_interfaces/tablet_interface` alive as legacy sources.
- Create the Bloom monorepo with executable checks.
- Document architecture boundaries, naming, commit conventions, and product direction.

### Phase 1 - Safe Extraction

Status: complete.

- Move reusable frontend logic into `frontend/libs`.
- Move backend API/CLI/configuration logic into `backend/apps` and `backend/libs`.
- Keep reusable widget logic independent from React where possible.
- Keep ROS-specific behavior inside `backend/libs/ros_adapters`.
- Add tests with each migrated slice.
- Add frontend/backend contract fixtures for shared configuration concepts.

Phase 1 closure notes:

- Reusable widget migrations continue in Phase 4, where each family can be validated against real legacy screens.
- Storage normalization continues in Phase 2.
- Runtime ROS behavior continues in Phase 3.
- Widget renderer module boundaries are now in place, so future widget families
  can be migrated without growing a single monolithic renderer file.

### Phase 2 - Storage And App Library

Status: started.

- Use SQLite-backed configuration storage as the long-term source of truth.
- Keep JSON import/export for migration, backups, and regression tests.
- Move from bundled configuration documents toward normalized concepts where useful:
  apps, screens, widgets, app themes, runtime bindings.
- Preserve the current app config UX while introducing a real screen library/store.
- Add a builder-level screen library where users can create, edit, and runtime-preview reusable screens before assigning
  them to an app.
- Finish production-level builder workflows:
  builder home, app configuration, full-page screen builder, WYSIWYG canvas editing, save/discard, and runtime preview.

Already done in this phase:

- App and screen saves now use dedicated backend API endpoints instead of frontend-only full-bundle replacement.
- Reusable screen listing exposes source-app metadata for the early screen-library UX.
- Builder home exposes a searchable screen library across loaded apps, with direct screen builder and runtime preview
  actions.
- Builder screen library now groups reusable screens by intent and uses human-readable display titles, type tags, and
  meaningful color accents while preserving legacy screen ids for migration safety.

Remaining focus in this phase:

- Normalize SQLite storage beyond bundled configuration documents.
- Add app list/create/duplicate/archive flows backed by storage.
- Replace the blank-app shortcut with an optional guided create-app wizard:
  identity, description, design-system preset or moodboard/reference, starter screens, and onboarding attention spots
  that highlight the zones users should configure first.
- Add screen list/create/duplicate/reuse/archive flows backed by storage.
- Add screen-only builder and screen-only runtime preview flows, so reusable screens can be designed before app
  composition.
- Replace early two-column screen membership UI with a production app-flow composition surface:
  drag-and-drop screens into an app, reorder screens, keep explicit buttons as accessible fallbacks, and preserve the
  same tactile affordance used by widget drag-and-drop inside the screen builder.
- Add a builder playground/draft lab for quick robot experiments without creating a saved app first:
  demo widgets, temporary screens, hardware joystick smoke tests, topic echo/publish checks, and a later "promote to
  reusable screen/app" action.
- Keep touch editing reliable for tablet/Raspberry usage: app names, screen names, widget labels, payloads, notes, and
  annotations should use field-specific keyboard hints now; optional virtual-keyboard workflows can be explored later.
- Replace early data-URL moodboard storage with a proper theme asset upload endpoint when normalized SQLite assets are introduced.
- Keep app configuration cards intentionally human-readable: feature labels and source-app hints should replace raw
  technical metadata unless the user explicitly opens an inspector.
- Finish visual and interaction QA for the builder so widgets stay visible, editable, and touch-friendly.

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
- Keep the AUCTUS `/auctus_ui` bridge as an optional adapter candidate for Explorer user tests, not as a frontend-wide
  dependency.

Next focus in this phase:

- WebSocket runtime topic subscriptions.
- ROS topic catalog endpoint as the base for topic inspection, topic echo, telemetry plots, and rosbag-style recording
  topic selection.
- Teleop publisher adapter inspired by `tablet_interface`, but isolated behind Bloom runtime services.
- Mode-aware joystick runtime binding inspired by Explorer user-test UX:
  active mode, axis hints, deadzone, publish rate, zero-on-release, and adapter-specific topic/service bindings.
- Long-running robot action support:
  accepted/progress/result/cancel states for deploy/repli-style commands.
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

Explorer user-test app candidate:

- Add a Bloom app or extension for global Extender/Explorer tests once app/screen storage and runtime adapter contracts
  are stable enough.
- Candidate screens: control modes, mode-aware joystick, robot actions, saved positions, safety zones, robot supervision,
  debug console, and display/accessibility profile.
- Keep Explorer-specific mode mappings, URDF assets, AUCTUS bridge item names, and QP/safety-zone semantics outside the
  generic Bloom core.
- Validate first as a non-ROS fixture/demo, then connect live behavior through backend adapters.

### Phase 5 - Deployment And Legacy Retirement

Status: not started.

- Add authentication, authorization, CORS policy, runtime rate limiting, dependency audits, and basic dynamic security scans.
- Add Extender workspace deployment entrypoints only after the core app flow is stable.
- Validate Bloom against the full Extender + Petanque end-to-end pipeline.
- Mark legacy repos/packages as legacy only after Bloom covers the required workflows.
- Do not delete legacy repos during the transition.

### Phase 6 - Multi-Project And Non-ROS Integrations

Status: idea captured, intentionally low priority.

- Add a project/workspace level above apps once SQLite app/screen storage is stable enough to normalize safely.
- Keep current apps such as Petanque and Sandbox as apps inside an Extender project/workspace.
- Support future projects that are not robots or not ROS-based, such as a C++ machine supervision API.
- Add `project_id` only when tables and API contracts are ready, instead of forcing it into the early bundled JSON model.
- Keep widgets producing generic intents/actions so protocols remain replaceable through adapters.

## Ordered Next Steps

1. Finish production-level builder workflows:
   app builder home, app config, full-page WYSIWYG screen builder, runtime preview, reliable save/discard, and visual QA.
2. Normalize SQLite app/screen storage:
   keep JSON import/export, but add dedicated app/screen persistence records behind the existing API contract.
3. Add runtime live ROS sessions:
   WebSocket topic subscriptions, topic echo, and teleop publisher adapter.
4. Migrate the next reusable widget family:
   configurable ROS/message action widgets, then slider/joystick and stream/log/plot widgets.
5. Add Explorer-style control foundations:
   mode-aware joystick bindings, action progress/cancel, speed/gripper counters, and profile-driven display settings.
6. Add the first security checks around ROS publish intents:
   topic/message/payload allowlists, runtime session validation, and audit logging.
7. Keep the future project/workspace level unblocked while normalizing SQLite app/screen storage.
8. Run end-to-end checks with real legacy JSON and the live dashboard after each slice.

See also:

- [Production readiness review](./production-readiness-review.md) for the current comparison against `extender_ui` and
  `tablet_interface`, migration estimates, and prioritized refactoring plans.
- [Partner interface review](./partner-interface-review.md) for the Inria/AUCTUS Explorer user-test UX review and Bloom
  integration proposal.

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
