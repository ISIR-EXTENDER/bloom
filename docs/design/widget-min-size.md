# Widget minimum size

Stated at scale 1.0, in the same units as `widget.layout`. Derived from what each renderer in
`frontend/libs/widget-renderers/src` actually puts on screen — not chosen.

A card's fixed overhead is `32` (padding) `+ 24` (title) `+ 8` (gap) = **64 px** before the control
gets a pixel. A readout adds `28`. `show_details` adds a `30 px` detail strip and an `18 px` topic
line, and the topic line is usually what sets the minimum **width**.

| kind | details off | details on | why | in the tree before this change |
| --- | --- | --- | --- | --- |
| `joystick` | 280×332 | 320×400 | 240 pad + 64 chrome + 28 readout; detail chips need 320 wide | ok |
| `slider` vertical | 104×284 | 130×312 | 220 track is the shortest that still resolves 0.01 steps by thumb | `drive-rz` 130×260 |
| `slider` horizontal | 260×104 | 300×132 | title + unit + `min → max` share one header line | speed limits 210×130 |
| `toggle` | 200×120 | 250×144 | verb label needs 200; the topic line needs 250 | `drive-gripper` 130×130 |
| `command-button` **in a labelled group** | 140×88 | — |
| `toggle` **in a labelled group** | 200×88 | — |
| `command-button` | 140×104 | 170×152 | 56 button + a two-line action label under it | modes 150×130, lab 120×82 |
| `topic-echo` | 226×200 | 280×280 | a twist is 8 lines of mono; the action row adds 96 with details on | `drive-fault` 120×60 |
| `topic-plot` / `gauge` | 280×180 | 320×240 | a 30 s trace below 280 wide is decoration | ok |
| `label` | 120×24 | — | at 12 px uppercase, 20 px tall cuts the descenders; 24 is the floor | lab labels h=20 |
| `position-library` | 420×300 | 480×360 | a pose row is 48 tall; fewer than 4 visible is a list that lies | ok |
| `event-log` | 300×200 | 340×240 | 5 entries at 32 px + header | ok |

## Buttons inside a labelled group

A `command-button` or `toggle` that sits under a group `label` does not render its own title — the
label names the whole group. Its minimum is therefore the button plus card padding and nothing else:
`56 + 32 = 88`. Set `settings.hide_title: true` so the renderer and the validator agree on which
derivation applies; without the flag the widget keeps its title and the 104 / 120 minimum stands.

This is the pattern the Joystick Lab already uses (`lab-frame-label` + four frame buttons) and it is
how both Drive layouts express their shaping-mode row. It is a real exemption with a real reason,
not a relaxation: the glass target is still 56, and the group is still named.

## Series colours

`plot-board` series take `--bloom-series-1 … -8` in order, from the ramp in `design-system.html`
§02b. A design never names a hex for a series, and series colour is never semantic.

## Ship it as a constant

`frontend/libs/widgets/src/min-size.ts`, so the builder inspector, the review checklist and the
seed validator all read one source:

```ts
export const WIDGET_MIN_SIZE = {
  joystick:            { off: [280, 332], on: [320, 400] },
  'slider:vertical':   { off: [104, 284], on: [130, 312] },
  'slider:horizontal': { off: [260, 104], on: [300, 132] },
  toggle:              { off: [200, 120], on: [250, 144] },
  'command-button':    { off: [140, 104], on: [170, 152] },
  // in a labelled group (settings.hide_title) the widget renders no title of its own:
  'command-button:grouped': { off: [140, 88], on: [140, 88] },
  'toggle:grouped':         { off: [200, 88], on: [200, 88] },
  // settings.layout "inline": title and commanded state beside the button
  'toggle:inline':          { off: [360, 88], on: [360, 88] },
  'topic-echo':        { off: [226, 200], on: [280, 280] },
  'topic-plot':        { off: [280, 180], on: [320, 240] },
  gauge:               { off: [280, 180], on: [320, 240] },
  label:               { off: [120,  24], on: [120,  24] },
  'position-library':  { off: [420, 300], on: [480, 360] },
  'event-log':         { off: [300, 200], on: [340, 240] },
  'plot-board':        { off: [480, 280], on: [480, 280] },
  'plot-picker':       { off: [260, 200], on: [260, 200] },
  'value-strip':       { off: [440, 140], on: [440, 140] },
};
```

Shipped as `frontend/libs/widgets/src/min-size.ts` with `minSizeFor(kind, settings)`; a test keeps this block and the
constant identical. The label floor is 24, matching the table above and every shipped group label.

## The target is physical

A canvas fit-scaled to 0.8 turns a 56 px button into 45 px of glass. This table is stated at
scale 1.0; the builder must also report the **effective** size after fit, for the whole screen —
not for one selected widget. Nothing an operator acts on may land below 44 px of glass, and the
`comfort` preset holds 56.

## Enforcement

Warn, never block (ADR 0132). An undersized widget gets a pollen corner tag on the canvas and the
inspector offers *Resize to 250×144* as a single action. Publishing surfaces it in the review
checklist alongside geometry, touch bounds, overlap, command frame and topic policy.
