# 0107 - Runtime Display Profile Application

Date: 2026-06-05

## Context

Bloom apps can already declare display/user profiles, but runtime rendering did not apply them. For Extender tablet use,
operators need comfortable controls at `1024x600`, `1280x800`, and `1920x1080` without changing the canonical WYSIWYG
screen geometry.

## Decision

Runtime now resolves an active display profile from the app profile list and viewport size:

- small tablet-like viewports prefer `high-visibility`;
- medium tablet-like viewports prefer `comfort`;
- apps without profiles fall back to a safe default profile;
- the runtime workspace applies profile data through CSS variables and data attributes;
- the canonical screen/widget layout remains unchanged.

## Consequences

- Builder and runtime continue sharing one screen/widget model.
- Runtime can adapt touch targets, shell padding, and font scale for tablet operation without introducing duplicate
  layouts.
- A later explicit user/profile selector can reuse the same resolver and CSS hooks.
- Visual smoke checks remain important because profile effects are intentionally presentation-level.

## 2026-09-16 Amendment

Runtime now prefers the locally saved profile id before viewport matching. A
profile also drives motor/input behavior (`step`, `latch`, `scan`, `dwell`,
large/assisted targets), audio cues, per-axis dead zone, repeat guard, scan
period, and dwell duration. Browser `prefers-reduced-motion` is honored, but the
matching profile value is not wired independently yet. Shared seeds demonstrate
only part of that matrix; an app still needs explicit layout and hardware
validation for each profile it claims. The current scanner advances focus and
clicks targets, but clicking a joystick pad emits no direction; single-switch
teleop remains open, and scan/dwell are mutually exclusive presets today.
