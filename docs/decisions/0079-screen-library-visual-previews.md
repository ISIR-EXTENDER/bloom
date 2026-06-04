# 0079 - Screen Library Visual Previews

Date: 2026-06-04

## Context

The shared screen library already groups screens by intent, but the cards still
read like metadata rows. Users need to understand a screen quickly before they
edit, preview, reuse, or drag it into an app.

## Decision

Add lightweight visual previews to screen library cards, but keep them
on-demand. Cards stay information-first by default; hovering or focusing the
explicit "Preview layout" trigger expands a compact mini artboard inside the
card.

The preview is not a full renderer. It uses the existing widget layout data to
draw abstract blocks inside a mini artboard.

## Consequences

- The screen library becomes more visual without turning every card into a
  large thumbnail.
- Screen titles, tags, ownership, and actions remain visible before users ask
  for more detail.
- The preview reinforces Bloom's core model: screens are composed from widget
  layouts.
- The on-demand behavior works with pointer hover and keyboard focus, so it is
  usable beyond mouse-only interactions.
- Empty screens still show a clear empty-canvas state.
- Future work can replace the abstract preview with richer thumbnails or cached
  screenshots once storage/assets are normalized.
