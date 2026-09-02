# 0121 - Application lifecycle and archiving

Date: 2026-09-02

## Context

Bloom carries apps at different stages. Sandbox V0.0 and Explorer Manager target
the current `cartesian_manager` architecture. Petanque does not: it is a working
reference for a workflow nobody has replaced, still on `/teleop_cmd` and the
legacy `sandbox_controller` feedback topics.

That left Petanque in a bad position. Finishing it would mean maintaining an app
against an architecture it is not part of. Deleting it would lose the only
working description of the Petanque workflow. Leaving it undeclared meant every
release conversation re-litigated whether its 60% parity was a blocker.

## Decision

`ApplicationConfig` carries a `lifecycle` of `active` or `archived`, defaulting
to `active`.

**Archived** means kept and still runnable, but not maintained against the
current robot architecture and not a release gate. Petanque is archived.

Archiving changes four things:

- The app is labelled in the runtime library, so an operator opening it knows
  what they have.
- Its parity check asserts the **legacy** contract it was built for, including
  `/teleop_cmd`, and says so at the top of the script.
- The coherence check reports it as archived and still validates it against its
  own declared policy. Archiving means it keeps working, not that it stops being
  checked.
- Release notes and the migration plan can stop treating its completion
  percentage as a gap to close.

## Rationale

**Archiving is the honest middle state.** "Finished" and "deleted" were both
false. A third state that says *kept, working, not being advanced* describes
reality, and reality is what a release decision needs.

**Archived apps are still checked.** It would be simpler to skip them, and
wrong: the point of keeping Petanque is that it still runs. An archived app that
silently broke would be worse than a deleted one, because it looks available.

**Unknown values normalize to `active`.** A configuration written before this
existed describes an app someone is still carrying forward. Defaulting the other
way would hide a live app from its operator.

## Consequences

- `lifecycle` appears in the shared contract fixture, so the API response shape
  changed. It is optional on the frontend type and defaults on both sides.
- The QA sweep rejects any value that is neither `active` nor `archived`, since a
  typo would leave an app neither gated nor labelled.

## What archiving does not mean

It is not a retirement gate. `docs/legacy-retirement-gates.md` still governs when
something may be removed, and Petanque's gate is unchanged: live operator
validation of the replacement first.
