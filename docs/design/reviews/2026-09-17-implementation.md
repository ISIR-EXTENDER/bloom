# Implementation review — the 2026-09-17 handoff

**Date** 2026-09-17 · **Plan** [`implementation-plan.md`](../implementation-plan.md) · **Commits** `3785001` →
this entry · **Outcome** phases 0–10 on `main`; the §5 scope stays open

Format: what shipped → where it differs from the handoff → what stayed open → evidence.

---

## What shipped

| Phase | Commits | Result |
| --- | --- | --- |
| 0 Track the design | `3785001` | `docs/design/` followed on git, ADRs renumbered to 0132 and 0133 |
| 1 Contract | `b890f02`, `7f6909b`, `1758780` | minimum sizes, pad recipe, `reserved_regions` (SQLite v7), tokens |
| 2 Card anatomy | `4fb2f97`, `d32cd87` | four card families, segments, verb toggles, grouped buttons |
| 3 Runtime chrome | `649e446`, `5eb61c1`, `8cfc522`, `c0ffaaf`, `e0ac986`, `34179f7` | STOP region, kiosk bar, maintenance sheet, full-panel scale, Settings, layout resolution |
| 4 Manager screens | `de356f4` | Drive · Bench and Drive · Operator on both robots, the other screens to spec |
| 5 Plot kinds | `0513178` | plot board, picker, value strip, Command sources verdict |
| 6 Library | `1cf1918` | list and role rail, no `Auto`, derived device badges |
| 7 Bloom Debug | `d4ea562`, `c233dca` | 1920×1080 layout, joint table, Jacobian, Kinova fault state |
| 8 Builder | `d03426f` | panel-true canvas, regions, Too small, glass chip, resize action, review rules |
| 9 Landing and locale | `aa5e61e` | 7b landing, operator glossary in ES and FR |
| 10 Docs | `04bcc70` and this commit | captures, operator guide, builder help, changelog |

## Where it differs from the handoff

Each difference is recorded with its reason in the plan's §2 and §9. The ones a reviewer will notice on screen:

- **Stopped state.** The handoff keeps mode, frame, and gripper buttons live while stopped. Bloom keeps its earlier
  behaviour: the whole screen goes inert and only STOP answers. Relaxing it is a safety decision, not a styling one.
- **Kinova Drive · Bench fault reset** sits at `136,548`; the spec's slot overlaps Pivot.
- **Kinova speed segments** are 0.025 / 0.05 / 0.10, inside the gen3's 0.1 m/s.
- **Positions stays editable** until the save-a-pose flow is designed.
- **Library badges read "tablet only"** for every Manager app, because no `-desktop` sibling exists yet.
- **Bloom Debug proximity reads "not reported"**, because joint limits are not exposed to Bloom.
- **STOP has no 64 px glass floor.** Every shipped `stop` region stays far above it at the 0.8 fit, so the floor waits
  for a screen that needs it.

## Found by building it

- **A held joystick under the maintenance sheet resumed motion after the zero.** The §8.3 audit test caught it before
  any operator did. The runtime now refuses everything but releases while motion is held (`34179f7`).
- **Undersized action cards overflowed the Sandbox tablet** once cards grew instead of clipping (`d32cd87`).
- **Stream cards grew under STOP** in Bloom Debug; streams now scroll inside their authored height (`04bcc70`).
- **The Height slider's direction words hugged the left edge**, capped by the pad label width. They are centred now.

## What stayed open

From the plan's §5, unchanged in scope:

- Paired desktop apps, `policy_id`, and the wrong-device banner. The builder's paired-app policy rule is inert until a
  pair exists.
- 1024×600 collapse layouts. The tablet panel fit-scales at 0.8 until they are designed.
- Desktop layouts for Drive · Bench, Joystick Lab, Robot feedback, Command sources, and the supervisor mirror.
- The save-a-pose flow.
- Left-handed mirroring of the operator layout.
- The operator speeds 0.08 / 0.15 / 0.30, which need an operator and Mégane to confirm.

Needs people or hardware rather than code:

- **Pivot sign** on the robot. `scale: -1` publishes `+angular.z` for left on the wire; nobody has watched the arm turn.
- **ES and FR wording**, STOP and the resume hold above all, before participant use.
- **The landing hero** still shows its placeholder until a photograph is chosen.

Seen in the captures and worth a later pass:

- A control the backend reports unavailable covers its own card with the reason, including the card title on the
  Joystick Lab gripper. It is truthful, but the reason truncates at narrow widths.
- The runtime library takes the selected app's theme, so Bloom Debug's blue leads the README capture.

## Evidence

- Frontend: 480 dashboard tests and 118 renderer tests pass; Biome and the build are clean.
- Backend seed and contract tests pass, including identical messages from Drive · Bench and Drive · Operator.
- `visual:smoke` passes with the new routes (library, maintenance, Bloom Debug at 1920×1080 and 1440×900, builder).
- ROS bench against a live `cartesian_manager` without a robot: 11 of 12 captures pass. `12-supervisor-mirror` fails in
  isolation because it expects an operator session from an earlier page, not because of the mirror.
- README captures refreshed from the ROS bench on 2026-09-17.
