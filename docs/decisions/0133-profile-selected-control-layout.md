# 0133 - The profile selects the control layout

**Status** accepted · **Date** 2026-09-17 · **Related** 0068 (profile-ready application model), 0115, 0132

## Context

Drive serves two audiences whose needs conflict on exactly one axis: whether the screen reports what
it is publishing. An engineer verifying the command path needs the topic, the axis map and a
continuous limit they can set to 0.137 to reproduce a bug. The person the arm is for needs none of
that on the glass, and pays for it in reading time and in targets that shrank to make room.

Serving both from one screen produced a screen that was slightly wrong for both — visible in the
review as clipped cards, 130 px controls and topic strings on an operator surface.

`UserProfile.preferred_control_layout_id` already exists: defined in
`backend/libs/config/models.py`, typed in the API client, asserted in `test_config_models.py`, and
populated in `explorer-user-tests.json`. No frontend file reads it. It is a no-op field.

## Decision

A screen's audience is a property of the **profile**, not of the app, the device or a runtime toggle.

1. Drive ships as two screens in one app: `manager_drive_bench` and `manager_drive_operator`.
2. Screen resolution reads `profile.preferred_control_layout_id` first, falling back to the app's
   first screen when it is empty or names a screen that does not exist. Empty preserves today's
   behaviour, so every existing app is unaffected.
3. A role may change: layout, target size, how a limit is expressed, whether details are visible,
   scan/dwell timing, language.
4. A role may **not** change: topics, message types, command frame, dead zone semantics, publish
   rate, STOP behaviour, policy allowlists. Bench and Operator send byte-identical messages.
5. The role is chosen where the session starts — the runtime library offers each app's profiles by
   name, so launching is choosing. Changing role mid-session goes through the maintenance hold,
   because it is not an operating control.
6. The kiosk bar's profile slot displays the role.
7. The builder's review checklist gains **profile coverage**: every profile's layout id must
   resolve, and every layout must pass ADR 0132 at that profile's density.

## Consequences

Rule 4 is the load-bearing one. If a role could change what reaches the manager, a bench test would
stop being evidence about the operator's session — which is the entire reason a bench layout exists.
It is enforceable in review because both layouts are built from the same widget list with only
`layout` and presentation settings differing.

Naming: *Bench*, not *Developer* or *Advanced*. It says where you are standing rather than who is
cleverer, and it does not invite an operator to go looking for the advanced one.

Cost is roughly 30 lines in screen resolution plus one checklist rule. No schema migration: the
field, the type and the test already exist.

## Alternatives considered

**A runtime toggle on the screen.** Rejected. It puts a mode switch on an operator surface, it is
one mis-tap from a very different screen, and it makes "which layout was this session run on"
unanswerable after the fact.

**Two separate apps.** Rejected. The runtime policy, action presets and allowlists would be
duplicated and would drift, and drift in `allowed_publish_topics` is a safety property.

**Device-based selection.** Rejected. The same tablet is used on the bench and on the chair; the
person is what changed.
