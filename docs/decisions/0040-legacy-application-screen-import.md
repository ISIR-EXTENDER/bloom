# 0040 - Legacy Application Screen Import

## Status

Accepted.

## Context

The first Bloom screen migration needs to test more than a single isolated screen. Existing `extender_ui` applications
reference screen IDs, while the real screen JSON files hold widget layouts and settings separately.

The previous legacy application import preserved the application shell but created placeholder screens only. That was
useful for validating IDs, but not enough to preview migrated controls, cameras, sliders, joysticks, or navigation in the
Bloom dashboard.

## Decision

Add a migration path that imports one legacy application JSON file together with one or more legacy screen JSON files.
Matching screen placeholders are replaced with converted real screens, while unmatched application screens remain as
placeholders for later migration slices.

The first migrated app fixture uses:

- `app-petanque-admin.json`;
- `default_control.json`;
- `default_live_teleop.json`;
- `default_petanque.json`.

This gives Bloom an end-to-end migration slice that can be loaded through the backend API and rendered by the frontend
dashboard.

## Consequences

- Legacy app migration can progress screen by screen without deleting or rewriting the original JSON files.
- The frontend can test migrated screens using a real configuration bundle fixture.
- Missing widgets or screens remain visible as migration gaps instead of being hidden.
- The CLI can be reused to seed local file or SQLite storage during manual validation.
