# Screen — Drive

Two layouts, one app, selected by the profile. Both robots get identical geometry.

**The tables below are the source of truth.** The design mock (`Bloom Drive Options`, options `1b`
and `1c`) is *generated* from them, so a visual tweak cannot silently drift from the committed JSON.
That drift is what produced the original clipped-card bug; authoring the mock in flex while
hand-deriving the seed reproduced it three times in one review cycle.

| | `manager_drive_bench` | `manager_drive_operator` |
| --- | --- | --- |
| for | debugging, mostly by people without motor impairment | the person the arm is for, including motor disabilities |
| profile | `bench` | `operator`, `one-switch` |
| `display_preset` | `default` | `comfort` |
| target floor | 48 px (tablet density) | 64 px (high-visibility) |
| speed limits | continuous, in the status rail | Slow / Medium / Fast segments |
| pads | 380 px squares | 310 px squares |
| grouping | four regions | by axis type — move / aim |

## Why two and not one

Decided in review on 17 Sep 2026 (Susi): they stay separate, and the axis is **accessibility, not
verbosity**.

Operator is the accessible layout. It differs from Bench in *language* as much as in geometry:
speed as Slow / Medium / Fast rather than 0.15 m/s, buttons named for what they do rather than what
they publish, 64 px targets, no adapter vocabulary anywhere on the glass.

Bench is the debugging layout, used mostly by people without motor impairment. It may therefore
carry more information and smaller targets than the operator surface — the 48 px tablet density,
detail strips where the geometry allows, continuous limits an engineer can set to 0.137 to
reproduce a bug.

This means a role varies **wording**, not only layout and density. Plain-language copy is a property
of the operator profile. What a role still may not touch is unchanged: topics, message types,
command frame, dead zone semantics, publish rate, STOP behaviour, policy allowlists.

Everything else the roles change is density and arrangement. Neither shows topics: `show_details` is
**off on both Drive layouts**. The diagnostic surface is the Joystick Lab screen, which the bench
profile reaches and the operator profile does not — a topic string on a driving screen is wrong for
an engineer too, it is just survivable.

## Bench — four regions

Context row y=14 h=120 · stage y=146 · bench rail x=928. Canvas 1280×720, bar 44, so the widget
origin is 14,14 and the last pixel is 1266,662. Pads are 380 px squares in 384 px cards, with the
widget title overlaid in the card's top corners rather than in a row above it — that row was 32 px
the pads could have, and a pad's corners are empty by construction.

| widget | kind | layout | note |
| --- | --- | --- | --- |
| `bench-mode-label` | label | 14,14 560×24 | names the shaping group |
| `bench-fault-label` (kinova) | label | 902,14 364×24 | |
| `drive-mode-both` | command-button | 14,46 176×88 | `hide_title` |
| `drive-mode-jaco` | command-button | 202,46 176×88 | `hide_title` |
| `drive-snake-hold` | command-button | 390,46 176×88 | `hide_title`, momentary |
| `drive-gripper` | toggle | 590,14 300×120 | keeps its title — the commanded state lives in the header |
| `drive-z` (Height) | slider vertical | 14,146 110×384 | overlaid title |
| `drive-translation` | joystick | 136,146 384×384 | pad 380 |
| `drive-rotation` | joystick | 532,146 384×384 | pad 380 |
| `drive-rz` (Pivot) | slider horizontal | 532,548 384×114 | overlaid title |
| `bench-speed-label` | label | 928,14 338×24 | |
| `drive-max-linear-speed` | slider horizontal | 928,134 338×132 | continuous, 56 px thumb |
| `drive-max-angular-speed` | slider horizontal | 928,278 338×132 | continuous, 56 px thumb |
| `drive-fault-reset` (kinova) | command-button | 590,548 326×114 | |
| **reserved** `stop` | runtime chrome | 928,410 338×252 | |

On explorer the 590,548 slot is empty. That is deliberate: Drive geometry is then identical on both
robots, and an empty slot costs nothing next to a control that moves between robots.

## Operator — grouped by axis type

Left column is read, not touched. Everything touched is in one reach arc.

| widget | kind | layout | note |
| --- | --- | --- | --- |
| `drive-max-linear-speed` | slider segments | 14,14 264×150 | Slow / Medium / Fast |
| `drive-max-angular-speed` | slider segments | 14,176 264×150 | |
| `op-mode-label` | label | 14,338 264×24 | |
| `drive-mode-both` | command-button | 14,370 264×88 | `hide_title` |
| `drive-mode-jaco` | command-button | 14,470 264×88 | `hide_title` |
| `drive-snake-hold` | command-button | 14,570 264×88 | `hide_title`, momentary |
| `op-move-label` | label | 290,14 436×24 | names the linear group |
| `op-aim-label` | label | 738,14 314×24 | names the angular group |
| `drive-z` (Height) | slider vertical | 290,46 110×346 | body 314 |
| `drive-translation` | joystick | 412,46 314×346 | pad 310 |
| `drive-rotation` | joystick | 738,46 314×346 | pad 310 |
| `drive-rz` (Pivot) | slider horizontal | 738,404 314×146 | body 114 |
| `drive-gripper` | toggle | 1064,14 202×168 | keeps its title |
| `drive-fault-reset` (kinova) | command-button | 1064,194 202×104 | keeps its title |
| **reserved** `stop` | runtime chrome | explorer 1064,194 202×468 · kinova 1064,310 202×352 | |

**Move the hand** — Height vertical + Translation pad, the three linear axes.
**Aim the hand** — Rotation pad + Pivot horizontal, the three angular ones.

Height must stay vertical. An earlier draft made it horizontal to match Pivot, which asked an
operator to translate a sideways drag into a vertical motion — precisely the tax this screen exists
to remove. Pivot horizontal is correct for the opposite reason: turning left reads left.

Height and Pivot are one slider rotated: 110 px thick, as long as the pad edge. See `pad-recipe.md`
for the pad formula and for the four rules that came from getting it wrong.

## Cards hug their content

Every card is exactly as large as what it holds; spare column space falls *outside* the borders,
not inside them. A stretched card with padding compensation puts the void inside a drawn border,
which reads worse than the gap it was hiding.

Pads in a row share a centre line by construction — both pad bodies are the same square and both
columns start at the same `y`.

## Mirroring

`operator` assumes a right-handed reach. A left-handed operator mirrors the whole stage on one
profile flag; the reserved STOP region mirrors with it, and STOP stays the largest target either way.

## What the role may and may not change

May: layout, target size, how a limit is expressed, whether details are visible, scan/dwell timing,
language.

May not: topics, message types, command frame, dead zone semantics, publish rate, STOP behaviour,
policy allowlists. Bench and Operator send byte-identical messages — otherwise a bench test stops
being evidence about the operator's session.

## Open

- Segmented slider renderer (blocks the operator speed limits shipping as designed).
- `settings.hide_title` on command-button and toggle, plus the grouped minimum in the validator.
- `reserved_regions` honoured by the runtime instead of an author placing a STOP widget.
- 1024×600 pass: context collapses to 88, rail to 196, the stage keeps the rest. Nothing hides,
  nothing moves.
