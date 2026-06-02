# 0038 - UI Preview Foundations

## Status

Accepted.

## Context

Bloom needs enough visible UI to make the migration concrete and testable end-to-end. At the same time, the polished
builder and runtime applications are not ready yet, so the current dashboard should not pretend to be the final product.

The legacy `extender_ui` already proved that movable/resizable widgets and screen previews are valuable. Bloom should
preserve that direction while moving toward a calmer, more neutral visual language for lab and tablet use.

## Decision

Add a transitional UI foundation with three explicit product areas:

- landing page for project orientation;
- builder preview for selecting configurations, applications, and screens;
- runtime preview for interacting with rendered widgets and inspecting emitted action intents.

Use the existing widget renderer registry and configuration API data instead of hard-coded screens. Keep the runtime
preview side-effect free: it records intents locally until backend runtime/ROS adapters are introduced.

Adopt a light Bloom visual direction for this foundation: beige, grey, white, soft green accents, large touch targets,
and readable contrast suitable for tablets and bright lab conditions.

## Consequences

- The UI can now be used as a visual migration harness before the real builder exists.
- Landing, builder, and runtime concepts stay separated from the start.
- Widget interactions can be tested end-to-end in the browser without coupling the frontend directly to ROS.
- This is still a transitional UI; final builder workflows, app routes, persistence actions, and runtime adapters remain
  future work.
