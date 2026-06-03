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

The builder home screen library now supports searchable reusable screens across
all loaded apps. Search matches screen names, app names, configuration ids, and
widget kinds.

Each result keeps two explicit actions:

- edit the screen in the WYSIWYG builder;
- preview the screen in runtime mode.

The card copy stays human-readable and avoids raw technical metadata unless it
helps orientation.

## Consequences

- Screen-first workflows are easier to validate before full app composition.
- Real legacy fixtures can grow without making the builder home hard to scan.
- The next storage slice can promote screens into a normalized shared screen
  library while preserving this UX contract.
