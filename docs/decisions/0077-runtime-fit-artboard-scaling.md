# 0077 - Runtime Fit Artboard Scaling

Date: 2026-06-03

## Context

Bloom uses the same screen model for builder and runtime. The runtime `fit`
mode must make large tablet/HD canvases usable in the available viewport without
changing widget geometry.

The previous implementation scaled widget coordinates and dimensions before
rendering. That made unit tests simple, but it weakened the WYSIWYG contract:
runtime controls could become clipped or visually inconsistent with the builder
layout.

## Decision

Keep the canonical screen and widget layout unchanged in runtime. Apply visual
scaling at the artboard boundary with CSS `transform: scale(...)`, while the
outer frame reserves the scaled size for scrolling and centering.

## Consequences

- Builder and runtime share one layout model.
- Runtime remains a true app view without builder chrome.
- Large teleop screens can fit tablet-like viewports without mutating widget
  coordinates.
- Visual QA remains necessary because widget internals can still overflow their
  own cards if the screen layout itself is too tight.
