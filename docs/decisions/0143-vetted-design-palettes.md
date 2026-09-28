# 0143 — Vetted design palettes, chosen per app, per role and per tablet

Date: 2026-09-28

## Context

A lab user asked for interface colours he could see better. Bloom had five theme presets, but the runtime read only
the app's `theme.preset_id`; `UserProfile.app_theme_preset_id` was stored and never read, the Builder's colour pickers
only tinted the Home card, and runtime CSS still carried about thirty literal colours (a `#22c55e` ready at 2.2:1, an
unavailable outline at 2:1 that vanished on dark, shadows and gradients in the Bloom greens). `--bloom-danger` was used
and defined nowhere. A free palette editor would let an author ship a STOP that no longer stands out.

## Decision

- **A small curated catalog** in `frontend/libs/ui/src/theme.ts`: Bloom Garden (`bloom`), Extender (`extender-ui`),
  High visibility (`high-contrast`), Dark (`dark`), Colour-blind safe (`colour-safe`, Okabe-Ito, blue for action,
  vermilion for STOP, bluish green for ready) and Pastel (`pastel`: pinks, lilac and mint on cream with plum text; a
  raspberry STOP at 350° could not be told from teal under protanopia, so its STOP is a coral red at 6°). No free
  colour pickers.
- **A preset owns every colour role**, including `stop`/`stop-latched`, `success`, `unavailable-outline`, `hairline`,
  the shadow colour, `surface-bright` (what surfaces lighten toward), the 3D command colour and the eight plot series.
  A preset may tighten corner radii; sizes and touch targets stay with the design contracts. Stylesheets read tokens
  only; `theme-tokens.test.ts` fails on a new literal colour or an undefined token.
- **Each palette is proven by `theme-contrast.test.ts`**: text pairs at 4.5:1 (7:1 for High visibility), focus ring,
  scan ring, unavailable outline and STOP at 3:1 on every surface, and STOP at least 40° of hue from primary,
  secondary and success and still distinct from primary and success under protanopia and deuteranopia.
- **Precedence**: this tablet's choice (Settings > Colours, stored with the other per-role overrides) > the role's
  `app_theme_preset_id` > the app's `theme.preset_id`. An empty role palette follows the app.
- **Retired ids stay readable**: `bloom-default`, `clinical` and `petanque-play` read as `bloom`, `high-visibility` as
  `high-contrast`, `extender` as `extender-ui`, in the backend model and the frontend normalizer. No seed used
  `clinical` or `petanque-play`; Petanque was already on Bloom Garden. A role's old `bloom-default` reads as "follow
  the app".
- The app keeps its four-colour `palette` summary for readers that predate this. It is derived from the chosen
  palette for a new app only; an existing app's summary is never rewritten, because the seed fingerprint excludes
  model defaults and the shipped apps were stamped with the old default summary.
- Outside a session, the library and the landing page keep the last session's resolved palette (the selected app's
  before any session). The supervisor mirror shows the operator role's palette: a tablet's override is stored on that
  tablet and does not travel to the mirror.

## Consequences

- Bloom Garden moves slightly: STOP `#a8392a` (was `#9b3d2e`), error text `#8f3527`, ready `#135c4f`, a darker dashed
  unavailable outline. Kinova and Explorer apps stay on Bloom Garden.
- A new palette is a code change reviewed against the tests, not an authoring action.
- `npm run visual:smoke` captures every palette at 1280x720; `BLOOM_SCREEN_SWEEP_PALETTE=dark npm run visual:sweep`
  sweeps every screen on one palette.
