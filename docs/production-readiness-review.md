# Production Readiness Review

This review compares Bloom with the working legacy pair `extender_ui` and
`tablet_interface`. The goal is not to clone the old implementation. The goal is
to keep the parts that proved useful with real users, then migrate them into
Bloom with cleaner boundaries, tests, and a more durable product architecture.

## Current Migration Estimate

Last reviewed: 2026-06-04.

| Area | Legacy baseline | Bloom state | Migration estimate |
| --- | --- | --- | --- |
| Product shell | Extender-specific app pages | Generic landing, builder, runtime navigation, help page, browser history support | 80% |
| App and screen configuration | JSON/local sync, usable but brittle | API-backed app/screen flows, screen library, drag/drop, SQLite mirror tables | 70% |
| WYSIWYG builder | Strong canvas, drag/resize, inspector, widget controls | Full-page builder, save/discard, undo/redo, palette, inspector, screen runtime preview | 70% |
| Runtime app view | Worked well, app-like, no builder chrome | Runtime app library, recent apps, clean artboard, edit shortcuts, shared renderer pipeline | 75% |
| Widgets foundation | Many working widgets, uneven settings contracts | Registry, settings contracts, renderer registry, action intents, runtime data snapshots, cleaner runtime labels | 68% |
| Slider and joystick controls | User-tested tactile design, large handles, axis labels, readouts | Pointer-native joystick, Radix sliders, teleop/topic bindings, good HD layout, small-tablet comfort still pending | 70% |
| Camera/stream widgets | Working camera and stream flows | Browser webcam demo works, stream preview exists, ROS stream adapter pending | 58% |
| Topic debug and plots | Basic logs/plots through app-specific code | Topic echo/plot contracts receive live WebSocket samples, copy action exists, pause/clear/catalog pending | 58% |
| ROS runtime bridge | `tablet_interface` works with ROS topics, typed messages, teleop, camera, measure bridges | ROS publish API, WebSocket teleop, live topic streaming, sandbox smoke tests, safety allowlists pending | 50% |
| Petanque app migration | Working app-specific runtime | Fixtures and initial migration inventory | 25% |
| Security | Mostly implicit/local trusted stack | Baseline documented, headers tested, command allowlists/audit logs pending | 30% |

Overall migration state: about 70% for the web product foundations, about 50%
for live ROS parity with `tablet_interface`, and about 30% for full legacy app
parity.

See also `docs/partner-interface-review.md` for the Inria/AUCTUS
`extender-interface` review. That repo is useful as Explorer-specific UX
inspiration, especially for global user-test flows, but should not replace
Bloom's generic architecture.

## What To Preserve From `extender_ui`

- The WYSIWYG split between builder chrome and true runtime app view is correct.
- Canvas interactions should keep widget-specific constraints, especially square
  joystick resizing and large slider touch handles.
- Joystick widgets should keep visible axis labels, deadzone feedback, live vector
  readouts, and touch-first sizing.
- Slider widgets should keep Radix Slider, release-to-center capability for
  teleop axes, large center handles, clear readout, and vertical/horizontal
  layouts tuned for tablets.
- Camera widgets should keep stream-card behavior, 16:9 framing, `cover`/`contain`
  fit modes, and lightweight source configuration.
- App-specific widgets from Petanque should be reclassified: reusable primitives
  go into Bloom libs; Petanque-only orchestration stays behind app extensions.
- The old local JSON files remain valuable fixtures for migration tests, but
  should not remain the product storage model.

## What To Preserve From `tablet_interface`

- WebSocket state/event model with validated payloads.
- Generic publisher caches for bool/string/float/compressed image topics.
- Typed ROS message publishing from YAML-like payload text, because it matches
  how roboticists think from the console.
- Separate bridges for actuators, camera, measure, sandbox, and Petanque.
- Runtime state snapshots and command age/watchdog metadata.
- ROS adapters behind a clean boundary, instead of leaking ROS vocabulary into
  every frontend component.

## Architecture Gaps In Bloom

- `frontend/apps/bloom-dashboard/src/App.tsx` is becoming the product
  orchestration hotspot. It should be split into shell, builder route, runtime
  route, and configuration-selection controllers before the next major UI slice.
- `BuilderHome` and `BuilderAppConfig` mix page composition, grouping,
  drag/drop, and copy. They should be split into smaller panels and pure helpers.
- `frontend/libs/widgets/src/settings.ts` is now the central contract authority,
  but should be split by widget family once ROS/debug widget contracts grow.
- `frontend/apps/bloom-dashboard/src/App.test.tsx` is very useful but too large.
  Split by product area to keep future failures easier to diagnose.
- Widget settings contracts exist, but visual style capabilities are not yet
  editable as real fields.
- Runtime action intents and ROS live sessions are now connected for teleop,
  scalar topic publish, and live topic samples. The next gap is richer topic
  catalog/debug UI and rosbag-style session controls.
- SQLite storage still stores configuration bundles. Dedicated normalized
  app/screen/widget/theme asset tables are the next backend maturity step.
- Security controls are documented but not enforced yet for topic publishing.

## UX/UI Review

Using the Google UX framing, Bloom should be usable, enjoyable, accessible, and
functional.

Usable:

- Builder and runtime separation is clear, but the builder needs stronger
  breadcrumbs and less technical metadata in primary cards.
- App configuration is improving, but screen membership should feel more like a
  content library than a database table.
- App configuration now groups reusable screens by type and supports
  drag-to-add as progressive enhancement. The next UX step is screen reordering
  and richer visual previews.
- The shared screen library now has on-demand visual previews, making reusable
  screens easier to inspect without reducing default scanability.
- Controls need immediate feedback. Joysticks and sliders should visibly confirm
  the value being sent.

Enjoyable:

- The Bloom palette and moodboard direction are strong.
- The product needs fewer “log style” labels and more human labels.
- Empty states should invite action without sounding like developer placeholders.

Accessible:

- Touch targets should stay at least 48px and preferably larger for controls used
  under stress or sunlight.
- Focus states exist, but widget internals need clearer visible states.
- Controls need semantic labels, readouts, and reduced reliance on tiny text.

Functional:

- The webcam demo proves the runtime direction.
- Builder save/discard and undo/redo are in place.
- Live ROS session data now reaches topic echo/plot widgets. The next critical
  function is making that debuggable by users: topic catalog, pause/clear,
  plot readability, and recording controls.
- Runtime teleop is visually comfortable at the configured `1920x1080` Extender
  resolution, but too small for confident operation at the native `1024x600`
  tablet checkpoint. Bloom needs app/display presets instead of relying on one
  layout to serve every viewport.

## Frontend Refactoring Plan

1. Split `App.tsx` into shell, route/controller, and product-view components.
2. Split `BuilderHome` and `BuilderAppConfig` into focused panels and pure
   grouping/selection helpers.
3. Split widget setting contracts by family while keeping one registry export.
4. Split large dashboard tests by product area.
5. Promote reusable UI primitives from dashboard-local CSS into `frontend/libs/ui`.
6. Keep `@radix-ui/react-slider` for accessible sliders, but keep joystick input
   pointer-native in Bloom. `nipplejs` worked as a legacy reference, but Bloom
   removed it after scaled runtime tests exposed pointer drift and zero-vector
   risks.
7. Add widget-specific interaction contracts:
   auto-center slider, square joystick, touch-size presets, compact/runtime modes.
8. Add visual style editing from widget capabilities:
   accent/background/text/border colors with app theme defaults.
9. Add Playwright product smoke tests for landing, builder home, app config,
   screen builder, runtime, and webcam demo.

## Backend Refactoring Plan

1. Keep FastAPI/SQLite as Bloom's backend foundation.
2. Continue the runtime WebSocket service inspired by `tablet_interface/ws_server.py`:
   topic samples are live now, next are topic catalog UX, recording sessions,
   and richer runtime status snapshots.
3. Add ROS adapter services based on injected gateways:
   topic catalog, topic subscriptions, typed publisher, camera stream adapter,
   teleop publisher.
4. Migrate `tablet_interface` typed payload parsing into a tested Bloom ROS
   adapter without requiring ROS for generic backend tests.
5. Normalize SQLite after the current bundle API is stable:
   projects, apps, screens, widgets, themes, assets, runtime sessions.
6. Enforce security allowlists before real robot publishing:
   topics, message types, payload shapes, output folders for recordings.
7. Keep Petanque-specific endpoints out of the generic core; use extension
   adapters and app configuration.

## UX/UI Fix Plan

1. Polish slider and joystick first because they are safety-critical teleop
   controls and already have user-tested legacy behavior.
2. Make builder canvas use more of the viewport while keeping inspector readable.
3. Replace technical card metadata with human labels, with details available in
   secondary inspectors.
4. Improve app config and screen library UX beyond the current drag/drop base:
   guided creation, clearer screen intent grouping, cached thumbnails, and
   stronger tablet feedback for drag/reorder operations.
5. Add runtime launch actions directly where users manage apps and screens.
6. Improve empty states with clear next actions.
7. Add sunlight/tablet checks:
   high contrast, large targets, fewer tiny secondary labels, no dark-mode-first
   assumptions.

## Review Notes From The First Control Polish

- Legacy joystick colors should not be carried directly into Bloom runtime.
  Preserve interaction design and sizing, but resolve colors through Bloom app
  themes and widget style capabilities.
- Imported legacy layouts can still overlap once rendered with Bloom cards,
  headers, and readouts. Petanque control screens need a dedicated layout QA pass
  after widget primitives stabilize.
- Visual verification should accompany widget PRs. Tests catch behavior, but the
  browser capture caught joystick overflow that unit tests could not see.
- Robin's `extender_ui` feedback highlights migration risks to avoid in Bloom:
  pointer-to-control coordinate drift on joystick and velocity sliders, shared
  state between duplicated velocity widgets, topic-specific sliders becoming
  unusable on non-default topics, and widget defaults silently overriding edited
  max values.
- The `ros-message-toggle` widget is working well for visual servoing and should
  stay a priority pattern for configurable ROS message publishing in Bloom.
- Tablet control modes should avoid exposing redundant mode labels when a
  combined mode already covers the practical workflow. Bloom should model
  available control modes as app/runtime configuration instead of hard-coding all
  legacy TeleopCommand enum values into every UI.

## Completed Follow-Up Refactors

- Widget renderers are now split by runtime family instead of living in one
  large `index.tsx` file.
- Builder and runtime now share a `ScreenArtboard` renderer so the same screen
  model and widget descriptor pipeline drive both modes.
- Joystick widgets now use a mode-aware runtime contract with axis hints,
  publish rate, zero-on-release, and adapter binding metadata.
- Applications now keep a profile-ready model for display presets, font scale,
  app theme preference, preferred control layout, and motor-accessibility presets.
- Command buttons now carry optional long-running action metadata for future
  accepted/progress/result/cancel flows.
- `robot-3d` is now a reserved optional widget family, ready for future
  Explorer/URDF visualization extensions without pulling heavy dependencies into
  the generic core.
- Runtime widget styling is separated from the dashboard product stylesheet.
- Dashboard CSS is now split by product area: base shell, builder, runtime app,
  runtime widgets, and responsive overrides.
- Slider and joystick tests now cover visible readouts, joystick sizing
  guardrails, and Bloom theme color fallback.
- Sliders now support a `returnToCenter` setting for teleop axes while keeping
  regular configuration sliders persistent by default.
- Runtime joysticks are pointer-native and validated against the ROS sandbox
  pipeline, avoiding the legacy pointer offset and zero-vector risks.
- Runtime topic subscriptions now stream live samples into topic echo and topic
  plot widgets through the shared runtime renderer data pipeline.
- Runtime fit rendering now scales the artboard visually instead of mutating
  widget coordinates, keeping builder/runtime geometry aligned and reducing
  clipping risk for teleop controls.
- Topic echo widgets now expose a first operator-facing debug action:
  copy the latest visible messages to the clipboard.
- App configuration now uses reusable drag/drop payload helpers for screen
  composition and keeps button fallbacks for accessible operation.
- Screen library cards now include abstract content previews derived from widget
  layout data, improving visual scanning without rendering full apps in every
  card.
