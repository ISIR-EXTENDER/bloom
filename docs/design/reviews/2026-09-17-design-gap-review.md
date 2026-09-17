# Design gap review — implementation against the handoff

**Date** 2026-09-17 · **Compared** every handoff prototype artboard (1b–7c) with the live app on the Explorer
simulation at 1280×720, 1024×600 and 1920×1080 · **Follows** [2026-09-17-implementation.md](2026-09-17-implementation.md)

Format: what the pass found → what landed → what stays open. Gaps were classed as a documented deviation (plan §2, §8,
§9 or the implementation review), known out of scope (plan §5 or a spec's "Open" list), or unexplained. Only the
unexplained ones were work.

---

## Counts

| Class | Found | Fixed | Open |
| --- | --- | --- | --- |
| Documented deviation | 15 | — | 15, by decision |
| Out of scope | 5 | — | 5 |
| Unexplained, high | 3 | 3 | 0 |
| Unexplained, medium | 15 | 14 | 1 |
| Unexplained, low | 12 | 8 | 4 |

A code review of the same range and the recording of the walkthrough found further defects on the same surfaces. They
are listed under *Found alongside* because they changed what a screen shows.

## Fixed

**High**

- **Kinova Robot feedback.** The fault row grew the series picker 34 px under STOP. Pickers and the joint table now
  scroll inside their slot.
- **Another operator owns the robot.** The bar said READY over a locked screen. It now reads NOT IN CONTROL, and
  **Take control** is at least 56 px (64 on accessible profiles).
- **French speed segments** clipped "Moyenne". Segment labels wrap.

**Medium**

- The maintenance sheet pushed **Resume operating** below the fold at 1280×720; its More group scrolls.
- Bloom Debug's picker and joint table ran off a 1080 px screen; they scroll, and the raw echo reaches its minimum.
- Spanish and French group labels clipped under Gripper, and pad direction words ran outside their pads; both wrap.
- Untranslated operator words: frames, Hold snake, group labels, screen titles and role names now come from the
  glossary. Topic names stay as written.
- The Settings try-it heading promised a real control; it now says nothing is sent.
- Settings no longer fit 1280×720, and STOP later took a rail beside it; it fits again.
- A frame the robot never offers used the faded "held" treatment; it is drawn dashed as unsupported.
- The Joystick Lab echo read "nothing sent" before any twist; it names the command frame, and empty text wraps.
- The landing page drew a focus ring around the whole page on load and had no side gutter at 1280.
- Speed-limit thumbs were 40 px against the 48 px bench floor.
- The **⋯** hold button stuck out below the 44 px bar as a white tab.
- A zero dead zone read `0.00`; it reads **each control's own**.
- Builder: the inspector's size and minimum panel sat about 1500 px down; the widget list is capped and the selection
  scrolls into view. Label kind badges covered their text, and the desk was a darkened ink rather than charcoal.

**Low**

- Speed readouts showed a third decimal ("0.150 m/s").
- The library forgot the last app when its configuration loaded second, kept a stale device note after a resize,
  ignored Escape on its menu, and pushed **This device** below the fold.
- Pivot's "Turn right" wrapped while "Turn left" did not.
- Bench speed-limit cards rendered 129 px against 120 authored; they render 124 px and no longer overlap.

## Found alongside

- **STOP vanished over Settings and the practice tour** (code review). It is now a full-height rail those views keep
  clear. A first attempt pinned the small corner card, which covered **Save and resume**; the rail replaced it.
- **Settings had no touch exit except saving** (code review). **Discard changes** leaves without saving.
- **The joint table never filled on the simulation**: passive gripper joints report NaN, which is not JSON, so every
  `/joint_states` sample was dropped (demo recording).
- **Spanish Pivot words ran under the knob** (demo recording).
- **A new blank screen promised a migration**, new screens started on 1280×800, the palette added widgets below their
  minimum, and a stray TOO SMALL tag rose over the product nav (demo recording).
- **Plots**: stacked subscriptions doubled samples, a 100 Hz topic kept 9 s of a 30 s window, the y range clipped
  joint positions, the newest sample drew past the edge, and manipulability near 8e-5 read `0.000` (code review and
  the simulation run).
- **The publish-rate fact claimed zeros at rest** (simulation run).

## Open

**Needs a decision**

- **Operator target floor.** `device-classes.md` gives 48 px, and 64 px on accessible profiles. The library and
  Settings describe the comfort preset as 56 px (`TARGET_PX.comfort`). The handoff contradicts itself between 5a and
  the device table, so pick one before changing either.

**Unexplained, not yet fixed**

- The builder's selection chip (`W×H · N px glass`) sits above the selection and can cover the widget above it. The
  prototype places it the same way.
- Bloom Debug: its role pill reads **Default** because the app declares no profiles (the design shows Bench), and
  Pause, Clear and Copy are 36 px.
- The raw echo's empty text and its Pause, Clear and Copy labels are hard-coded English.
- The maintenance sheet's wording and the landing page's header, headline and button sizes drift from the prototype;
  the plot board draws its y bounds inside the plot where the prototype draws them outside.

**Documented deviations** stay as recorded: STOP live above the scrim, the Kinova fault reset slot and speed segments,
no Kinova Go home, Positions keeping capture, "tablet only" badges, Bloom Debug's "not reported" limits and session-best
manipulability, an unavailable reason covering its card, the maintenance sheet's second group, Settings without the
frame chooser, the library's supervisor entry, a fully inert stopped screen, no robot name in the bar, real widgets on
the builder canvas, and the landing placeholder image.

**Out of scope** (plan §5): the 1024×600 collapse layouts (at 0.8 scale some targets reach 38 px), the wrong-device
banner (Bloom Debug opens at 0.65 on a 1280 panel), paired desktop apps, the save-a-pose flow, and a desktop library
layout.

## Evidence

Paired prototype and live captures, with measured card sizes, overlaps, clipped text and target sizes, were kept out of
the repository. The fixes carry their own before and after checks in the commit bodies, and the suites, contracts,
visual smoke and `npm run e2e:sim` pass on `main` after them.
