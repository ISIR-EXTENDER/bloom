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

Last full review: 2026-06-04.

Current migration estimate:

- Web product foundation: about 78%.
- Live ROS/runtime parity with `tablet_interface`: about 70%.
- Full legacy app parity with `extender_ui` and Petanque screens: about 42%.
- Safety/security readiness for real configurable robot commands: about 62%.

The key architectural base is now solid: Bloom has a separated product shell, app/screen builder, runtime app library,
shared screen/widget renderer pipeline, SQLite-backed configuration foundation, ROS adapters, live runtime sessions,
migrated useful fixture apps, and a recognizable tablet-first design system. The next phase should focus less on new
surface area and more on deployment/security hardening, normalized storage reconstruction, concrete robot action
adapters, and full Extender/Petanque validation before legacy retirement.

Already merged:

- Monorepo skeleton, docs, MIT license, contribution rules, and commit conventions.
- Backend FastAPI foundation, Typer CLI, file-backed configuration API, JSON import/export, and SQLite configuration storage.
- Legacy JSON import paths for sandbox and Petanque application/screens.
- Frontend dashboard shell with product navigation, landing page, builder view, runtime view, and Bloom design-system foundation.
- Widget contracts, renderer registry, legacy conversion, widget palette, settings inspector, layout editing, resizing, and undo/redo.
- Runtime separation from builder controls, fit canvas mode, ROS topic publish API, runtime action dispatch, and WebSocket session contracts.
- Mode-aware joystick runtime binding contracts, long-running action progress/cancel contracts, and optional `robot-3d`
  widget family reservation.
- App configuration flow with app identity, app-level theme tokens, and reusable screen membership.
- App configuration screen lifecycle actions: blank screen creation, screen duplication, and source-app labels for reusable screens.
- App theme inspiration metadata for moodboard images and website references, kept separate from the applied palette.
- Profile-ready app model for display presets, font scale, theme preference, preferred control layout, and
  motor-accessibility presets.
- App/screen lifecycle API endpoints with dashboard usage for app and screen saves.
- README product preview screenshots generated from the real dashboard UI.
- Design-system quality gates for contrast, responsive smoke checks, density rules, iconography rules, and reusable
  primitive promotion.
- First security baseline document and minimal API security headers.
- Shared widget-kind contract checks keep frontend and backend configuration models aligned.
- Partner `extender-interface` review captured as Explorer-specific UX inspiration, not as a core architecture to copy.
- Runtime teleop foundation now connects mode-aware joystick intents to the backend WebSocket contract and prepares
  Extender `TeleopCommand` publication through a ROS adapter.
- Runtime slider/topic bindings now publish scalar controls through the ROS topic publish API when widgets opt into a
  topic binding.
- The sandbox configuration includes a `Sandbox teleop lab` runtime screen with translation/rotation joysticks and
  horizontal/vertical sliders for ROS end-to-end validation.
- Bloom Debug now has a first tracked runtime fixture with topic echo/plot widgets that request WebSocket topic
  subscriptions.
- Runtime topic subscriptions now stream `topic_sample` messages into visible topic echo and plot widgets through the
  shared renderer pipeline.
- Runtime command safety now has first backend allowlists and audit records for HTTP ROS publishes and WebSocket teleop
  commands, with an API endpoint ready for Bloom Debug.
- Runtime command safety now also has command rate limits for HTTP ROS publishes and WebSocket teleop commands.
- Bloom Debug now exposes the topic catalog, runtime audit refresh, topic recording start/stop controls, and topic echo
  pause/clear/copy actions.
- Runtime recording requests now go through a backend gateway with selected topics, approved relative output folders,
  and audit records. The default gateway is simulated so the API is safe in CI and non-ROS development.
- Runtime fit rendering now keeps one canonical screen/widget layout model and applies visual scaling only at the
  artboard boundary, preserving WYSIWYG geometry while avoiding clipped teleop controls.
- Topic echo widgets now include a first user-facing debug action to copy the latest visible messages.

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

Status: complete.

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
- Builder screen library cards now include on-demand visual previews based on widget layouts, so users can inspect a
  screen without making the reusable library harder to scan.
- App configuration screen composition now groups available reusable screens by functional type and supports dragging a
  screen into the current app flow, while keeping explicit button fallbacks.
- SQLite now keeps normalized mirror tables for apps, screens, widgets, and theme assets while preserving the full JSON
  bundle as the lossless migration bridge.
- App list/create/duplicate/delete flows are backed by API saves, with a clearer starter-app creation path.
- Screen list/create/duplicate/reuse/delete flows are backed by API saves, with screen-only builder and runtime preview
  entrypoints from the shared screen library.
- App composition supports drag/drop reusable screens, drag/drop screen reordering, and explicit button fallbacks.
- The builder includes a playground/draft lab for quick runtime screen checks before users create a full saved app.
- Touch editing hints are in place for app names, screen names, labels, URLs, payload-style fields, and longer text.
- Theme moodboard images now use a backend asset upload endpoint instead of storing data URLs in app config.
- App configuration cards stay intentionally human-readable with feature labels, source-app hints, and clean copy.
- Builder visual QA now covers readable cards, focus states, tactile drag affordance, clean control widgets, and
  tablet-friendly interaction spacing.
- Runtime navigation now opens an app library instead of silently using the current builder selection.
- Runtime app library includes session-local recent app shortcuts, with the full library still visible.
- Runtime apps keep a clean operator view while exposing small app/screen edit shortcuts back to the builder.
- Backend/robot/network status UX has a documented hierarchy so Bloom can add status indicators without becoming noisy.

Phase 2 follow-ups that should not block Phase 3:

- Reconstruct configuration bundles from normalized SQLite tables once the schema stabilizes.
- Add a full guided create-app wizard with starter screen selection, design-system presets, and onboarding attention
  spots.
- Persist recent apps and display/profile preferences once user profiles are introduced.
- Add real backend/runtime/robot status indicators through explicit adapters.
- Add asset cleanup when moodboards are replaced or apps are archived.
- Promote playground drafts into reusable screens or saved apps.
- Add cached screen thumbnails after asset storage has a lifecycle policy.
- Explore optional virtual-keyboard workflows for Raspberry/tablet use.

### Phase 3 - Runtime ROS Integration

Status: complete for the runtime safety/debug foundation.

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

Completed in this phase:

- ROS safety foundation before broader robot deployment:
  topic allowlists, message type allowlists, payload shape validation, command rate limits, and runtime audit logs.
- ROS topic catalog endpoint and Bloom Debug UI as the base for topic inspection, topic echo, telemetry plots, and
  recording topic selection.
- Teleop publisher adapter inspired by `tablet_interface`, isolated behind Bloom runtime services.
- Mode-aware joystick runtime binding inspired by Explorer user-test UX:
  active mode, axis hints, deadzone, publish rate, zero-on-release, and adapter-specific topic/service bindings.
- Scalar slider runtime bindings inspired by legacy Extender UI:
  app-configured topic, ROS message type, payload field path, and local-only fallback when no topic is configured.
- Tablet-friendly Explorer joystick presets expose `BOTH` as the default cycle mode. `ROTATION` and `TRANSLATION` remain
  supported as ROS compatibility modes, but are not primary tablet cycle choices when `BOTH` covers the user workflow.
- Long-running robot action contracts exist for accepted/progress/result/cancel metadata at the widget/runtime contract
  layer. Concrete deploy/repli adapters should be migrated with the corresponding robot app screens.
- Bloom Debug UX:
  topic selector, pause/clear/copy, readable topic echo, minimal PlotJuggler-like telemetry widgets, and recording
  controls for selected topics and approved folders.
- Topic inspector and recording gateway foundations for selecting topics and starting/stopping rosbag-style captures
  safely.
- Live streaming for subscribed debug topics through runtime WebSocket sessions and shared renderer data snapshots.

Validated runtime checks:

- Browser runtime joystick -> Bloom WebSocket -> backend ROS adapter -> `/teleop_cmd`.
- `/teleop_cmd` -> `sandbox_controller` -> `/sandbox_controller/velocity_command` in the sandbox simulation.
- Browser runtime slider -> ROS publish API -> `/cmd/max_velocity` as `std_msgs/msg/Float64`.
- Bloom Debug topic widgets -> runtime WebSocket `subscribe_topic` -> backend `subscription_ack`.
- Bloom Debug live samples -> runtime WebSocket `topic_sample` -> runtime workspace widget data -> topic echo/plot
  renderers.
- Unknown HTTP ROS publish topics and WebSocket teleop targets are rejected by the runtime policy and recorded in the
  audit log.
- Rate-limited HTTP ROS publish and WebSocket teleop commands are rejected before reaching adapters and recorded in the
  audit log.
- Real dashboard Bloom Debug flow validates `subscribe_topic` messages with `widget_id`, backend `subscription_ack`,
  and visible topic samples in runtime widgets.
- Real dashboard Bloom Debug controls validate topic catalog refresh, audit refresh, and recording start/stop calls.
- Real dashboard Sandbox teleop lab flow validates the fit runtime artboard visually at tablet-like viewport sizes, so
  translation/rotation joysticks and horizontal/vertical sliders remain visible.

### Phase 4 - Legacy App Migration

Status: complete for the legacy app/widget foundation.

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

Completed in this phase so far:

- Petanque admin fixture screens now use human-readable app/screen titles while keeping stable technical IDs.
- Previously empty Petanque screens now contain useful generic Bloom widgets:
  labels, camera streams, topic echo, topic plots, scalar sliders, command buttons, and configurable toggles.
- Generic display primitives are now real renderers instead of placeholders:
  `label`, `gauge`, `plot`, and `robot-3d`.
- `label` respects configured text, alignment, and font size so instructions/status blocks can be reused across apps.
- `gauge` provides an accessible meter for state-like values such as battery, progress, or score.
- `plot` provides a lightweight first-party sparkline for previews and simple telemetry without adding a heavier chart
  dependency yet.
- `robot-3d` is kept as an explicit extension placeholder so robot-model visualization can evolve behind an adapter.
- Seeded app configuration fixtures are tested to avoid shipping empty runtime screens in the app library.
- Legacy camera source aliases such as `camera` and `rviz` normalize toward Bloom's stream configuration model.
- Generic `event-log` widget is now a real display primitive with severity filtering, optional timestamps/details, and
  quiet operator-facing defaults instead of raw console noise.
- Legacy `logs` widgets now map to Bloom's generic `event-log` direction in the widget migration registry.
- A first `Explorer User Tests` candidate app fixture exists with useful non-empty screens for control modes, robot
  actions, supervision, debug console, and display/profile presets.
- The Explorer candidate validates mode-aware joystick settings, action progress/cancel metadata, configurable
  gripper/emergency commands, topic debug widgets, profile-ready app metadata, and operator event logs without making
  Explorer semantics part of Bloom core.
- `command-button` supports optional ROS one-shot publish fields and app-level `action_presets`, so state-machine
  commands, emergency stop triggers, saved-preset flows, and bridge-style button actions do not require a separate
  widget family.
- Applications can now declare a `runtime_policy` with allowed publish topics, message types, recording topics, and
  teleop targets; the runtime dispatcher uses it as an early app-level guard before backend safety policy enforcement.
- App configuration can edit runtime allowlists and reusable command presets from the builder, while runtime resolves
  `presetId` references against the active app before applying policy checks.
- The app configuration builder now exposes a first reusable command preset library and can synchronize app-level
  publish-topic/message-type guardrails from selected presets.
- Lightweight `plot` now supports `area`, `sparkline`, and `bars` variants, optional units, and optional Y bounds before
  Bloom commits to a heavier chart dependency.
- The Explorer candidate now includes a saved-position screen built from generic command buttons and event logs, so
  save/replay/cancel preset flows can be validated without adding Explorer-specific widgets to Bloom core.
- Saved-position save/replay/cancel variants now exist as generic command presets, keeping richer saved-preset flows
  behind existing runtime contracts and future adapters.
- The Explorer candidate now includes a safety-zone screen built from generic status, command, and event widgets, so
  QP/safety workflows can be explored without coupling Bloom core to Explorer algorithms.
- The Explorer candidate now includes a guided task screen for drink assistance, modeled with generic camera, progress,
  command, and event widgets instead of a task-specific core widget.
- The Explorer candidate now includes a favorites screen that models fast operator shortcuts as configured commands
  without introducing a premature favorites subsystem.
- The Petanque `throw-draw` idea now maps to a generic `gesture-pad` widget foundation that emits angle/power value
  intents and keeps Petanque topics/commands in configuration.
- Bloom Debug `topic-plot` widgets now share the first-party SVG plot helpers with generic `plot`, supporting `area`,
  `sparkline`, and `bars` variants while keeping the latest value prominent for live robot telemetry.
- Petanque, Sandbox teleop lab, Bloom Debug, Explorer User Tests, and Webcam demo fixtures are smoke-tested in runtime
  so migrated app entries do not regress to blank or unfinished screens.
- A richer chart dependency remains intentionally deferred until first-party plots cannot cover multi-series telemetry,
  zoom, cursor inspection, or longer offline traces.

Phase 4 closure notes:

- Bloom now has enough migrated fixture coverage to proceed to Phase 5 without moving unfinished Phase 4 work forward.
- Deeper app-specific behavior still belongs to later concrete adapters, especially deploy/repli actions, final Explorer
  user-test mode mappings, and real rosbag recording.

Explorer user-test app candidate:

- First candidate is tracked as `tests/fixtures/explorer-user-tests-configuration-bundle.json`.
- Current candidate screens: control modes, robot actions, saved positions, safety zones, drink mode, favorites, robot
  supervision, debug console, and display/accessibility profile.
- Next candidate work: final user-test mode mappings, richer adapter policies, and app-specific assets.
- Keep Explorer-specific mode mappings, URDF assets, AUCTUS bridge item names, and QP/safety-zone semantics outside the
  generic Bloom core.
- Validate first as a non-ROS fixture/demo, then connect live behavior through backend adapters.

### Phase 5 - Deployment And Legacy Retirement

Status: in progress.

- Add authentication, authorization, CORS policy, runtime rate limiting, dependency audits, and basic dynamic security scans.
- Add Extender workspace deployment entrypoints only after the core app flow is stable.
- Validate Bloom against the full Extender + Petanque end-to-end pipeline.
- Mark legacy repos/packages as legacy only after Bloom covers the required workflows.
- Do not delete legacy repos during the transition.

Completed in this phase so far:

- API-key authentication can be enabled for staging/production deployments.
- Admin/operator roles protect configuration mutations, runtime endpoints, ROS publish endpoints, and runtime WebSocket
  sessions while local/test development remains frictionless.
- Production settings fail closed if authentication or the admin key is missing.
- CORS is restricted to configured dashboard origins instead of wildcard defaults.
- A global HTTP rate limit protects the API from noisy clients, in addition to runtime command-specific rate limits.
- Frontend and backend dependency audit commands are available through `npm run audit:security`.
- A basic dynamic security smoke scan verifies security headers, OpenAPI reachability, and CORS behavior against a
  running backend through `npm run security:dynamic`.
- A transition Extender workspace launcher starts Bloom API in ROS-adapter mode and the dashboard next to the existing
  ROS workspace without turning Bloom into a ROS package.
- Extender/Petanque validation now has an explicit acceptance protocol and record.
- Legacy retirement now has explicit gates; current status is "do not retire yet".

Remaining work in this phase:

- Promote the basic dynamic smoke scan into CI once deployment preview startup is scriptable end-to-end.
- Validate and refine the Extender workspace launcher with the full sandbox/Petanque pipeline.
- Execute and record the full Extender + Petanque end-to-end validation.
- Mark only accepted legacy workflows as legacy, without deleting them during transition.

### Phase 6 - Multi-Project And Non-ROS Integrations

Status: idea captured, intentionally low priority.

- Add a project/workspace level above apps once SQLite app/screen storage is stable enough to normalize safely.
- Keep current apps such as Petanque and Sandbox as apps inside an Extender project/workspace.
- Support future projects that are not robots or not ROS-based, such as a C++ machine supervision API.
- Add `project_id` only when tables and API contracts are ready, instead of forcing it into the early bundled JSON model.
- Keep widgets producing generic intents/actions so protocols remain replaceable through adapters.

## Ordered Next Steps

1. Harden deployment/security:
   authentication, authorization, CORS/deployment defaults, dependency audits, and basic dynamic security checks.
2. Validate the full Extender/Petanque robot pipeline:
   run Bloom runtime against sandbox simulation, Petanque screens, tablet hardware, and legacy parity scenarios before
   retiring any old workflow.
3. Normalize SQLite app/screen storage:
   keep JSON import/export, but reconstruct configuration bundles from dedicated app/screen/widget/theme records once
   the schema is stable.
4. Add concrete robot action adapters:
   deploy/repli actions, saved pose replay, concrete rosbag recording, speed/gripper counters, and final Explorer
   user-test mode mappings.
5. Add tablet runtime layout presets:
   keep the WYSIWYG source layout canonical, but let apps provide tablet/high-visibility display profiles so real
   operator controls are comfortable at `1024x600` and `1920x1080`.
6. Keep the future project/workspace level unblocked while normalizing SQLite app/screen storage.
7. Run end-to-end checks with real legacy JSON, visual smoke screenshots, and the live dashboard after each slice.

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
- For live topic streaming, verify browser WebSocket `subscribe_topic` -> backend `subscription_ack` -> ROS publish or
  ROS topic update -> browser `topic_sample`.
- Validate that robot command endpoints reject unknown topics, message types, and malformed payloads.
