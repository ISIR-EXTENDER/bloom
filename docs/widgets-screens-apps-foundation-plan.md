# Widgets, Screens, And Apps Foundation Notes

This document keeps the design notes behind Bloom's widgets, screens, and apps foundations.

Roadmap ownership lives in `docs/migration-plan.md`.

Use this file as reference material when implementing roadmap slices, especially when deciding whether a legacy widget
belongs in Bloom core, an app extension, or a temporary migration adapter.

See also `docs/widget-migration-inventory.md` for the current `extender_ui` widget/screen migration inventory.

## Why Not Just Copy `extender_ui`

`extender_ui` already proves the interaction model works: widgets can be added from a catalog, moved, resized, edited,
saved as JSON, and replayed in runtime mode. Bloom should reuse those lessons, not blindly copy the implementation.

The main improvement is to separate responsibilities earlier:

- widget domain contracts live in reusable libraries;
- layout logic is tested outside React;
- runtime actions go through explicit command/device/ROS boundaries;
- app-specific widgets stay out of Bloom core until extension points exist.
- widgets first discovered in Petanque should still become generic Bloom widgets when their behavior can serve other
  apps.

## Why Adapters Exist

Adapters are not meant to make the code heavy. They are the boundary that keeps Bloom generic while still letting it
control Extender.

Use adapters only when a widget crosses a boundary:

- legacy JSON shape to Bloom configuration shape;
- widget command to backend/device command;
- backend command to ROS topic/service/action;
- app-specific behavior to a generic extension point.

Do not add adapters for simple visual widgets that are already generic. For example, `label`, `slider`, and basic
layout utilities should stay direct and boring.

## Storage Direction

Bloom should not reproduce the old local JSON sync as the long-term storage model. JSON import/export stays as a safety
bridge for migration, but canonical saving/loading should move to SQLite-backed configuration storage.

That means widget, screen, and app contracts should be:

- stable enough to persist in a database;
- serializable without React or ROS runtime state;
- versioned through configuration metadata;
- easy to import/export as JSON for backups and migration;
- designed so screens/apps can be saved, loaded, listed, duplicated, and eventually migrated through database changes.

## Lessons From `extender_ui`

Keep these concepts, but rebuild them as small tested contracts:

- `rect: { x, y, w, h }` for canvas positioning and resizing.
- canvas presets such as tablet, HD, full HD, and local screen.
- runtime canvas modes such as left, center, and fit.
- snapped drag/resize behavior.
- widget catalog entries with default size and default settings.
- editor mode separated from runtime mode.
- selected widget state and inspector-editable properties.
- configuration JSON import/export as a safety bridge.

Avoid carrying these weaknesses forward:

- settings scattered across components instead of typed contracts;
- ROS/device behavior mixed directly into UI widgets;
- old tab/widget-instance shape competing with the newer canvas JSON shape;
- app-specific widgets living in the generic catalog without an extension boundary.
- reusable Petanque-era widgets being trapped as Petanque-only code when they should become lab-wide widgets.

## Foundation Status Snapshot

For the current roadmap and ordered next steps, use `docs/migration-plan.md`.

Already done:

- `@bloom/widgets` exists as a framework-independent package.
- Widgets can be registered by kind and resolved into safe render descriptors.
- Unknown widgets produce explicit fallback descriptors.
- Enabled `extender_ui` widget kinds are mapped to Bloom kinds with compatibility status.
- Dashboard can load configurations from the backend API.
- App configuration can edit app identity, app design tokens, screen membership, blank screen creation, and screen
  duplication as saveable draft state.
- The builder has tested canvas movement, resizing, history, widget palette, and inspector foundations.
- Runtime screens render separately from builder controls.

Still important for future roadmap slices:

- runtime action boundary for command/device/ROS widgets;
- richer ROS live subscriptions and telemetry visualization;
- normalized SQLite app/screen storage beyond bundled configuration documents;
- production-level screen builder polish and visual QA;
- backend/frontend contract sync safeguards.

## Foundation Slices

### 1. Widget Capability Metadata

Goal: make each widget self-describing enough for a future palette/editor.

Add to `@bloom/widgets`:

- category: layout, display, input, command, device, app-specific;
- description;
- default title;
- default settings;
- default layout size;
- runtime requirements;
- editor/runtime availability.

Tests:

- registry rejects duplicate kinds;
- registry exposes catalog-ready metadata;
- legacy mappings point to existing Bloom capabilities where applicable.

### 2. Screen Layout And Canvas Model

Goal: reproduce and improve `extender_ui` moving/resizing foundations.

Add shared layout concepts:

- widget layout rectangle: `x`, `y`, `width`, `height`;
- minimum size;
- grid size and snap helpers;
- canvas presets;
- runtime canvas modes;
- canvas size and fit-scale helpers.

Backend config and frontend API types should both include layout/canvas fields.

Keep the model storage-neutral so the same shape can be saved through file-backed storage today and SQLite-backed
storage later.

Tests:

- duplicate widget IDs still fail;
- invalid layout values fail;
- snap helpers are deterministic;
- canvas fit scale matches expected viewport behavior;
- old `rect` values can be converted without data loss.

### 3. Typed Settings Contracts

Goal: make widgets easy to configure without web coding.

Start with generic widgets:

- `label`;
- `button`;
- `command-button`;
- `slider`;
- `joystick`;
- `toggle`;
- `camera`;
- `plot`.

Each contract should define:

- required fields;
- optional fields;
- defaults;
- validation;
- human-readable field metadata for the future inspector.

Tests:

- valid settings pass;
- missing required settings are reported clearly;
- defaults are applied consistently;
- JSON serialization remains stable.

### 4. Legacy Configuration Adapter

Goal: load useful old `extender_ui/data/*.json` files into Bloom safely.

Add pure conversion functions:

- old widget `kind` to Bloom `kind`;
- old `label` to Bloom `title`;
- old `rect` to Bloom `layout`;
- old widget-specific fields to Bloom `settings`;
- old canvas settings to Bloom screen/canvas settings.

Keep Petanque-specific widgets explicit as app-specific or unknown until extension points exist.

This adapter is temporary migration infrastructure. It should feed Bloom's canonical config model, which will later be
persisted through SQLite instead of browser/local JSON sync.

Tests:

- use real legacy JSON fixtures, including `sandbox_control.json`, `default_live_teleop.json`, and `default_camera.json`;
- prove no widget is silently dropped;
- prove unsupported widgets are preserved as safe unknown/app-specific entries;
- prove export/import does not lose layout or settings data.

### 5. Renderer Registry

Goal: render screens through registered React components without coupling domain logic to React.

Add in a frontend app/lib layer:

- React renderer registry;
- fallback unknown widget component;
- simple components for `label`, `button`, and layout shells first;
- no major Bloom redesign yet.

Tests:

- screen renders all descriptors;
- unknown widgets render warnings instead of crashing;
- renderer registry rejects duplicate renderers;
- dashboard can render a loaded screen from a fixture.

### 6. Editor State And Operations

Goal: support building screens and apps, not only viewing them.

Add tested operations before UI polish:

- select widget;
- add widget from catalog;
- update title/settings/layout;
- move widget;
- resize widget;
- delete widget;
- reset screen;
- save configuration through API.

Tests:

- operations are pure where possible;
- updates preserve unrelated widget data;
- add-widget uses capability defaults;
- layout updates snap to grid when requested.

### 7. Runtime Action Boundary

Goal: keep Bloom generic while supporting real robot/device commands.

Define command contracts before wiring ROS:

- command button payload;
- toggle ON/OFF payload;
- topic/message intent;
- device command intent;
- recording/session command intent.

Backend adapters can later translate those intents to ROS topics/services/actions.

Tests:

- widgets produce command intents;
- invalid command settings fail before runtime;
- ROS-specific behavior is isolated from generic widgets.

### 8. App Extension Points

Goal: support Petanque or future lab apps without polluting Bloom core.

Use a generic-first rule: `drink`, `throw-draw`, `curves`, `logs`, stream/measure views, and similar Petanque-era
widgets should be evaluated as reusable Bloom widgets before being assigned to a Petanque extension. The extension path
is for explicitly app-owned behavior, not for every widget currently used by one app.

### 9. Debug And Topic Visualization Foundations

Goal: make Bloom useful for robot debugging, not only app control.

Add generic supervision primitives inspired by the useful parts of PlotJuggler, but intentionally lighter and adapted to
Bloom screens:

- scalar and vector timeseries visualization for topics such as velocities, torques, joint positions, force/torque, and
  controller feedback;
- configurable topic source, field path, unit, sampling/window duration, and display style;
- console-style topic echo widgets for in-app monitoring, close to `ros2 topic echo` but readable in a runtime screen;
- pause/resume, clear, and copy/export affordances for debug sessions;
- runtime source adapters so ROS-specific subscriptions stay outside the generic widget renderer.

Tests:

- topic visualization configs validate field paths and display options;
- topic echo configs preserve message payloads without lossy formatting;
- renderers handle missing data, stale data, and unknown message shapes safely;
- runtime adapters can be tested independently from React rendering.

Add a path for app-specific widgets:

- app widget namespace or plugin key;
- app-owned renderer registration;
- app-owned backend adapter registration;
- safe fallback when the app extension is missing.

Tests:

- app-specific widgets remain visible in imported configs;
- missing app extensions do not crash;
- generic widgets remain independent from app widgets.

## Roadmap Pointer

Do not maintain a second ordered TODO list here.

The next PR order is tracked in `docs/migration-plan.md#ordered-next-steps` so the project has one place to update
when priorities change.
