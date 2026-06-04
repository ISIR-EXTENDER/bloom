# Bloom Design System

Bloom's design system is not decoration. It is part of the product architecture: a shared language for building robot
apps that are calm, readable, touch-friendly, and configurable by people who may not be web developers.

## Design Intent

Bloom intentionally moves away from the common robotics aesthetic of dark dashboards, game-like controls, dense logs,
and engineer-only screens.

The target mood is:

- fresh;
- natural;
- calm;
- harmonious;
- creative;
- human-centric.

The visual source of truth is the Bloom mood board:

- `docs/brand/bloom-mood-board.png`

The default direction is light and neutral: cream surfaces, forest/sage greens, soft lilac, petal pink, pollen yellow,
quiet borders, and generous spacing. This is especially important for Extender tablet use in bright lab conditions.

## Principles

- Usability before novelty: a user near moving hardware must understand the screen quickly.
- Beauty supports comprehension: color, spacing, and typography should clarify structure, not add noise.
- Touch is a first-class input: targets should be large, forgiving, and visibly interactive.
- Runtime is not the builder: operator apps should not show builder chrome or configuration metadata.
- Tablet-first where it matters: runtime and common operator flows optimize for touch, sunlight, and fast comprehension.
- Desktop-enhanced where it helps: builder/admin/configuration flows may use denser desktop affordances while keeping
  touch fallbacks.
- App themes are token sets: Petanque or future apps can look different without forking widgets.
- Accessibility is foundational: keyboard access, contrast, focus states, and readable text are part of the base.

## Package Boundary

The reusable design system lives in:

- `frontend/libs/ui`

This package owns:

- `BloomThemeProvider`;
- theme presets;
- shared CSS variables;
- `BloomNavBar`;
- `BloomButton`;
- `BloomCard`;
- `BloomPanel`.

Application-specific layout styles live in:

- `frontend/apps/bloom-dashboard/src/*.css`

Rule of thumb:

- If a visual rule is reusable across product areas, move it toward `frontend/libs/ui`.
- If a visual rule is specific to builder, runtime, debug, or a widget family, keep it near that feature until reuse is
  proven.

## Token Model

Bloom uses two token layers.

### Palette Tokens

Palette tokens preserve the brand mood:

- `forest`;
- `sage`;
- `mist`;
- `lilac`;
- `petal`;
- `pollen`;
- `cream`;
- `paper`;
- `ink`;
- `inkSoft`;
- `muted`;
- `border`.

Use palette tokens for:

- decorative accents;
- screen type hints;
- gradients;
- app identity previews;
- mood-board-aligned illustrations.

### Semantic Tokens

Semantic tokens describe usage:

- `primary`;
- `primaryContainer`;
- `secondary`;
- `secondaryContainer`;
- `surface`;
- `surfaceContainer`;
- `surfaceContainerLow`;
- `surfaceContainerHigh`;
- `outline`;
- `error`;
- `onPrimary`;
- `onSurface`;
- muted surface text roles.

Components should prefer semantic tokens. This keeps components stable when an app changes theme.

Example:

- Good: a primary button uses `--bloom-primary` and `--bloom-on-primary`.
- Risky: a primary button hard-codes `--bloom-color-forest`.

## Current Theme Presets

`frontend/libs/ui/src/theme.ts` currently defines:

- `bloom`: default garden-inspired Bloom identity.
- `clinical`: neutral high-readability theme for bright lab/tablet conditions.
- `petanque-play`: warmer and more playful demo-oriented theme.

These presets are intentionally small. The app builder can later expose preset selection, custom palettes, or generated
themes from moodboard/reference inputs.

## Typography

Bloom uses a controlled open-source font pairing shipped through `@fontsource` packages and imported by `@bloom/ui`.

Current direction:

- `Cormorant Garamond` in lighter medium weights for Bloom identity, large headings, landing moments, and expressive
  builder cards.
- `Atkinson Hyperlegible` for controls, builder forms, runtime widgets, dense operational screens, and tablet use.
- `JetBrains Mono` for debug payloads, topic values, and code-like text.

Typography tokens:

- `--bloom-font-display`;
- `--bloom-font-ui`;
- `--bloom-font-mono`.

Rules:

- Use typography tokens instead of hard-coded font-family stacks.
- Keep runtime and builder controls on the UI font for readability.
- Use the display font sparingly and prefer medium weights so the interface stays calm, refined, and functional.
- Avoid CDN font loading; Bloom should remain local-first and reproducible.

## Shape, Spacing, And Touch

Current defaults:

- `--bloom-touch-target: 48px`;
- `--bloom-touch-target-compact: 40px`;
- `--bloom-touch-target-comfortable: 56px`;
- `--bloom-touch-target-high-visibility: 64px`;
- spacing tokens from `--bloom-space-xs` to `--bloom-space-2xl`;
- pill buttons for primary navigation/actions;
- large rounded cards and panels;
- soft shadows;
- visible focus states;
- tablet-friendly spacing.

Rules:

- Keep essential controls at least `48px` high.
- Prefer fewer, clearer cards over dense grids.
- Avoid hiding primary actions behind hover-only UI because the target device is touch-first.
- If drag/drop is introduced, keep button alternatives.

## Responsive And Density

Bloom is tablet-first for runtime and common operator flows, but desktop-enhanced for builder/configuration flows.

Required responsive checkpoints:

- `1024x600`: native HMTECH panel constraint and worst-case density.
- `1280x800`: comfortable tablet/laptop validation point.
- `1920x1080`: current Extender configured resolution.

Density scale:

- `compact`: builder/admin surfaces with many configuration fields, minimum target `40px`, never for stressful robot
  runtime controls.
- `tablet`: default Bloom density, minimum target `48px`, balanced for touch and readability.
- `comfortable`: preferred runtime/operator density, target `56px`, fewer controls per view.
- `high-visibility`: sunlight, gloves, motor-accessibility, or safety-critical screens, target `64px`, larger text,
  stronger contrast, fewer secondary labels.

Rules:

- Runtime screens should be designed from `1024x600` upward, not squeezed down from desktop.
- Builder pages may stack panels on tablets, but must not create horizontal page overflow.
- Full-bleed surfaces such as navigation bars need explicit tablet rules; negative margins are allowed only with visual
  smoke coverage.
- Use `npm run visual:smoke` after layout changes that affect shell, builder, runtime, or reusable UI primitives.

## Color Usage

Color should help users read state and intent:

- green/sage: primary, stable, active, safe navigation;
- pollen/yellow: control/action grouping or warm emphasis;
- lilac: debug/inspection grouping;
- petal/red-pink: caution/error/destructive actions when paired with text;
- mist/blue-green: camera/observation or quiet informational areas.

Do not rely on color alone. Pair color with:

- label text;
- icon or tag when available;
- button state;
- heading or grouping.

Contrast requirements:

- Theme semantic pairs must meet at least WCAG AA `4.5:1` for normal text.
- Accent/pastel backgrounds should usually use dark text, not white.
- Visual grouping colors can be soft, but interactive labels must remain readable.

The `@bloom/ui` test suite includes contrast checks for all theme presets.

## Iconography

Bloom should not accumulate random icons. Icons are useful only when they clarify interaction faster than text alone.

Rules:

- Do not introduce a large icon library before a repeated need exists.
- Prefer text labels for primary robot/runtime actions.
- Pair icons with labels in operator and builder flows; icon-only buttons need an accessible name and should be rare.
- Use icons for stable semantic families: navigation, camera/vision, controls, debug, safety, devices, logs, settings.
- Icons should use current text color or semantic tokens, not hard-coded brand colors.
- Avoid aggressive/game-like pictograms; Bloom's tone is calm, medtech-neutral, and human-centric.

## Builder UI Guidelines

- Builder home should separate apps, screen library, and playground.
- App configuration should be human-readable: app names, source-app hints, and screen type labels should appear before
  technical IDs.
- Screen composition should support drag/drop and explicit buttons.
- Screen previews should be on-demand or compact so they do not overwhelm the library.
- Builder panels should not steal space from the WYSIWYG canvas once a user is editing a screen.

## Runtime UI Guidelines

- Runtime apps should be full-view operator apps.
- No builder chrome, inspector controls, or edit metadata should appear in runtime.
- Runtime navigation should first let users choose an app, then keep small edit shortcuts for the current app/screen.
- Recently used runtime apps may be shown as shortcuts, but should not hide the full app library.
- Widgets should hide debug details by default when a clean operator interaction is preferable.
- Debug/detail visibility should be configurable per widget.
- Joysticks and sliders should preserve the interaction design validated in legacy Extender UI, while adopting Bloom
  colors and accessibility states.

## Status Surfaces

Status indicators are useful in robotics, but they should not make Bloom feel like a terminal log.

Rules:

- show the smallest truthful status first, such as backend/API reachable;
- do not claim robot/ROS connectivity unless a real adapter confirms it;
- pair color with text because color alone is not accessible;
- keep status labels stable and human-readable;
- separate operator-critical state from debug detail.

Suggested hierarchy:

- Backend/API: connected, connecting, unavailable.
- Runtime session: live, reconnecting, offline.
- Robot adapter: simulated, connected, unavailable.
- Network/device: future deployment-specific integration.

## Documentation Freshness

The in-app Help page tracks:

- help guide last update;
- code reference date.

For now these dates live in:

- `frontend/apps/bloom-dashboard/src/help/help-content.ts`

When a PR changes user-facing workflows, update the Help page and design system docs if relevant.

## Component Styleguide

The lightweight component styleguide lives in `docs/component-styleguide.md`.

It documents current reusable primitives and the rule for promotion:

- keep feature-specific CSS near the feature while it is still changing;
- promote a component to `@bloom/ui` when it appears in multiple product areas or carries accessibility/design-system
  behavior;
- add examples and tests when promoting it.

## Current Critique

Things that are good enough for Phase 2:

- token architecture is in place;
- app-level theme presets exist;
- controlled open-source fonts are bundled through `@bloom/ui`;
- contrast checks protect semantic theme pairs;
- visual smoke checks cover `1024x600`, `1280x800`, and `1920x1080`;
- density and iconography rules are documented;
- visible UI is coherent with the Bloom mood board;
- touch target defaults are documented;
- app configuration and screen library now use color for grouping and comprehension.
- runtime now has an app library, recent shortcuts, and small edit bridges back to builder.

Things to improve before a public release:

- Move repeated dashboard card/action styles into reusable `@bloom/ui` primitives once patterns stabilize.
- Expand visual checks from smoke assertions to screenshot diff baselines when layouts stabilize enough.
- Add app-theme authoring guardrails so user palettes keep contrast.
- Continue promoting repeated dashboard card/action styles into reusable `@bloom/ui` primitives.
- Add more component examples as the primitive set grows.

## Contribution Rules

- Do not add hard-coded product colors in feature code unless there is a documented exception.
- Prefer semantic tokens over palette tokens in reusable components.
- Add or update tests when a shared UI primitive changes behavior.
- Add screenshots or visual QA notes for major builder/runtime UI changes.
- Update this document when introducing new primitives, theme roles, density modes, or app theme behavior.
