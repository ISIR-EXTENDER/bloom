# The pad recipe

A joystick pad has four direction labels, a dead-zone ring and a knob. Tuning those by eye per pad
is how a design drifts: change the pad size and the four gaps stop matching, an arrow orphans onto
its own line, and two pads side by side stop being the same square. This happened three times in
one review cycle, each time as a "small fix".

Every number derives from one input — the pad's edge length `S`.

```
inset      =  8          label edge to pad edge
labelWidth = 64          fits "Right ▶" at the 17px direction-word floor
gap        = 12          label edge to ring, all four sides
lineHeight = 20

block      = inset + labelWidth      = 72
topInset   = block - lineHeight      = 52     (so the text box bottom also lands at 72)
ring       = S - 2 * (block + gap)   = S - 168
deadzone   = ring * 0.2                        the real 0.2 axis dead zone, drawn to scale
knob       = S * 0.26
travel     = 37% of S                          knob centre displacement at full deflection
```

| pad | S | ring | dead zone | knob |
| --- | --- | --- | --- | --- |
| bench Translation / Rotation | 376 | 208 | 42 | 98 |
| corrected-Drive pads | 340 | 172 | 34 | 88 |
| operator Translation / Rotation | 300 | 132 | 26 | 78 |

## Four rules that came from getting this wrong

1. **Ring in px, never %.** A percentage ring on a box that is not exactly square renders an
   ellipse, and the four gaps stop matching. It also hides a flex shrink — a 290 px pad in a 288 px
   container becomes 288×290 and nothing complains.
2. **Arrow bound to its word** with `&nbsp;`. The arrow carries the direction; orphaned on its own
   line it carries nothing, and the left and right labels end up different heights, which reads as
   a crooked pad.
3. **Pads in a pair are the same square.** Set the pad `flex: 0 0 auto` so a flex parent cannot
   shave a pixel off one axis.
4. **Pads in a row share a centre line.** When one column carries a trailing block (a Pivot
   slider), the other gets *equal padding on its pad container* — not a sibling spacer. A spacer
   occupies `gap + height`, so it mis-centres by the flex gap and leaves a visible void under the
   card.

## Column budget

Side columns get their declared minimum from `widget-min-size.md` and nothing more; the pads take
the remainder. On the operator layout: rail 264 (min 260), Height 106 (min 104), gripper column 202
(min 200) — which leaves 318 and 316 for the two pads. The pads are the reason the screen exists.

## Review check

The square in rule 3 is the pad *surface*, not the card. The card is whatever the layout needs —
the shipped operator pads are 314×346 and the bench ones 384×384 — and the renderer derives one
edge length `S` from it, so the surface is square by construction. A renderer test holds that;
the builder checks what a screen can get wrong.

In the builder checklist, for the joysticks on one screen: the same card size, the same `S` derived
from it, and the same pad centre `y`. The message names the pad and which of the three broke. They
are all things a human eye catches only after a screen ships.
