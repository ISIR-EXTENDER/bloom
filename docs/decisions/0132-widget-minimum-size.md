# 0132 - Every widget kind declares a minimum size

**Status** accepted · **Date** 2026-09-17 · **Supersedes** nothing · **Related** 0120, 0127

## Context

Bloom shipped a clipped gripper card on the Drive screen of both robots. `drive-gripper` was
authored 130×130 with `show_details: true`; `ToggleWidget` renders a title, a 56 px button and the
literal topic `/gripper_controller/commands`, which needs 250×144. The card has
`overflow: hidden`, so the content was silently cut.

Two more instances of the same defect shipped alongside it: `drive-rz` at 130×260 (below the
vertical slider minimum, and half its sibling's height) and the speed sliders at 210×130 (header
line runs past the edge). On kinova, `drive-fault` is a `topic-echo` at 120×60.

These are not three unrelated bugs. Authored geometry was trusted and content was never measured
against it. Nothing in the builder, the seed files or the renderers knew how much room a widget
needs, so no test could fail.

## Decision

1. Each widget kind declares a **minimum size** for both `show_details` states, derived from what
   its renderer actually renders. Shipped as `WIDGET_MIN_SIZE` in `frontend/libs/widgets`, read by
   the builder inspector, the review checklist and the seed validator alike.
2. A widget card **grows rather than clips**: `min-height` on the content box, never
   `overflow: hidden`. Clipping an operator control is never the correct failure mode.
3. Siblings of one kind on one row **share one size**. Asymmetry must be intentional.
4. The builder **warns, it does not block**. An undersized widget gets a corner tag and a one-action
   fix in the inspector; publishing surfaces it in the review checklist.
5. Minimums are stated at scale 1.0. The builder additionally reports the **effective** size after
   fit-scaling, for the whole screen. Nothing an operator acts on may land below 44 px of glass.

## Consequences

Every existing seed app stays loadable — warn, not block — so this is not a breaking change.
Three seed apps currently carry warnings; the corrected Drive geometry is in this PR and the
remaining screens follow.

`show_details` becomes a geometry setting rather than a cosmetic one, since it changes the minimum.
That is stated in the defaults table: runtime default `false`, debug/lab `true`.

The one thing we accept: the table must be maintained when a renderer's content changes. The
mitigation is that it lives beside the renderers and the review checklist reads it, so a renderer
change that invalidates it surfaces on the next publish rather than on a tablet.

## Alternatives considered

**Measure at runtime and auto-grow silently.** Rejected as the only mechanism: it fixes the symptom
on the tablet but leaves the builder showing a layout that does not match what ships, and an author
never learns. Auto-grow is retained as the *failure* behaviour (decision 2), not as the contract.

**Block authoring below the minimum.** Rejected: it invalidates existing seeds and stops an author
mid-thought for something that is often a transient state while dragging.

**Scrollable widget cards.** Rejected for operator surfaces. A control an operator must scroll to
reach is a control they cannot reach eyes-off.
