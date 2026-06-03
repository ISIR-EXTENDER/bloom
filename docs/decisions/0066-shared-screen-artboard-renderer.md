# 0066 - Shared Screen Artboard Renderer

Status: accepted.

## Context

The partner `extender-interface` review highlighted a strong UX/architecture
pattern: the runtime and editor should read the same layout model. The runtime
must not be a separate mock of the builder. It should be the same screen without
builder chrome.

Bloom already had common widget descriptors and renderer registries, but the
dashboard app still duplicated artboard rendering details between the builder and
runtime workspaces.

## Decision

Introduce a shared `ScreenArtboard` component in the dashboard app.

It owns:

- screen descriptor generation;
- artboard and preset size resolution;
- empty-state rendering slot;
- default runtime widget rendering;
- optional widget frame override for builder affordances.

The builder now adds selection, drag, and resize through a frame override around
the same widget content. The runtime renders the same screen model without
editor affordances.

## Consequences

- Builder and runtime are closer to a single render pipeline.
- Future widget migrations are less likely to work in one mode and fail in the
  other.
- Visual QA can focus on one screen model with two layers: builder chrome and
  runtime app.
- The next step is to continue moving screen-level behavior into reusable
  contracts instead of per-page special cases.
