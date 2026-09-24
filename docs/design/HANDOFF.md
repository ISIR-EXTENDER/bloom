# Handoff: Bloom UI implementation — geometry contract, role split, device classes

> Filed as delivered on 17 Sep 2026. Paths below are the handoff's own: `design/` is now `docs/design/`,
> `prototypes/` is `docs/design/prototypes/`, and ADRs 0131 and 0132 were renumbered 0132 and 0133 because 0131 was
> already taken. The build is tracked in `implementation-plan.md`. `control-renderers.tsx` was split on 2026-09-24 into
> `joystick-renderer.tsx`, `slider-renderer.tsx` and `gesture-pad-renderer.tsx`; the joystick's default colour in §3 is
> the `--bloom-axis-translation` token in `JoystickPrimitive.tsx`.

## Overview

This package closes the gap between Bloom's shipped runtime and the UX design review. It contains a
**living design system**, a **per-widget geometry contract**, **corrected seed JSON for both robots**,
and specs for eleven screens.

The work started from three shipped defects — a clipped gripper card on Drive, a Pivot slider half
its sibling's height, and speed readouts cut mid-digit — and found they were one missing rule, not
three bugs: *authored geometry was trusted and widget content was never measured against it.* Nothing
in the builder, the seed files or the renderers knew how much room a widget needs, so no test failed.

Everything here follows from fixing that.

## About the design files

The files in `prototypes/` are **design references written as HTML**. They are prototypes of intended
look and behaviour — **not production code to copy**. The task is to recreate them in Bloom's existing
environment: React + TypeScript in `frontend/`, with Python/Pydantic models in `backend/`, using the
established patterns in `frontend/libs/ui`, `frontend/libs/widget-renderers` and
`frontend/libs/widgets`.

Each `.dc.html` opens directly in a browser. They are interactive — drag the joysticks, latch STOP,
toggle series in the plot board, select widgets in the builder canvas — so behaviour can be felt
rather than inferred from prose.

## Fidelity

**High fidelity.** Colours, type, spacing, radii and every widget geometry are final and derived from
real values: tokens from `frontend/libs/ui/src/theme.ts`, content heights from the renderers in
`frontend/libs/widget-renderers/src`, and layout coordinates that are the same numbers written into
the corrected seed JSON. Recreate the UI to these values.

Two exceptions, both marked in the prototypes: the landing page's hero image is a placeholder
awaiting a real photograph, and the ES/FR strings on the locale page need a native speaker who knows
the arm.

## What to read first

1. `design/README.md` — the four rules and the folder map.
2. `design/design-system.html` — open in a browser. Tokens, type, density, the artboard, card
   anatomy, the pad recipe, minimum sizes, states, chrome, locale, builder, landing, invariants.
   Every later document assumes it.
3. `design/widget-min-size.md` — the contract, with the constant to ship.
4. `design/screens/*.md` — one file per screen, each carrying its geometry table.

The screen specs are the source of truth for geometry. The prototypes are generated from the same
tables, so if a prototype and a spec disagree, the spec wins and it is a bug in the prototype.

## Code changes, in dependency order

### 1. `frontend/libs/widgets/src/min-size.ts` — new

The `WIDGET_MIN_SIZE` constant and `minSizeFor(kind, settings)`, verbatim from
`design/widget-min-size.md`. Three consumers read it: the builder inspector, the review checklist,
and a seed validator. One source, no copies.

Note the two derivations: a widget with `settings.hide_title` (a button or toggle sitting under a
group `label`) renders no title of its own, so its minimum is button + padding = 88 rather than 104.

### 2. `frontend/libs/widget-renderers/src/WidgetFrame.tsx`

`min-height` on the content box; remove `overflow: hidden`. **A card grows rather than clips.**
Clipping an operator control is never the correct failure mode — this is the change that makes the
original bug impossible rather than merely fixed.

### 3. `frontend/libs/widget-renderers/src/control-renderers.tsx`

- Replace the hard-coded `#7fa95f` joystick fallback with `--bloom-color-sage`.
- Add the categorical series ramp `--bloom-series-1 … -8` to `frontend/libs/ui/src/theme.ts` and
  reference it; see `design-system.html` §02b. Plot series take it **in order**, never semantically,
  and wrap at eight with a dashed stroke rather than inventing a ninth colour.
- `sage` is `#7e967e`. `#7f967e` appears in several seed theme palettes and is a typo.

### 4. Slider renderer — `variant: "segments"`

Three labelled segments instead of a continuous track, from `settings.segment_labels` and
`settings.segment_values`. **This is the one item that blocks a design from shipping as drawn**: the
operator Drive layout expresses its speed limits this way because a continuous slider demands the
exact fine motor control Bloom exists to stop demanding. If it is out of scope for the first PR, drop
those two settings and the operator layout ships with continuous limits.

### 5. New widget kinds — `plot-board`, `plot-picker`, `value-strip`

Full settings shape and minimum sizes in `design/screens/diagnostics.md`. One large plot, N series
over a shared axis, a picker beside it that doubles as the legend. `emphasis: true` draws a series at
double stroke weight. This replaces six small widgets on each of two screens with three that are
readable.

### 6. Runtime — screen resolution reads the profile

```
profile.preferred_control_layout_id → screen id, falling back to the app's first screen
when it is empty or names a screen that does not exist.
```

The field already exists in `backend/libs/config/models.py`, is typed in the API client, is asserted
in `test_config_models.py`, and is populated in `explorer-user-tests.json`. **No frontend file reads
it.** Wiring it is roughly 30 lines and is the whole mechanism for the Bench/Operator split. Empty
preserves today's behaviour, so every existing app is unaffected.

### 7. Runtime — `reserved_regions`

Screens now declare regions the runtime owns; STOP is one. Honour them: draw the chrome there and
prevent widget placement. STOP is not a widget — it cannot be moved, resized or removed by an app
author, and it appears on every screen that can command an arm.

### 8. Builder — inspector and review checklist

- Size check against `minSizeFor`, warning with a one-tap *Resize to W×H*. **Warns, never blocks**, so
  existing seeds stay valid.
- Effective **glass** size after fit-scaling, per screen not per widget, in error colour below 44 px.
- Reserved regions drawn on the canvas.
- A device-class switcher between the paired tablet and desktop apps.
- Checklist additions: minimum size, sibling symmetry, profile coverage (every profile's layout id
  resolves), and paired-app policy equality.

`prototypes/Bloom Builder Landing Locale.dc.html` option `7a` shows all of this working.

### 9. Paired apps and the policy guard

Device classes are **separate seed apps**: `explorer-manager` and `explorer-manager-desktop`, shown as
one library entry with a device badge. That duplicates `runtime_policy`, `action_presets` and the
allowlists, and **drift in `allowed_publish_topics` is a safety property**. Two mitigations, both
recommended:

1. `policy_id` on the app, with the policy block defined once and referenced.
2. A CI check that paired apps agree on topics, message types, command frame and allowlists.
   `allowed_recording_topics` is a superset relation, not equality — desktop may record `/ee_jac`.

Full rationale in `design/device-classes.md`.

## Data changes

`design/seed/explorer-manager.json` and `design/seed/kinova-manager.json` are **complete, ready to
commit**. `design/DELTAS.md` lists every change as a before/after row with the reason, so the diff is
reviewable without reading two 40 KB files.

Summary of what changed:

- `manager_drive` becomes `manager_drive_bench` and `manager_drive_operator`.
- Three profiles per app, each with a real `preferred_control_layout_id`.
- Gripper 130×130 → 250-plus with verb labels (`"Close gripper"`, not `"Closed"`) and the commanded
  state in the card header. A button says what it does; a header says what is true.
- Pivot and Height grouped by axis type rather than by shape: Height vertical beside the Translation
  pad, Pivot horizontal under Rotation.
- `show_details: false` throughout both Drive layouts; topics are diagnostics, and the Joystick Lab
  is the diagnostic surface.
- Axis colours `#4a9eff` → sage and `#e0685f` → clay. The first was the only pure blue in the
  product; the second was close enough to `error` to read as a warning on a control that is safe.
- Joystick Lab: labels 20 → 24 px, buttons 82 → 88, the twist echo 226 → 338 wide so a twist prints
  without wrapping, and STOP added — it had none.
- Robot feedback and Command sources rebuilt on the plot board; joint states and `/ee_jac` moved to
  Bloom Debug, and they appear greyed in the feedback picker saying where they went.
- kinova's fault echo moves to Robot feedback at a legible size; the fault reset stays on Drive.
- `reserved_regions` on every bench screen.

## The decisions that shape it

| decision | where | why |
| --- | --- | --- |
| Minimum size per widget kind; warn, don't block | ADR 0132 | the missing rule behind all three shipped defects |
| The profile selects the control layout | ADR 0133 | two audiences disagree on one axis; a role must never change what is published |
| Bench and Operator stay separate | review log F10 | Operator is the **accessible** layout and differs in *wording*; Bench is for debugging and may be denser |
| Joystick Lab stays separate from Drive · Bench | `screens/joystick-lab.md` | both are bench surfaces; their similarity is correct, not redundant |
| Tablet and desktop as separate paired apps | `device-classes.md` | a desktop diagnostic screen is six widgets, not a stretched four |
| Device class sets layout; profile sets the target floor | `device-classes.md` | a desktop operator with motor disabilities still needs 64 px |
| `Auto` display profile removed | `screens/runtime-library.md` | it silently picked a layout; on an accessibility surface that is the wrong default |

## Screens

Eleven, each with a geometry table in `design/screens/`:

Drive · Bench, Drive · Operator, Positions, Joystick Lab, Robot feedback, Command sources, Runtime
library, Bloom Debug (desktop), Runtime Settings, Maintenance sheet, plus the builder canvas, landing
page and locale reference.

## Design tokens

Canonical list in `design-system.html` §02, §02b, §03 and §04. Do not re-derive them from the
prototypes — `theme.ts` is the source of truth and the page renders from it.

The three numbers most often got wrong: the bench rail starts at **x 928**, STOP is **928,410
338×252** on every tablet bench screen, and the operator target floor is **64 px of real glass**.

## Assets

No new binary assets. The prototypes reference Atkinson Hyperlegible, JetBrains Mono and Cormorant
Garamond from Google Fonts — the same three faces `theme.ts` already declares. Atkinson is there for
its disambiguated letterforms, not its look; do not substitute it.

The landing page needs one photograph that does not exist yet: the arm in use, in a real room, with a
person. It is the single biggest improvement available to that page.

## Files in this bundle

```
design/                     the committable folder — drop it in at docs/design/
  README.md                 the four rules, the folder map, the bench rail
  design-system.html        the living reference (open this first)
  widget-min-size.md        the contract + the constant
  pad-recipe.md             the joystick pad formula and the four rules behind it
  device-classes.md         tablet vs desktop, paired apps, the drift guard
  DELTAS.md                 every seed change, before/after, with reasons
  PR-DESCRIPTION.md         paste-ready PR body
  decisions/                ADR 0132, ADR 0133
  reviews/                  the dated review log — finding → decision → screen
  screens/                  one spec per screen, each with its geometry table
  seed/                     corrected explorer-manager.json and kinova-manager.json

prototypes/                 design references — interactive, not production code
  Bloom Design System.dc.html
  Bloom Drive Options.dc.html            1a/1b/1c Drive directions, 2a role selection
  Bloom Runtime Screens.dc.html          3a Positions, 3b Joystick Lab, 4a/4b plot board
  Bloom Desktop And Library.dc.html      5a library, 5b Bloom Debug desktop
  Bloom Settings And Maintenance.dc.html 6a settings, 6b maintenance sheet
  Bloom Builder Landing Locale.dc.html   7a builder canvas, 7b landing, 7c locale
  support.js                             runtime for the prototypes
```

## Still open — needs a person, not a decision

- The segmented slider renderer (blocks the operator speed limits shipping as designed).
- Whether 0.08 / 0.15 / 0.30 m/s are the right three speeds. Needs an operator.
- ES/FR safety wording checked by a native speaker — especially STOP and the resume hold.
- The 1024×600 pass on both Drive layouts. Context collapses to 88, rail to 196, stage keeps the
  rest; nothing hides and nothing moves.
- Desktop layouts for Drive · Bench, Joystick Lab, Robot feedback, Command sources and the supervisor
  mirror. The pattern is established by Bloom Debug; the geometry tables are not written yet.
- Saving a named pose has no flow at all — capture, name, confirm. The current build offers no way to
  create one.
