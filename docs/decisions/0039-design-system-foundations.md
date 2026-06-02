# 0039 - Design System Foundations

## Status

Accepted.

## Context

Bloom needs a modern, reusable design system before the builder and runtime screens grow larger. The dashboard had
custom app-local UI styles that were useful for migration, but too easy to drift away from the Bloom identity.

The target visual direction is light, neutral, and tablet-friendly: beige, grey, white, clear active states, large touch
targets, and readable contrast in bright lab conditions.

The mood board behind the Bloom logo is inspired by soft spring/garden imagery, Monet-like light, and a palette of
forest green, sage, lilac, petal pink, pollen yellow, and cream. The intended mood is fresh, natural, calm, harmonious,
creative, and human-centric.

Reference asset: [Bloom mood board](../brand/bloom-mood-board.png).

## Decision

Create `frontend/libs/ui` as the design system package with:

- shared CSS tokens for Bloom colors, semantic UI roles, surfaces, shadows, and navigation states;
- application theme presets and a `BloomThemeProvider`;
- a reusable `BloomNavBar` React component;
- reusable `BloomButton`, `BloomCard`, and `BloomPanel` primitives;
- tests for active navigation state, item selection, and primitive rendering;
- dashboard integration through `@bloom/ui` instead of app-local navigation CSS.

Use Material 3 as a structural reference for token roles and component states, not as the visual identity. Bloom keeps
its own mood-board palette, typography direction, and soft garden surfaces. The design system maps palette colors to
semantic roles such as `primary`, `secondary`, `surface`, `surfaceContainer`, `outline`, and `error`, so components stay
stable when an app changes theme.

Use the square transparent favicon asset in the navigation brand so the wide logo is not compressed or placed on an
awkward white background. Keep the nav structure standard, but integrate its surface into the Bloom cream/sage theme
instead of using a disconnected pure white bar.

App-specific design systems should be expressed as token sets, not custom component forks. For example, a future Petanque
app can use a warmer, more playful palette while still rendering the same Bloom buttons, cards, panels, widgets, and
runtime surfaces. The builder can later expose preset, palette, or moodboard-generated theme choices.

## Consequences

- Future landing, builder, and runtime screens can reuse shared primitives.
- The foundation supports app-level visual identity without duplicating widget implementations.
- App-level CSS focuses on layout and feature-specific details.
- Components should consume semantic roles first and palette tokens only for decorative details.
- The design system can grow progressively with buttons, cards, forms, canvas chrome, and touch-friendly controls.
