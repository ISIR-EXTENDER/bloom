# Drive: fix the clipped cards, and stop the class of bug

Closes the geometry findings from the 2026-09-17 Drive review. Full trace in
`docs/design/reviews/2026-09-17-drive.md`.

> Kept as filed. `control-renderers.tsx` was split on 2026-09-24; the joystick's default colour is now the
> `--bloom-axis-translation` token in `JoystickPrimitive.tsx`.

## Why

We shipped a clipped gripper card on both robots and no test failed. `drive-gripper` was authored
130×130 with `show_details: true`; the toggle renderer puts a title, a 56 px button and the literal
topic `/gripper_controller/commands` in that box, which needs 250×144. Two more instances of the
same defect shipped with it — `drive-rz` at 130×260 beside a 130×440 sibling, and the speed sliders
at 210×130 with a header line running past the edge — plus `drive-fault` at 120×60 on kinova.

One cause: authored geometry was trusted and content was never measured against it. Nothing in the
builder, the seeds or the renderers knew how much room a widget needs.

## What changed

**The contract.** `WIDGET_MIN_SIZE` in `frontend/libs/widgets` — a minimum size per widget kind for
both `show_details` states, derived from what each renderer actually renders. The builder inspector,
the review checklist and the seed validator read it. Undersized widgets **warn** with a one-action
fix; nothing is blocked, so every existing seed stays loadable. Widget cards get `min-height` on the
content box instead of `overflow: hidden` — a card grows rather than clips. (ADR 0132)

**Drive becomes two layouts.** `manager_drive_bench` and `manager_drive_operator`, selected by
`UserProfile.preferred_control_layout_id` — which already existed in the model, the API client type
and one seed app, and was read by nothing. Bench is the engineer verifying the command path;
Operator is the person the arm is for. A role may change layout, target size, how a limit is
expressed, detail visibility, scan timing and language — and nothing else. Bench and Operator send
byte-identical messages, so a bench test stays evidence about the operator's session. (ADR 0133)

**Controls are grouped by axis type, not by shape.** Height vertical beside the Translation pad,
Pivot horizontal under Rotation. This is why the Joystick Lab screen reads as well as it does.
Height stays vertical in both layouts: a sideways drag for a vertical motion is exactly the
translation tax this product removes.

**Colour.** Translation axes `#4a9eff` → `#7e967e` sage, rotation `#e0685f` → `#c98a7e` clay. Same
lightness, different hue — distinguishable without either reading as an alarm. `#4a9eff` was the
only pure blue in the product; `#e0685f` was close enough to `error` to read as a warning on a
control that is perfectly safe. The hard-coded `#7fa95f` joystick fallback in
`control-renderers.tsx` becomes `--bloom-color-sage`.

**Copy.** The gripper button is a verb — *Close gripper*, not *Closed* — with the commanded state in
the card header. A button says what it does; a header says what is true.

**kinova's fault echo moves to Robot feedback** at 336×380. A twist is eight lines of mono and Drive
was over-subscribed by two widgets. `drive-fault-reset` stays on Drive, correctly sized, because
clearing a fault is an operating action. Drive geometry is now identical on both robots.

**STOP is chrome, not a widget.** The seeds declare a `reserved_regions` entry for it instead of an
author placing a card; the runtime owns it. Filled error, full-bleed in the status rail, same corner
on every screen, minimum 176×120, exempt from fit-scaling below 64 px of glass.

## Files

| path | |
| --- | --- |
| `docs/design/` | the reference this PR adds — design system page, min-size contract, Drive spec, review log, two ADRs |
| `docs/design/seed/*.json` | corrected `explorer-manager.json` and `kinova-manager.json` |
| `docs/design/DELTAS.md` | all 118 seed changes as before/after rows |
| `frontend/libs/widgets/src/min-size.ts` | new — the constant |
| `frontend/libs/widget-renderers/src/WidgetFrame.tsx` | `min-height` on the content box |
| `frontend/libs/widget-renderers/src/control-renderers.tsx` | token fallback |
| `frontend/apps/bloom-builder` | inspector warning + review checklist rules |
| `frontend/apps/bloom-runtime` | read `preferred_control_layout_id`; honour `reserved_regions` |

## Review notes

Everything in the seeds is data-only except **one** row: `settings.variant: "segments"` on the
operator speed limits needs the slider renderer to support segmented mode. Three 64 px targets
instead of a continuous slider, because a slider demands the exact fine motor control Bloom exists
to stop demanding. If that renderer change is not in scope here, drop those two settings and the
operator layout ships with continuous limits.

Still open, tracked in the review: the segmented renderer; whether 0.08 / 0.15 / 0.30 are the right
three speeds (needs an operator); the 1024×600 pass; and the remaining screens at this standard.
