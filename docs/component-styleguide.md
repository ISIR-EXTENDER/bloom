# Bloom Component Styleguide

This styleguide is intentionally lightweight. It documents reusable UI primitives only after they are stable enough to
help other Bloom pages move faster.

## Promotion Rule

Keep a visual pattern near the feature while it is still changing. Promote it to `@bloom/ui` when at least one of these
is true:

- it appears in multiple product areas;
- it carries accessibility behavior;
- it depends on design-system tokens;
- it prevents repeated card/action styles;
- it should be shared by future apps.

Promoted primitives need tests and examples.

## Current Primitives

### `BloomThemeProvider`

Applies Bloom theme tokens to a product area.

Use for:

- app-level theme previews;
- runtime app rendering;
- future profile/display presets.

### `BloomNavBar`

Product navigation with brand, active item, and accessible button labels.

Use for:

- main dashboard navigation;
- top-level product sections.

Avoid using it inside a runtime app screen. Runtime uses its dedicated kiosk bar; product navigation stays outside the
operating surface.

### `BloomButton`

Reusable action button with `primary`, `secondary`, and `subtle` tones.

Use for:

- primary builder/runtime actions;
- accessible fallbacks for drag/drop;
- repeated card actions.

Rules:

- Primary actions should be rare and obvious.
- Use `ariaLabel` when the visible text is not enough.
- Avoid icon-only buttons unless the icon has a clear accessible name.

### `BloomCard`

Reusable surface primitive with `default`, `soft`, and `canvas` tones.

Use for:

- reusable product cards;
- app library cards;
- help panels;
- future styleguide examples.

Feature-specific cards can stay local until their structure stabilizes.

### `BloomPanel`

Section surface with `aria-labelledby` support.

Use for:

- grouped builder panels;
- help/documentation panels;
- future settings surfaces.

### `BloomTag`

Small semantic label for readable metadata.

Use for:

- screen/app type labels;
- source-app hints;
- status-like non-critical metadata.

Do not use tags as the only state signal for safety-critical information.

## Density Examples

- Compact: dense builder lists and inspectors.
- Tablet: default app configuration and screen library.
- Comfortable: runtime controls, joystick/slider screens.
- High-visibility: available sunlight/gloves/motor-accessibility presentation; each app still needs layout validation.

## Visual QA

Run:

```bash
npm run visual:smoke
```

This validates landing, builder, and runtime at the three tablet panels:

- `1024x600`;
- `1280x720`;
- `1820x720`.

Bloom Debug, the one desktop app, is checked at `1920x1080` and `1440x900` instead.

The smoke test detects page-level horizontal overflow and captures the current route matrix in
`/tmp/bloom-visual-smoke`, or in `BLOOM_VISUAL_OUTPUT_DIR` when it is set. Physical target size, touch mapping, and
assistive-device behavior still require hardware checks.
