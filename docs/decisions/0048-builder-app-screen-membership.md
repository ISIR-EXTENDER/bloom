# 0048 - Builder App Screen Membership

## Status

Accepted

## Context

The app configuration page needs to compose an app from existing screens before Bloom has a dedicated global screen
library table. Legacy `extender_ui` configurations already contain reusable screens inside applications, and the
upcoming SQLite migration should not require a frontend rewrite for basic app composition.

## Decision

Bloom derives an available screen list from all screens in the selected configuration bundle.

- App configuration edits screen membership as a local draft.
- Users can add existing screens to the current app or remove assigned screens.
- The app must keep at least one screen.
- Opening the screen builder is disabled while the app draft has unsaved membership changes.
- The backend still persists the whole application through the existing configuration API for now.

## Consequences

- The builder can support app composition before introducing a dedicated screen-library persistence model.
- SQLite can later store screens separately while preserving the same add/remove UX.
- The draft boundary prevents opening a screen builder against stale persisted app state.
