# Partner Interface Review

This review compares the Inria/AUCTUS `extender-interface` prototype with Bloom,
`extender_ui`, and `tablet_interface`.

The goal is not to absorb the partner repo wholesale. The goal is to identify
good UX and interaction patterns for Extender user tests, then migrate the useful
ideas into Bloom through generic contracts, tested widgets, and backend adapters.

## Executive Summary

`extender-interface` is a strong Explorer-specific HMI prototype. It has a clear
user story: a person with motor disabilities can customize a touch interface for
daily assistance tasks, and the runtime view is driven by the same layout store
as the editor.

Bloom is a stronger product foundation. It already has clearer separation between
frontend, backend, storage, runtime, ROS adapters, tests, documentation,
accessibility, and security planning.

Recommended direction:

- Reuse the UX practices from `extender-interface`, especially the Explorer
  control flow.
- Do not copy its architecture directly into Bloom.
- Add an Explorer-specific app or extension in Bloom for global Extender user
  tests.
- Keep Bloom's generic app/screen/widget/runtime model independent from Explorer,
  ROS, or the AUCTUS bridge.

Short version: use their Explorer UX as a scenario, not as Bloom's core model.

## Functional Comparison

| Area | `extender-interface` | `extender_ui` + `tablet_interface` | Bloom state |
| --- | --- | --- | --- |
| Product focus | Explorer/PMR touch HMI | Extender sandbox and Petanque apps | Generic robot and machine web app framework |
| Runtime view | Same layout store as editor, no builder chrome | Strong runtime/builder split | Runtime app view exists and is improving |
| Builder | Store-driven drag/resize canvas, module palette, inspector, undo/redo | Mature WYSIWYG builder with user-tested widgets | Builder foundations, app config, screen library, widget palette |
| Storage | Zustand persisted local layout store | Local JSON sync and backend state | SQLite-backed configuration, JSON import/export bridge |
| ROS connection | Frontend direct WebSocket to AUCTUS `/auctus_ui` bridge | Backend ROS node with WebSocket API and topic publishers | Backend ROS adapter foundations and runtime sessions |
| Control modes | B1-B4 mode buttons and mode-aware joystick hints | Sandbox/Petanque modes through app configs | Generic action intents, not full Explorer mode app yet |
| Joystick | Mode-aware labels, deadzone, 20 Hz publish, zero on release | User-tested joystick/slider ergonomics | Generic joystick primitive polished, still needs mode-aware binding |
| Long actions | Deploy/Repli with progress and cancel | Partial app-specific flows | Runtime action intent model, no full progress/cancel adapter yet |
| 3D robot view | URDF + Three.js + joint state stream | Not the main focus | Not migrated; should be optional Explorer widget |
| Display/accessibility | Display presets, font scale, local themes, virtual keyboard | Less central | Accessibility foundations documented; app theme system started |
| Diagnostics | Placeholder diagnostic tab with ROS status ideas | Runtime state and WebSocket events | Topic catalog, topic echo, plots, and ROS sessions planned |
| Tests | None | Existing tests in `extender_ui`; backend tested ad hoc | Frontend/backend tests and CI baseline |

## UX Practices Worth Migrating

### Store-Driven Runtime And Editor

The strongest pattern is that `UserHome` and the editor read the same module
layout. The runtime is not a separate mock of the builder. It is the same app,
without builder chrome.

Bloom should keep strengthening this principle:

- one screen model;
- one widget layout model;
- one renderer pipeline;
- builder tools layered around it;
- runtime view without editor affordances.

### Explorer User Test Flow

The partner interface already encodes a useful Explorer test flow:

- mode buttons for B1, B2, B3, B4;
- a mode-aware joystick;
- gripper and speed controls;
- emergency stop;
- deploy/repli actions with progress and cancel;
- drink mode;
- saved positions and favorites;
- local webcam;
- robot 3D state visualization;
- display/profile adjustments;
- diagnostic and exclusion-zone placeholders.

Bloom should capture this as a future app or extension, not as generic core code.
Possible name: `Explorer User Tests`.

### Mode-Aware Joystick

This is the most valuable interaction detail.

Good behaviors to preserve:

- joystick labels change with active mode;
- axis colors communicate semantic families;
- deadzone is explicit;
- values are normalized and clamped;
- joystick publishes continuously while held;
- joystick sends zero on release and unmount;
- mode mapping is centralized, not scattered across components.

Bloom should model this as a joystick binding contract:

- `mode_id`;
- `axis_hints`;
- `deadzone`;
- `publish_rate_hz`;
- `zero_on_release`;
- `runtime_binding`.

Explorer-specific mode names and topic/service names should live in app config or
an Explorer extension.

### Action Progress And Cancellation

Deploy/Repli are handled as long-running actions with progress and a cancel path.
This is a good runtime UX pattern for robot actions that may be stressful or
safety-relevant.

Bloom should extend runtime action intents with:

- accepted/progress/result states;
- cancellation;
- user-facing status text;
- adapter-level timeout and error handling.

### Multi-Layout And Profiles

The partner prototype supports several layouts such as default, home, meal, or
work. This maps well to Bloom's reusable screens and apps, but also suggests a
future profile concept:

- user profile;
- display preset;
- font scale;
- app theme;
- preferred control layout;
- possibly motor-accessibility presets.

This should not block the current app/screen migration, but the storage model
should stay compatible with profiles.

### Virtual Keyboard And Touch Editing

The Raspberry/touch target makes the virtual keyboard a practical UX feature.
Bloom now has a first touch-editing foundation: fields expose keyboard hints,
structured payloads avoid autocorrect, and builder inputs keep tablet-sized
targets. A full virtual keyboard should remain a later app-builder accessibility
feature to validate on the real Raspberry/tablet setup, especially for:

- app names;
- screen names;
- button labels;
- typed ROS payloads;
- notes and annotations.

The goal is not to recreate a generic mobile keyboard in Bloom. The goal is to
remove the real editing pain points when the native keyboard is too slow, hidden,
or unreliable during robot tests.

## Architecture Practices To Avoid

The partner repo is useful, but several choices should not become Bloom defaults.

- Frontend direct robot WebSocket coupling. Bloom should keep robot protocols
  behind backend runtime adapters or explicit transport adapters.
- Hard-coded Explorer/AUCTUS identifiers in generic UI components.
- LocalStorage/Zustand as the main persistence model. This is fine for drafts or
  playgrounds, not for shared app storage.
- Fixed editor scale. Bloom should keep responsive/full-window builder behavior.
- Module-specific inspector conditionals as the long-term model. Bloom should use
  widget settings contracts and capabilities.
- Inline style sprawl as the main design-system implementation.
- No tests. Every migrated slice in Bloom should keep tests from the beginning.
- Hover-expanded admin navigation for tablet use. Prefer explicit navigation,
  tabs, drawers, and large touch targets.

## What Bloom Should Take Now

### Foundation Additions

- Mode-aware joystick contract: implemented in the widget foundation.
- Runtime action progress/cancel contracts: implemented as generic command
  action metadata and lifecycle event types; live adapters remain future work.
- Explorer user-test app plan: captured in the migration roadmap.
- Display/profile/accessibility track: implemented as profile-ready app model;
  UI profile selection remains future work.
- 3D robot visualization: reserved as optional `robot-3d` widget family or app
  extension, without adding a heavy visualization dependency yet.
- Keep AUCTUS bridge support as an optional backend adapter candidate.

### Explorer User Tests App Proposal

The app now starts as a Bloom demo/configuration fixture:
`tests/fixtures/explorer-user-tests-configuration-bundle.json`. This keeps the
Explorer scenario testable without hard-coding Explorer behavior into Bloom core.
Live adapters can be attached screen by screen later.

Current candidate screens:

- `Explorer control modes`: mode hints, mode-aware joystick, speed, gripper, emergency stop, event feedback.
- `Robot actions`: deploy/retract/safety commands with progress/cancel metadata.
- `Saved positions`: save/replay/cancel preset commands with operator feedback.
- `Safety zones`: QP/safety-zone status and enable/disable/reset commands.
- `Drink mode`: guided task flow with camera context, progress, start/pause/complete actions, and feedback.
- `Favorites`: fast operator shortcuts for common modes, layouts, and positions.
- `Robot supervision`: camera placeholder, optional 3D robot view, battery gauge, velocity plot, event feedback.
- `Debug console`: topic echo, topic plot, runtime events, adapter status.
- `Display profile`: font scale, touch layout, theme preset, screen size.

Still to add as Explorer-specific screens or extensions:

- richer favorites/preset persistence and builder UX;
- richer safety-zone/QP configuration policies and adapter status;
- richer task-specific flows beyond the first drink-mode candidate;
- richer Explorer mode names once the final user-test mapping is confirmed.

This should be an app-level integration, not a generic Bloom rewrite.

## Relationship With Existing ISIR Work

`extender_ui` remains the source of truth for user-tested slider and joystick
ergonomics. `tablet_interface` remains the source of truth for backend ROS
runtime patterns, typed message publishing, and WebSocket state.

`extender-interface` adds an Explorer-specific UX scenario that we can use to
build a more complete Extender test app in Bloom.

The migration priority becomes:

1. Keep Bloom's generic app/screen/widget/backend foundations.
2. Preserve user-tested controls from `extender_ui`.
3. Preserve backend ROS safety boundaries from `tablet_interface`.
4. Add Explorer-specific flows from `extender-interface` as an app/extension.

## Open Questions For Later

- Should Bloom support both standard ROS 2 adapters and the AUCTUS `/auctus_ui`
  bridge as separate runtime adapters?
- Should Explorer user tests live in the same Extender project as Petanque and
  Sandbox, or in its own project once Bloom has project/workspace support?
- Should user profiles be part of Phase 2 storage normalization, or a Phase 6
  multi-project extension?
- Which control mode mapping is final for B1-B4, especially B2?

## Recommendation

Keep evolving the `Explorer User Tests` fixture into a real Bloom app/extension.
Start with non-ROS fixture/demo validation, then connect runtime behavior through
backend adapters.

That gives us the best of both worlds: their good Explorer UX work becomes a
real Bloom app, while Bloom stays generic, tested, and reusable for ISIR projects
beyond Extender.
