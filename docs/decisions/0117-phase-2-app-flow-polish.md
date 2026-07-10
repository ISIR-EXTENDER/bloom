# 0117 - Phase 2 App Flow Polish

Date: 2026-07-10.

## Context

Phase 2 left several non-blocking app-library follow-ups after the core
SQLite-backed app/screen storage was stable. The most useful next slice is the
part operators and builders touch every day: creating a real starter app,
resuming runtime apps, preserving profile preferences, promoting playground
work, and keeping theme assets from accumulating forever.

## Decision

Add a guided app creation path in Builder Home:

- app name;
- starter screen selection;
- design-system preset;
- optional onboarding spots.

Persist runtime user preferences in versioned browser storage:

- recent runtime app selections;
- preferred display profile per configuration/app.

Promote playground screens into saved apps by copying the selected screen into a
new one-screen app, preserving the source app theme, runtime policy, profiles,
and action presets.

Clean up theme moodboard assets when an app replaces its moodboard URI, deletes
the app, deletes a screen, or replaces/deletes the whole configuration. Cleanup
is conservative: only assets served from the same configuration theme-assets
route are removed, and only when the new saved bundle no longer references them.

## Consequences

- Builder Home now has a useful app creation path instead of a placeholder
  starter button.
- Runtime recents survive page reloads without becoming shared server state.
- App profiles can be selected explicitly while preserving automatic viewport
  selection as the default.
- Theme asset storage has a lifecycle policy, which clears the way for cached
  screen thumbnails in a later slice.
- Robot/backend status adapters and virtual keyboard workflows remain separate
  follow-ups because they need live hardware validation rather than just storage
  polish.

