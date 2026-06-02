# 0025. React Widget Renderer Registry

## Status

Accepted

## Context

The dashboard can load configurations and show a temporary screen preview, but the React rendering logic lived inline in
the dashboard app. That made the dashboard responsible for interpreting widget descriptors, placing widget frames, and
rendering fallbacks.

Bloom needs a reusable renderer boundary before migrating more UI from `extender_ui`.

## Decision

Add `frontend/libs/widget-renderers` as the React-specific renderer package.

The package owns:

- a widget renderer registry;
- duplicate renderer detection;
- default transitional renderers for common Bloom widget kinds;
- safe unknown-widget fallback rendering;
- screen widget frame rendering with canonical widget layout.

The framework-independent widget domain remains in `@bloom/widgets`.

For now, default renderers remain transitional and mostly non-interactive. The legacy `extender_ui` stack gives useful
guidance for the next interactive renderers:

- keep `@radix-ui/react-slider` as the preferred slider primitive;
- keep `nipplejs` as the preferred tactile joystick primitive;
- keep camera/stream rendering as first-party React components around browser-native `<video>`, `<img>`, `<iframe>`,
  and `getUserMedia`;
- keep `recharts` as the likely plot primitive once timeseries widgets become interactive.

Do not add those dependencies to Bloom until the corresponding interactive renderer is actually migrated. This keeps
the foundation small while preserving the technology direction that already worked in `extender_ui`.

## Consequences

- The dashboard consumes renderer contracts instead of reimplementing widget preview behavior.
- Future builder/runtime surfaces can share the same renderer registry.
- UI polish can happen later without changing the widget domain contracts.
- App-specific widgets can eventually register their own React renderers without entering Bloom core.
