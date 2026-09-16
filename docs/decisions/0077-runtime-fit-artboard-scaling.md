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

## 2026-09-16 Amendment

Fit scaling below 1.0 is no longer silent. Runtime keeps the operating surface clear, but Maintenance names the authored
artboard dimensions, actual guarded render percentage, and 44 px touch-floor risk. The warning threshold uses the raw
fit result, so the deliberate 0.99 overflow guard does not create a false warning for an otherwise one-to-one canvas.
This disclosure does not replace prevention, reflow, or physical-panel validation.
