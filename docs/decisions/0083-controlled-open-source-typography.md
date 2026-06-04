# 0083 - Controlled Open-Source Typography

Date: 2026-06-04

## Status

Accepted.

## Context

Bloom originally relied on local/system fonts such as Georgia, Aptos, Trebuchet MS, Cascadia Code, or Ubuntu Mono. That
was acceptable during early UI exploration, but it made the product identity vary across developer machines, tablets,
and CI/browser environments.

Typography is part of Bloom's design system, so it should be reproducible like color tokens and component primitives.

## Decision

Bloom now ships a controlled open-source typography stack through `@fontsource` packages:

- `Cormorant Garamond` in lighter medium weights for display typography, brand headings, and refined
  landing/builder moments;
- `Atkinson Hyperlegible` for UI text, forms, runtime controls, and tablet readability;
- `JetBrains Mono` for debug payloads, topic values, and code-like text.

The fonts are imported by `@bloom/ui`, then exposed as CSS tokens:

- `--bloom-font-display`;
- `--bloom-font-ui`;
- `--bloom-font-mono`.

Apps and widgets should consume these tokens instead of naming font families directly.

## Consequences

- Bloom's visual identity is more stable across machines and deployments.
- The UI font favors accessibility and readability on the Extender tablet.
- The display font keeps the soft, botanical Bloom identity with a slimmer editorial feel.
- Font assets are bundled by the app build instead of loaded from a public CDN.
