# 0063 - Builder Screen Library As A Production Entrypoint

## Status

Accepted.

## Context

Bloom apps should be composed from reusable screens. The builder home already
listed screens from all loaded applications, but the list needed to behave more
like a production library as real Petanque, Sandbox, camera, and debug screens
accumulate.

Users should be able to work on a reusable screen without first thinking in
terms of a specific app flow. They should also be able to preview the same
screen in runtime mode without builder chrome.

## Decision

The builder home uses progressive disclosure instead of showing every builder
concern at once. The top-level builder page now has:

- an overview with two large entry cards;
- an apps section for full app workflow management;
- a screen library section for screen-first work.

This keeps app composition and reusable screen design visible but not competing
on the same page.

The builder home screen library supports searchable reusable screens across
all loaded apps. Search matches display titles, legacy screen ids, app names,
configuration ids, screen type tags, and widget kinds.

Screen cards use a display-title convention derived from legacy ids and titles:
`default_live_teleop` appears as `Default Live Teleop`, while the persisted id
stays unchanged. This keeps the UI readable without breaking migrations or
storage compatibility.

Screens are grouped by intent:

- camera views;
- control screens;
- debug monitors;
- device panels;
- workflow screens;
- general screens.

Each group and card carries a meaningful color accent. Color is used as a
reading aid for screen families, not only as decoration.

Each result keeps two explicit actions:

- edit the screen in the WYSIWYG builder;
- preview the screen in runtime mode.

The card copy stays human-readable and avoids raw technical metadata unless it
helps orientation. Technical ids remain searchable and available in details.

## Consequences

- Screen-first workflows are easier to validate before full app composition.
- Real legacy fixtures can grow without making the builder home hard to scan.
- Legacy naming remains stable, while the user-facing library follows a more
  descriptive screen-title convention.
- The next storage slice can promote screens into a normalized shared screen
  library while preserving this UX contract.
