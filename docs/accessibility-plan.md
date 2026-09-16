# Bloom Accessibility Plan

Reviewed 2026-09-16. Bloom is the active Extender IHM, so accessibility behavior is a runtime contract rather than a
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
  maintenance hold.
- STOP is fixed runtime chrome, engages immediately, follows a backend latch, and requires a one-second hold to resume.
- Status uses words, color, and shape together. Audio cues can announce stop, link loss, and recovery.
- Joysticks use pointer events and are keyboard operable. Direction words are visible inside the pad.
- A browser gamepad contributes through the same conditioned 6-DoF command as touch and keyboard controls.
- App profiles control display density, font scale, motor behavior, audio, dead zone, repeat guard, scan timing, and
  independently enabled dwell timing.
- The builder reports a selected interactive widget's effective size on the `1024x600` target and warns below 44 px.
- Runtime discloses any fit below authored size in Maintenance with the source geometry and actual rendered percentage.
- A widget whose required backend seam is explicitly unavailable remains visible, becomes inert, and exposes the
  backend reason; unknown capability state does not disable it.
- Semantic theme pairs are tested at a minimum 4.5:1 contrast ratio, including the corrected muted-text surface pairs.
- Forms use visible labels and touch-friendly input hints; drag/drop workflows retain button alternatives.

## Motor And Input Profiles

The supported `motor_accessibility_preset` values have concrete runtime behavior:

| Preset | Current behavior |
| --- | --- |
| `default` | Direct touch/pointer and keyboard control. |
| `large-targets` | Enlarged operator controls. |
| `assisted-touch` | Enlarged touch-oriented presentation. |
| `reduced-motion` | Reserved profile value; browser `prefers-reduced-motion` is honored, but profile-specific wiring remains open. |
| `step` | Compatible joysticks and sliders expose discrete targets instead of requiring a drag; held teleop values expire after 15 seconds. |
| `latch` | Compatible controls retain a value until explicit zero/release or the 15-second attention timeout. |
| `scan` | Joysticks/sliders render step targets and the highlight advances through every enabled button; SWITCH activates the highlighted target. |
| `dwell` | Legacy step-and-dwell preset retained for existing profiles. New profiles use `dwell_enabled`. |

Related profile fields are bounded by the configuration model:

- `font_scale`: `0.75..2.0`;
- `deadzone`: `0..0.5`, applied per axis and rescaled above the threshold;
- `repeat_guard_ms`: `0..600`;
- `scan_period_ms`: `600..3000`;
- `dwell_enabled`: explicit boolean, independent of the motor preset;
- `dwell_ms`: `400..4000`;
- `audio_cues`: enabled or disabled per profile.

Dwell can run alongside scanning, and resting on SWITCH activates the highlighted target. It cannot shorten the
one-second STOP resume hold. Scan is disabled while stopped. A released pointer, stick, or
latched zero action must clear its contribution rather than leave a standing robot command.
Stepped or latched return-to-center values also publish zero after 15 seconds without renewed input.

## Builder And Runtime Rules

- Every interactive control uses a semantic element or an appropriate interactive role with an accessible name.
- Focus remains visible, and route changes move focus to useful main content.
- Runtime never exposes builder affordances on the primary operating surface.
- Color is never the only status signal.
- Touch targets should be at least 44 px on glass, with 48 px or more preferred and 56/64 px profile targets available.
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

These are repository-level checks. They do not prove that a real switch, gamepad, tablet mounting position, sound level,
or interaction pattern works for a particular person.

## Open Accessibility Work

- Validate every intended profile with operators and the actual HMTECH tablet, gamepad, and switch hardware.
- Prevent or reflow runtime fit scales that reduce an interactive target below its accepted physical size; Maintenance
  now warns, but does not make a shrunken layout acceptable.
- Add whole-screen device-frame and touch-check views for all lab geometries, not only a selected-widget calculation.
- Decide whether named portable profiles need language, operator-frame preference, response curves, tremor smoothing,
  minimum-contact filtering, or other proposed signal conditioning beyond today's dead zone and repeat guard.
- Add generic live collision feedback in the builder.
- Decide whether fixed control positions and additional non-visual cues are needed for eyes-off use.
- Add role-aware onboarding; review the delivered EN/ES/FR safety language with native speakers and operators.
- Wire the `reduced-motion` profile value explicitly or remove it; today only the browser/OS media preference changes
  motion.
- Design supervisor mirroring and explicit control ownership/handover.
- Add a stable browser-level automated accessibility scan while retaining keyboard, screen-reader, hardware, and
  operator checks that automation cannot replace.

The design-review backlog is maintained in
[the UX design handoff](ux-design-handoff.md).
