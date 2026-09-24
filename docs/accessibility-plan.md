# Bloom Accessibility Plan

Reviewed 2026-09-17. Bloom is the active Extender IHM, so accessibility behavior is a runtime contract rather than a
future migration enhancement.

Bloom should be usable by people with different bodies, devices, contexts, and levels of technical expertise. Operators
may use a tablet in sunlight, under stress, with gloves, with limited sustained movement, or while looking at a robot
instead of the display.

This plan follows the spirit of the
[GitHub Open Source Guide accessibility practices](https://opensource.guide/accessibility-best-practices-for-your-project/):
document expectations, use semantic UI and clear language, make keyboard/focus behavior reliable, pair color with other
signals, and test accessibility continuously.

## Current Runtime Contract

- Runtime is a kiosk. Product navigation, editing, diagnostics, and screen switching stay behind a 1.5 second
  maintenance hold. Under scanning the **⋯** button is a scan target and its activation opens maintenance directly,
  because a switch cannot hold; the sheet and Settings then scan themselves.
- STOP is fixed runtime chrome, engages immediately, follows a backend latch, and requires a one-second hold to resume.
  Under scanning it is the first target of every cycle, wherever it is drawn, so a switch never waits out a screen to
  reach it.
- While the STOP latch is on, canvas controls are `aria-disabled` and out of the tab order, not merely inert in CSS.
- Status uses words, color, and shape together. Audio cues can announce stop, link loss, and recovery.
- Joysticks use pointer events and are keyboard operable. Direction words are visible inside the pad.
- A browser gamepad contributes through the same conditioned 6-DoF command as touch and keyboard controls.
- App profiles control display density, font scale, motor behavior, audio, dead zone, repeat guard, scan timing, and
  independently enabled dwell timing.
- The builder reports a selected interactive widget's effective size on the smallest panel of its device class —
  `1024x600` for a tablet screen, `1440x900` for a desktop one — and warns below 44 px. The review checklist measures
  every control on every screen there and names the first one that fails.
- Every authorable widget kind declares a minimum size and grows rather than clips, so a control never loses its label
  or its target to a card that was drawn too small. Screen regions the runtime owns, STOP above all, are reserved and
  cannot be covered by a widget.
- Runtime discloses any fit below authored size in Maintenance with the source geometry and actual rendered percentage.
- A widget whose required backend seam is explicitly unavailable remains visible, becomes inert, and exposes the
  backend reason; unknown capability state does not disable it.
- Semantic theme pairs are tested at a minimum 4.5:1 contrast ratio, including the corrected muted-text surface pairs.
- The keyboard focus ring is a two-tone theme token (`focusRing` plus `focusRingContrast`), tested so one half always
  clears 3:1 (SC 1.4.11) against the surface, the cream and forest chrome, and the STOP red.
- Forms use visible labels and touch-friendly input hints; drag/drop workflows retain button alternatives.
- Guided runtime practice uses the current profile's language, font scale, scanning, and dwell behavior, and exposes no
  robot command interface. Its movement and hold checks can be repeated from Maintenance or Settings.
- Builder review derives geometry, touch-size, overlap, minimum-size, sibling-symmetry, pad-pair, profile-coverage,
  command-frame, and topic-policy checks from the saved app, then requires an actual profile preview and export for the
  final checks.
- The supervisor mirror uses a separate read-only status surface, reports whether an operator currently owns control,
  and exposes no command or STOP/resume controls that could create an accidental role handover.
- A second operator Runtime keeps the whole artboard inert behind a named ownership notice. Its explicit takeover retry
  does not force handover, while the fixed STOP remains reachable and resume remains owner-only.

## Motor And Input Profiles

The supported `motor_accessibility_preset` values have concrete runtime behavior:

| Preset | Current behavior |
| --- | --- |
| `default` | Direct touch/pointer and keyboard control. |
| `large-targets` | Enlarged operator controls. |
| `assisted-touch` | Enlarged touch-oriented presentation. |
| `step` | Compatible joysticks and sliders expose discrete targets instead of requiring a drag; held teleop values expire after 15 seconds. |
| `latch` | Compatible controls retain a value until explicit zero/release or the 15-second attention timeout. |
| `scan` | Joysticks/sliders render step targets and the highlight advances through every enabled button, STOP first; SWITCH activates the highlighted target. |
| `dwell` | Legacy step-and-dwell preset retained for existing profiles. New profiles use `dwell_enabled`. |

Related profile fields are bounded by the configuration model:

- `font_scale`: `0.75..2.0`;
- `deadzone`: `0..0.5`, applied per axis and rescaled above the threshold;
- `repeat_guard_ms`: `0..600`;
- `scan_period_ms`: `600..3000`;
- `dwell_enabled`: explicit boolean, independent of the motor preset;
- `dwell_ms`: `400..4000`;
- `audio_cues`: enabled or disabled per profile.

Dwell is a rest: movement of more than a few pixels inside a control restarts its timer, so a pointer crossing a control
on its way elsewhere never fires it. Dwell can run alongside scanning, and resting on SWITCH activates the highlighted
target. It cannot shorten the one-second STOP resume hold. A blocked Runtime limits scan and dwell to **Take control**
and the universal STOP instead of exposing robot controls. Scanning keeps running while stopped, with the resume control
as its only target, because a switch operator has no other way back; a switch press on it resumes, the scan cycle
standing in for the pointer hold. A released pointer, stick, or latched zero action must clear its contribution rather
than leave a standing robot command.
Stepped or latched return-to-center values also publish zero after 15 seconds without renewed input.

## Builder And Runtime Rules

- Every interactive control uses a semantic element or an appropriate interactive role with an accessible name.
- Focus remains visible, and route changes move focus to useful main content.
- Runtime never exposes builder affordances on the primary operating surface.
- Color is never the only status signal.
- Touch targets should be at least 44 px on glass, with 48 px or more preferred and 56/64 px profile targets available.
  Runtime Settings holds 56 px for a touch profile and 64 px for a scan, dwell or high-visibility one. Controls inside a
  fitted artboard still shrink with the fit; that is the open scale item below, not a per-control size.
- Builder geometry remains canonical; any fit scaling that reduces controls must be visible during authoring and in
  runtime Maintenance, then covered by viewport checks.
- Robot command widgets need a human label, state/release behavior, and readable failure feedback.
- Native OS/browser keyboards remain the text-entry baseline. A custom virtual keyboard requires evidence that native
  input blocks the target workflow.
- Technical topic, message, and axis details belong in configuration or maintenance diagnostics. The one effective
  command frame remains visible because it changes movement meaning; a dedicated frame-selection workflow must use
  operator labels, capability gating, and a zero-motion interlock.

## Current Test Evidence

- Component and app-wiring tests cover labels, roles, focus, keyboard joystick operation, hold gestures, STOP,
  directional switch scanning, dwell, step, latch, gamepad conditioning, audio state transitions, profile resolution,
  and Joystick Lab frame safety.
- `@bloom/ui` tests enforce contrast for semantic theme pairs.
- Seed/config tests reject out-of-canvas and overlapping interactive controls on maintained operator apps.
- Visual smoke covers maintained runtime and builder routes across tablet and desktop viewports.
- The builder's selected-widget check tests the 44 px physical target warning.
- Runtime fit tests cover the raw safety threshold, guarded render scale, and Maintenance-only disclosure.
- Runtime capability tests cover explicit unavailability, unknown reports, inert content, visible explanations, and
  unchanged operation when ROS seams are available.
- Runtime Settings tests cover scanning, dwell, reversible per-profile changes, and a local-only safe preview.
- Runtime language tests cover complete EN/ES/FR catalogs, English fallback, immediate switching, translated STOP and
  status states, and a 40%-expanded visual-smoke pass.
- Guided-tour tests cover real-action completion, persisted checks, scanning, policy diagnosis, and the absence of
  teleop or ROS publish calls from practice. Visual and live `1280x720` captures cover both tour surfaces.
- Supervisor tests cover the reduced client surface, direct app routes, separate-tab entry, command absence, and shared
  status reads. Visual smoke covers the mirror at all maintained viewports, including an internal topic-fit assertion.
- Ownership tests cover the blocked artboard, universal STOP, disabled non-owner resume, explicit claim/release,
  disconnect neutralization, and backend rejection of concurrent command attempts.

These are repository-level checks. They do not prove that a real switch, gamepad, tablet mounting position, sound level,
or interaction pattern works for a particular person.

## Open Accessibility Work

- Validate every intended profile with operators and the actual HMTECH tablet, gamepad, and switch hardware.
- Prevent or reflow runtime fit scales that reduce an interactive target below its accepted physical size; Maintenance
  now warns, but does not make a shrunken layout acceptable.
- Add a live whole-screen touch view and switchable device frames for all lab geometries. The review checklist now
  measures every control, but only as a step an author has to open, and only at the screen's own class.
- Decide whether named portable profiles need language, operator-frame preference, response curves, tremor smoothing,
  minimum-contact filtering, or other proposed signal conditioning beyond today's dead zone and repeat guard.
- Add generic live collision feedback in the builder.
- Decide whether fixed control positions and additional non-visual cues are needed for eyes-off use.
- Decide whether to offer the reusable practice tour automatically on first entry. The library already marks and
  preselects the role used last on this device, but never opens by itself. Review the delivered EN/ES/FR safety
  language, and the operator glossary on the controls, with native speakers and operators.
- ~~Decide the `reduced-motion` profile value: wire it or remove it.~~ Removed 2026-09-24: nothing on the operating
  surface animates (no transition or animation in the runtime or library styles, and the 3D view renders on demand),
  so the browser/OS preference, honoured where the chrome does move, is the whole of it.
- Validate supervisor status and ownership readability on the actual second display. Keep deliberate handover in
  Runtime unless a later safety design explicitly adds supervisory command controls.
- Add a stable browser-level automated accessibility scan while retaining keyboard, screen-reader, hardware, and
  operator checks that automation cannot replace.

The design-review backlog is maintained in
[the UX design handoff](ux-design-handoff.md).
