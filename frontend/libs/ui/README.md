# UI Library

Reusable visual primitives for Bloom applications.

This package owns the shared Bloom design system:

- color and surface tokens inspired by Material 3 roles;
- controlled open-source typography through `Cormorant Garamond`, `Atkinson Hyperlegible`, and `JetBrains Mono`;
- spacing, touch target, and density tokens;
- navigation primitives;
- button, card, and panel primitives;
- tag primitive for readable metadata;
- touch-friendly interaction states;
- neutral, light UI foundations for tablet use.
- application theme presets that can be selected per app.

Import the stylesheet once in an app entrypoint:

```ts
import "@bloom/ui/styles.css";
```

The design language follows the Bloom mood board: fresh, natural, calm, harmonious, creative, and human-centric. Prefer
soft garden colors, cream surfaces, sage accents, high readability, and large touch targets over dark or game-like robot
visuals.

Reference: [`docs/brand/bloom-mood-board.png`](../../../docs/brand/bloom-mood-board.png).

Design system documentation: [`docs/design-system.md`](../../../docs/design-system.md).

Component styleguide: [`docs/component-styleguide.md`](../../../docs/component-styleguide.md).

Apps can override the default design system through theme tokens. The long-term builder flow should let users choose a
preset, palette, or generated moodboard-based theme, then apply those tokens to the runtime app without rewriting widgets.
App themes can also store inspiration references, such as a moodboard image or website URL, so a future generator can
derive coherent tokens without losing the human design intent.

## Theme Structure

Bloom themes have two layers:

- `palette` tokens preserve the visual identity, such as forest, sage, lilac, petal, pollen, and cream.
- semantic role tokens describe usage, such as primary, secondary, surface, outline, error, and their matching `on*`
  text colors.

Components should consume semantic roles first. Palette tokens remain available for brand-specific illustrations,
gradients, or decorative details.

## Typography

The UI package imports Bloom's font assets through `@fontsource` so apps do not depend on local machine fonts or a public
CDN.

Use the shared tokens:

- `--bloom-font-display` for brand/display headings;
- `--bloom-font-ui` for controls, forms, cards, and runtime text;
- `--bloom-font-mono` for debug payloads, topic values, and code-like text.

Avoid hard-coding font families in app-specific CSS. Add new typography roles here only when they are reusable.
