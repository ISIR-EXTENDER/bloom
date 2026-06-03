# 0064 - Accessibility As A Bloom Foundation

## Status

Accepted.

## Context

Bloom is meant to help people create and operate robot interfaces without being
web developers. The product is also likely to run on tablets, in labs, near
hardware, and sometimes in uncomfortable physical contexts. Accessibility is
therefore not only a compliance topic; it is part of operator safety,
readability, and product quality.

The GitHub Open Source Guide accessibility recommendations provide a practical
baseline for open-source projects: document expectations, make contribution
paths accessible, use semantic UI, keep focus and keyboard behavior reliable,
and test accessibility continuously.

Reference: <https://opensource.guide/accessibility-best-practices-for-your-project/>

## Decision

Bloom now has an accessibility plan in `docs/accessibility-plan.md`.

Accessibility checks are added to the pull request template, and accessibility
issues have a dedicated GitHub issue template.

The dashboard includes a skip link to jump from product navigation to main
content, and focus-visible styling applies to buttons, inputs, selects, and
textareas.

## Consequences

- New UI work should consider keyboard reachability, visible focus, labels,
  contrast, and color-independent meaning from the start.
- Drag-and-drop and visual builder interactions must keep accessible fallbacks.
- Future app theme customization must validate readability and focus states,
  not only visual personality.
- Accessibility testing can grow incrementally with the same migration rhythm
  as widgets, runtime, ROS adapters, and storage.
