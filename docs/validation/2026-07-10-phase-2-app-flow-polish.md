# 2026-07-10 Phase 2 App Flow Polish

Status: accepted for local frontend/backend contract validation.

## Scope

This record covers the Phase 2 follow-up slice for app creation, runtime
preferences, playground promotion, and theme asset lifecycle cleanup.

## Accepted

- Builder Home has a guided create-app flow with app name, starter screen,
  design preset, and optional onboarding spots.
- Playground screens can be promoted into a saved one-screen app.
- Runtime recent apps persist in versioned browser storage.
- Runtime display profile preferences persist per configuration/app and override
  viewport heuristics when set.
- Theme moodboard assets are deleted when replaced or when their app is deleted,
  and SQLite `theme_assets` rows are kept aligned.
- SQLite normalized bundle reconstruction remains the storage read path.

## Checks

Commands run locally:

```bash
npm run test --workspace @bloom/dashboard -- --run src/App.test.tsx src/runtime/runtimeProfile.test.ts
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 uv run --directory backend pytest tests/test_configurations_api.py tests/test_sqlite_configuration_repository.py
npm run check
```

Results:

- Dashboard app/profile tests: 78 passed.
- Backend configuration/SQLite tests: 39 passed.
- Biome check: passed.

## Deferred From Phase 2 Follow-Ups

- Real backend/runtime/robot status adapters need a dedicated runtime adapter
  contract and live ROS validation beyond the current topic-status strip.
- Cached screen thumbnails should build on the new asset cleanup lifecycle, but
  need a thumbnail format/API decision first.
- The optional Raspberry/tablet virtual keyboard remains an exploration item:
  native OS/browser keyboards and touch-focused input hints should be validated
  on hardware before Bloom owns a custom keyboard.

