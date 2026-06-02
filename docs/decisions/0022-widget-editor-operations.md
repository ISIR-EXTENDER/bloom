# 0022. Widget Editor Operations

## Status

Accepted.

## Context

Bloom needs a future editor that can create and modify screens without duplicating mutation logic in React components.
The old `extender_ui` editor proved the interaction model, but much of the behavior lived directly in component/store
code.

## Decision

Add pure editor operations to `@bloom/widgets`:

- add a widget from capability defaults;
- remove a widget;
- update widget title;
- update widget settings with validation;
- move widgets;
- resize widgets;
- optionally snap move/resize values to the editor grid.

These operations return new screen objects and preserve unrelated configuration data.

## Consequences

Future React editor state can stay thin and call tested domain operations. The same operations can also support import
tools, demos, and eventually SQLite-backed screen updates without coupling the logic to React or browser state.
