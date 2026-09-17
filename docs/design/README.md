# docs/design

Design lives where the thing it describes lives, and changes in the same pull request as the code.

| file | what it is | who reads it |
| --- | --- | --- |
| `design-system.html` | The living reference: tokens, type, density, artboard regions, card anatomy, minimum sizes, states, chrome, locale, builder, landing, invariants. | anyone building a screen |
| `widget-min-size.md` | The geometry contract per widget kind, plus the constant to ship. | whoever authors a screen or reviews one |
| `device-classes.md` | Tablet and desktop — paired apps, the drift guard, and why density is not a device property. | |
| `pad-recipe.md` | The joystick pad formula — labels, ring, dead zone, knob — derived from one input. | whoever touches a pad |
| `screens/drive.md` | The Drive spec: two layouts, what each is for, every number and why. | Drive implementers |
| `screens/positions.md` | Positions — a pose is dispatched once and nothing reports back. | |
| `screens/joystick-lab.md` | Joystick Lab — the review reference, and its eleven violations. | |
| `screens/runtime-library.md` | The library — seven apps, lifecycle, and what replaces the Display-profile select. | |
| `screens/diagnostics.md` | Robot feedback and Command sources — the plot board, and what moved to Bloom Debug. | |
| `reviews/2026-09-17-drive.md` | The review that produced it: finding → decision → screen. | anyone asking "why is Pivot 400 wide now" |
| `../decisions/0132-…`, `0133-…` | ADRs for the two rules that constrain code, filed with the other ADRs. | engineering |
| `prototypes/` | The interactive HTML prototypes the screens were drawn in. Serve the folder over HTTP to open them. | anyone checking a behaviour |
| `HANDOFF.md` | The handoff note that delivered this folder. | |
| `implementation-plan.md` | How the handoff is being built and tested, and the decisions taken while planning. | engineering |
| `seed/` | Commit-ready `explorer-manager.json` and `kinova-manager.json`. | whoever merges |
| `DELTAS.md` | Every seed change as a before/after row, generated from the transform. | reviewers |
| `PR-DESCRIPTION.md` | Paste-ready PR body. | whoever opens the PR |

## The rule this folder exists to enforce

Bloom had tokens, presets, contrast tests and a written design system, and still shipped a clipped
gripper card. Nothing in the builder, the seed files or the renderers knew how much room a widget's
own content needs. Authored geometry was trusted and content was never measured against it.

Four rules close that:

1. **Every widget kind declares a minimum size**, computed from what it renders in the configuration it is given.
2. **A card grows rather than clips.** `min-height` on the content box, never `overflow: hidden`.
3. **Siblings of one kind on one row share one size.** Asymmetry has to mean something.
4. **The builder warns, it does not block.** Existing seeds stay valid; the fix is offered as one action.

And one more that came from this review cycle rather than the build: **derive, never tune.** Any
repeated piece of geometry — the pads are the clearest case — gets a formula with one input, written
down, and not a set of numbers adjusted by eye per instance. See `pad-recipe.md`.

## Working order

Read `design-system.html` first — it is the only page that needs to be open while designing.
Author at 1280×720, check at 1024×600. Run the review checklist before export.
When a screen changes, update its file in `screens/` and add a dated entry in `reviews/`.

## The bench rail

Every bench-side screen — Drive · Bench, Positions, Joystick Lab, Robot feedback, Command sources —
reserves the rail and puts STOP in it at the same place. The stage is `14–916`, the rail `928–1266`,
and STOP is `928,410 338×252`. A control is then in the same place on every screen of the app by
construction rather than by care, which is what invariant 06 asks for. The seed declares it as a
`reserved_regions` entry so no author can place a widget there.

The stage grid inside it: Height `14`, first pad `136`, second pad `532`, pads 380 px square. Drive ·
Bench and Joystick Lab share it exactly, so a bench user switching screens re-learns nothing.
