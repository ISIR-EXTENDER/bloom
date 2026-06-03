# 0050 - Builder Screen Lifecycle

## Status

Accepted

## Context

Bloom apps need to reuse screens across apps, but app authors also need quick local operations: create a blank screen,
duplicate a useful screen, remove unused screens, and save the resulting app composition. This should work before the
SQLite migration introduces a normalized screen-library table.

## Decision

The app configuration page now manages screen lifecycle as draft app state:

- available screens are derived from every app in the selected configuration bundle;
- available screen cards show their source app;
- app authors can add screens from other apps;
- app authors can create blank screens with stable generated ids;
- app authors can duplicate existing screens with copied layout, widgets, and settings;
- app authors save or discard the app draft before opening unsaved screens in the WYSIWYG builder.

## Consequences

- The UI already behaves like a lightweight global screen store.
- Future SQLite storage can normalize screens without changing the core composition workflow.
- Screen creation and duplication stay testable as pure configuration-editor operations.
