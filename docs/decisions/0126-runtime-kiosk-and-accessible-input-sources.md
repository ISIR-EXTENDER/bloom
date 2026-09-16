# 0126 - Runtime kiosk and accessible input sources

Date: 2026-09-16

## Context

Bloom's operator runtime shared product navigation, edit exits, screen tabs, and a diagnostic strip with the control
surface. On a `1024x600` wheelchair-mounted tablet, those elements consumed space and made accidental navigation easier
while an operator was watching the robot.

The configuration model also carried motor-accessibility presets that changed little or nothing. A joystick implicitly
required sustained finger movement even though Bloom's runtime intent and teleop composition boundaries could accept
other input sources.

## Decision

Make runtime a kiosk and make input method a profile/runtime concern above the robot adapter.

- Keep one 44 px bar for app and truthful operating context.
- Put screen switching, diagnostics, Help, app/library exits, and editing behind a 1.5 second maintenance hold.
- Keep STOP fixed outside app-authored geometry. Engage on pointer-down and require a one-second hold to resume the
  backend latch.
- Support keyboard pads, discrete step targets, latched controls with explicit release, switch scanning, dwell
  activation, browser gamepads, audio state cues, per-axis dead zone, and repeat guards.
- Feed all Cartesian sources into the existing `TeleopTwistComposer`; adapters receive normalized commands and do not
  learn which device produced them.
- Report a selected widget's effective `1024x600` size in Builder and warn when an interactive target falls below 44 px.

## Rationale

The primary runtime action is operating a robot, not navigating Bloom. A deliberate hold keeps maintenance reachable
without leaving six stray exits under the operator's hand.

STOP cannot be an app widget because app authors could move, resize, overlap, or omit it. A backend latch gives multiple
clients one state and survives a local rerender; the held resume prevents an accidental second tap from restarting.

Input devices should map to intent, not fork the ROS path. That keeps accessibility behavior testable without ROS and
lets touch, keyboard, gamepad, scan, or dwell use the same policies, frame, rate limit, audit, and zero-release behavior.

## Consequences

- Runtime screenshots and automation must use the maintenance hold before switching screens.
- App screens must reserve the fixed STOP area and maintained seeds are checked for bounds/overlap.
- Profile fields (`deadzone`, `repeat_guard_ms`, `scan_period_ms`, `dwell_ms`, `audio_cues`) now affect runtime behavior.
- Stepped and latched return-to-center controls automatically publish zero after 15 seconds without renewed input.
- Switch scanning currently moves focus and clicks a target, but clicking a joystick pad emits no direction. Four
  scannable step targets and an emitted-intent test remain a P1 correction; scan and dwell are also mutually exclusive.
- Implemented capability does not imply operator/device acceptance; each claimed profile needs live evidence.
- Fit scaling can still shrink authored geometry. The Builder warning makes the risk visible but does not yet prevent it.
- Supervisor mirroring, role onboarding, edge-layout behavior, and runtime localization remain separate design work in
  `docs/ux-design-handoff.md`.

## 2026-09-16 Amendment

Both scanning follow-ups are delivered. Scan renders directional step targets, and `dwell_enabled` is independent of
the motor preset. Existing `dwell` profiles retain their behavior, while a scan profile can use dwell on a direct
target or on the SWITCH bar to activate the highlighted target. `dwell_ms` remains duration-only because its nonzero
default cannot safely imply enablement.

Runtime localization is also delivered for the operator shell. `UserProfile.language` selects complete EN/ES/FR
catalogs for status, STOP, Maintenance, scanning, Settings, and empty states; authored app and widget labels remain
configuration data. See `docs/validation/2026-09-16-runtime-language.md`.

Guided practice now reuses the selected profile's language, scan period, dwell behavior, and app-authored labels while
remaining structurally outside the robot action path: the component receives no action client, intent callback, or
teleop callback. It replaces the live controls and suspends composition until the operator leaves practice. See
`docs/validation/2026-09-16-guided-tours.md`.
