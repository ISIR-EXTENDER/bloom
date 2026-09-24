# Device classes — tablet and desktop

Decided 17 Sep 2026. Two runtime device classes, and a rule for which parts of a design each one
owns.

| | tablet | desktop |
| --- | --- | --- |
| authored at | 1280×720 | 1920×1080 |
| checked at | 1024×600 | 1440×900 |
| input | touch | mouse + keyboard |
| density floor | 48 px, 64 px on accessible profiles | 40 px — unless the profile raises it |
| hover states | never load-bearing | allowed |
| bar height | 44 | 44 |
| who | operators, bench work in the field | bench work at a desk, Bloom Debug |

## Separate apps, paired in the library

A screen does **not** carry two layouts. Each class gets its own seed app, authored independently:
`explorer-manager` and `explorer-manager-desktop`. The library shows them as **one entry with a
device badge**, so a person sees one app and picks a role, not a device.

Authoring them independently is the point — a desktop Robot feedback is not a stretched tablet
Robot feedback, it is six widgets instead of four. Trying to express both from one geometry table
would force the smaller one to win.

## The drift guard

Separate apps duplicate `runtime_policy`, `action_presets` and the three allowlists per robot —
four copies across Explorer and Kinova. Divergence in `allowed_publish_topics` is a safety
property, not a config detail, so:

1. **Shared by reference.** Both apps of a pair carry `policy_id: "explorer"`; the policy block is
   defined once and referenced. No copy exists to drift.
2. **A CI equality check** over any paired apps found in the seed: topics, message types, command
   frame and all three allowlists must be identical. It fails the build, not the review.

A desktop app may legitimately *record* topics a tablet app does not — `/ee_jac` is the live
example — so `allowed_recording_topics` is the one list the check treats as a superset relation
rather than equality.

## Wrong device

A tablet app opened on a desktop, or a desktop app on a tablet, **opens fit-scaled with a banner**
naming the class it was authored for, plus a one-tap switch to the sibling app where one exists.
Nothing is blocked; nothing pretends to be native. The library additionally marks a class a device
cannot run natively, so the common case is avoided before it happens.

## Density is not a device property

**The device class sets the layout. The profile sets the target floor.** These are orthogonal and
conflating them is the trap: a desktop operator with motor disabilities still needs 64 px targets,
and a tablet used only by an engineer still needs 48.

Bloom Debug takes the 40 px desktop scale because no operator profile can open it — the density is
earned by the audience, not granted by the screen size.

## Which screens have a desktop class

| screen | desktop | why |
| --- | --- | --- |
| Bloom Debug | **only** | joint tables and a 6×6 jacobian need the room; nobody diagnoses on a tablet |
| Robot feedback | yes | desktop gets the six widgets back at legible sizes |
| Command sources | yes | a wider plot board and the mode log side by side |
| Joystick Lab | yes | bench work at a desk |
| Drive · Bench | yes | same |
| Runtime app library | yes | |
| Supervisor mirror | yes | |
| Builder | already desktop | needs the density scale documented here |
| Drive · Operator | tablet only | the accessible layout is a touch panel on a chair |
| 3D robot view (the widget) | **only** | WebGL and meshes are a desk's work; the palette refuses it on a tablet screen and the runtime shows a note instead |

## STOP per class

STOP exists on every screen that can command an arm, in every class. Its **position** is fixed
within a class, not across them — the aspect ratio changes, so the rail does. Desktop minimum is
420×140; tablet is 338×252 in the bench rail. The Runtime library carries no STOP because it
commands nothing.

## Tokens this added

The plot board needed eight distinguishable series and the token set had six semantic colours, none
meaning "the fifth thing on a chart" — so the first draft named seven hexes, violating invariant 02.
The fix is a token set for the need: `--bloom-series-1 … -8` in `libs/ui/src/theme.ts`, documented
in `design-system.html` §02b, assigned in order, never semantic.

Also corrected while there: `#7f967e` appeared throughout the designs where `sage` is `#7e967e`.
A one-digit drift nobody can see is exactly why the rule is "reference the token".
