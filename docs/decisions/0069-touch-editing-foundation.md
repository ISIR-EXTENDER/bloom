# 0069 - Touch Editing Foundation

## Status

Accepted.

## Context

Bloom is used on tablet-like targets where text editing is a real friction point:
app names, screen names, button labels, ROS payloads, notes, and annotations can
all require typing while standing near hardware. A custom virtual keyboard may
be useful later, but it is not automatically the best first solution because
browser and operating-system keyboards already handle device-specific behavior,
language, accessibility, and focus details.

## Decision

Add touch-editing foundations before implementing a virtual keyboard:

- use explicit input hints for editable fields;
- disable autocorrect and capitalization for structured payloads and URLs;
- keep human text fields friendly to spelling and capitalization;
- preserve large touch targets and visible focus styles;
- document virtual-keyboard exploration as a future accessibility feature.

## Consequences

- Builder fields are easier to edit on tablets without adding a custom overlay.
- ROS payload fields are less likely to be corrupted by autocorrect.
- Future virtual-keyboard work has a clear boundary: it should improve the
  device workflow, not replace browser behavior for its own sake.
- Any later keyboard must support the same field categories and remain optional.
