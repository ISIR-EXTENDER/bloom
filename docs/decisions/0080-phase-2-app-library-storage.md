# 0080 - Phase 2 App Library And Storage Closure

Date: 2026-06-04

## Context

Phase 2 is the point where Bloom stops behaving like a nicer JSON viewer and starts becoming an app builder with a
real library model. The legacy JSON bridge is still valuable because it protects migration safety, but the backend also
needs queryable concepts for apps, screens, widgets, themes, and later assets.

## Decision

- Keep the full configuration bundle as the lossless canonical document during migration.
- Add normalized SQLite mirror tables for applications, screens, widgets, and theme assets.
- Synchronize the normalized tables on every bundle upsert instead of reconstructing bundles from normalized rows yet.
- Store theme moodboard images through a backend asset endpoint instead of embedding data URLs in application config.
- Keep app composition tactile with drag/drop, but preserve explicit button actions for accessibility and tablet usage.
- Add a builder playground as a draft lab for runtime smoke tests before users create or save a full app.

## Rationale

This gives us the database shape needed for a real app/screen library without creating premature data-loss risk. The
JSON bundle still protects import/export, backups, fixture regression tests, and legacy screen migration. The normalized
tables make future SQLite queries, reusable screen persistence, profiles, search, thumbnails, and asset management
straightforward.

The builder UX follows the same principle: drag/drop should make the product feel tactile, but it cannot be the only
interaction path. Buttons remain the reliable fallback for keyboards, touch devices, screen readers, and stressful robot
test sessions.

## Follow-Ups

- Reconstruct bundles from normalized tables once the app/screen/widget schema stabilizes.
- Add asset cleanup when moodboards are replaced or apps are archived.
- Promote playground drafts into reusable screens or saved apps.
- Add cached screen thumbnails after asset storage has a lifecycle policy.
