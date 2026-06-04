# 0078 - Reusable Screen Composition Drag And Drop

Date: 2026-06-04

## Context

The app configuration page already lets users add reusable screens through
buttons. That is accessible and reliable, but it does not yet feel tactile
enough for a tablet-first builder.

Bloom needs drag-and-drop affordances for screens and widgets, while keeping
explicit button fallbacks for keyboard use, touch devices, and assistive
technologies.

## Decision

Introduce a reusable Bloom drag/drop payload helper for screen composition.
Available screens can now be dragged into the current app flow, while the
existing `Add to app` button remains available.

Group reusable screens by functional type so the library feels visual and
scannable before it becomes a fully featured screen store.

## Consequences

- App composition feels closer to modern tablet interactions.
- Drag/drop payload names are centralized instead of copied as raw MIME strings.
- Future builder surfaces can reuse the same helper for screens, widgets, apps,
  and draft playground items.
- Drag/drop remains progressive enhancement; primary actions still have buttons.
