# 0051 - Migration Roadmap Source Of Truth

## Status

Superseded on 2026-09-16

## Context

Bloom now has several useful planning documents. Without a clear owner, roadmap items can diverge between migration,
widgets, inventories, and README notes.

## Decision

`docs/migration-plan.md` was the single source of truth for roadmap status and ordered next steps during the migration.

Supporting documents keep their specialized role:

- `docs/widgets-screens-apps-foundation-plan.md` stores foundation design notes.
- `docs/widget-migration-inventory.md` stores legacy widget classification and migration ideas.
- `docs/decisions/` stores accepted decisions and development journal entries.

## Consequences

- Roadmap updates happen in one place.
- Supporting docs can preserve context without becoming competing TODO lists.
- Recaps should reference the roadmap first, then link to inventories when details are needed.

## 2026-09-16 Amendment

Bloom is now the active Extender IHM and `extender_ui` is legacy. The phase-based migration roadmap was deleted because
it made completed product ownership look undecided and mixed design work with live validation. Current behavior is in
`docs/operator-runtime.md`; open design, engineering, validation, and legacy-cleanup work is in
`docs/ux-design-handoff.md`.

## Amendment, 2026-09-17

The two supporting documents named above were deleted with the 0.2.0 documentation pass.
`docs/widgets-screens-apps-foundation-plan.md` and `docs/widget-migration-inventory.md` described what to take from
`extender_ui` and in which order; that migration is finished and Bloom is the shipped interface. The foundations they
argued for are in `docs/architecture.md`, and the widget geometry contract they could not state is in
`docs/design/widget-min-size.md`. This decision keeps its original text as the record of how the roadmap was owned.
