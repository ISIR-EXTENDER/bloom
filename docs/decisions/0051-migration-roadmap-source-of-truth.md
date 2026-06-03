# 0051 - Migration Roadmap Source Of Truth

## Status

Accepted

## Context

Bloom now has several useful planning documents. Without a clear owner, roadmap items can diverge between migration,
widgets, inventories, and README notes.

## Decision

`docs/migration-plan.md` is the single source of truth for roadmap status and ordered next steps.

Supporting documents keep their specialized role:

- `docs/widgets-screens-apps-foundation-plan.md` stores foundation design notes.
- `docs/widget-migration-inventory.md` stores legacy widget classification and migration ideas.
- `docs/decisions/` stores accepted decisions and development journal entries.

## Consequences

- Roadmap updates happen in one place.
- Supporting docs can preserve context without becoming competing TODO lists.
- Recaps should reference `docs/migration-plan.md` first, then link to inventories when details are needed.
