# Production Readiness Review

This review compares Bloom with the working legacy pair `extender_ui` and
`tablet_interface`. The goal is not to clone the old implementation. The goal is
to keep the parts that proved useful with real users, then migrate them into
Bloom with cleaner boundaries, tests, and a more durable product architecture.

## Current Migration Estimate

| Area | Legacy baseline | Bloom state | Migration estimate |
| --- | --- | --- | --- |
| Product shell | Extender-specific app pages | Generic landing, builder, runtime navigation | 70% |
| App and screen configuration | JSON/local sync, usable but brittle | API-backed configuration bundles, app/screen CRUD foundations, SQLite repository | 65% |
| WYSIWYG builder | Strong canvas, drag/resize, inspector, widget controls | Full-page builder, save/discard, undo/redo, palette, inspector | 55% |
| Runtime app view | Worked well, app-like, no builder chrome | Fullscreen runtime artboard and screen tabs | 55% |
| Widgets foundation | Many working widgets, uneven settings contracts | Registry, settings contracts, renderer registry, action intents | 50% |
| Slider and joystick controls | User-tested tactile design, large handles, axis labels, readouts | Functional primitives, but still too generic and visually underpowered | 45% |
| Camera/stream widgets | Working camera and stream flows | Browser webcam demo works, stream preview exists | 55% |
| Topic debug and plots | Basic logs/plots through app-specific code | Topic echo/plot contracts and placeholder data rendering | 35% |
| ROS runtime bridge | `tablet_interface` works with ROS topics, typed messages, teleop, camera, measure bridges | HTTP runtime publish endpoint and ROS adapter skeleton | 30% |
| Petanque app migration | Working app-specific runtime | Fixtures and initial migration inventory | 25% |
| Security | Mostly implicit/local trusted stack | Baseline documented, allowlists planned | 20% |

Overall migration state: about 50% for the web product foundations, about 30%
for live ROS parity with `tablet_interface`, and about 20-25% for full legacy app
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

- `frontend/libs/widget-renderers/src/index.tsx` is too large. It should be split
  by renderer family once the next widget migration slice starts.
- `frontend/apps/bloom-dashboard/src/App.css` is still a monolithic product style
  file. Bloom needs component-scoped CSS layers or at least app sections split by
  product area.
- Widget settings contracts exist, but visual style capabilities are not yet
  editable as real fields.
- Runtime action intents exist, but ROS live sessions are not yet connected to
  WebSocket subscriptions and topic data streams.
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
- The next critical function is live ROS session data: topic echo, telemetry, and
  command publish feedback.

## Frontend Refactoring Plan

1. Split widget renderers by family:
   `controls`, `camera`, `actions`, `debug`, `fallbacks`, and shared setting
   readers.
2. Split the monolithic dashboard CSS into product areas:
   shell/navigation, builder, runtime, widgets, and theme tokens.
3. Promote reusable UI primitives from dashboard-local CSS into `frontend/libs/ui`.
4. Keep `@radix-ui/react-slider` and `nipplejs`; both are relevant and already
   proven in `extender_ui`.
5. Add widget-specific interaction contracts:
   auto-center slider, square joystick, touch-size presets, compact/runtime modes.
6. Add visual style editing from widget capabilities:
   accent/background/text/border colors with app theme defaults.
7. Add Playwright product smoke tests for landing, builder home, app config,
   screen builder, runtime, and webcam demo.

## Backend Refactoring Plan

1. Keep FastAPI/SQLite as Bloom's backend foundation.
2. Add a runtime WebSocket service inspired by `tablet_interface/ws_server.py`,
   but expose generic session events first.
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
4. Improve app config screen membership as a reusable screen library.
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
- Runtime widget styling is separated from the dashboard product stylesheet.
- Dashboard CSS is now split by product area: base shell, builder, runtime app,
  runtime widgets, and responsive overrides.
- Slider and joystick tests now cover visible readouts, joystick sizing
  guardrails, and Bloom theme color fallback.
- Sliders now support a `returnToCenter` setting for teleop axes while keeping
  regular configuration sliders persistent by default.
