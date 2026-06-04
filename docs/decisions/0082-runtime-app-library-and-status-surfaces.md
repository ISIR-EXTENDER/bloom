# 0082 - Runtime App Library And Status Surfaces

Date: 2026-06-04

## Status

Accepted.

## Context

Bloom runtime must feel like a real operator app, not like a builder preview with editing controls left visible. At the
same time, users need a clear place to choose which app to operate, resume recent work quickly, and return to editing
when they notice an app or screen needs changes.

The legacy Extender UI also showed useful backend state. Bloom should preserve that clarity without turning the
interface into a dense log dashboard.

## Decision

Runtime navigation opens a runtime app library first. From there users choose the app they want to operate.

Runtime keeps the same screen and widget rendering model as the builder, but removes builder chrome. Runtime-only
shortcuts are intentionally small:

- go back to the runtime app library;
- edit the current app;
- edit the current screen.

The runtime home can show recently opened apps as a fast path. For now this is session-local UI state. Later it can move
to SQLite-backed user profiles.

Status surfaces should stay layered and truthful:

- backend/API connection status can be shown early because Bloom can validate it directly;
- runtime session status can be shown once the WebSocket session is active;
- robot/ROS status should only be shown when a real adapter can prove it;
- network/Wi-Fi status should be treated as a deployment/device integration, not guessed from the browser.

Status labels must be human-readable and calm. Avoid log-like noise, ambiguous green dots without text, or claims such
as "robot connected" when only the web backend is reachable.

## Consequences

- The Runtime top navigation is no longer a dead-end or hidden preview of the currently selected builder app.
- Users can launch apps directly from runtime, and return to builder only when editing is needed.
- The builder/runtime mental model remains WYSIWYG: one screen model, one widget model, one renderer pipeline.
- Future status work has a clear hierarchy and should not leak ROS-specific state into generic UI components.

