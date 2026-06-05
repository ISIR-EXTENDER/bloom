# 2026-06-05 Full-Stack Refactoring Plan

## Review Scope

This review covers Bloom after the Phase 5 security/deployment/storage/runtime work merged on `main`.

Reviewed areas:

- backend FastAPI app, runtime routes, security middleware, settings, SQLite repository, sessions, ROS adapters;
- frontend product shell, routing, builder, runtime, widget renderer libraries, design-system surface;
- CI, CodeQL, dependency audits, visual smoke scripts, migration/readiness docs;
- current migration plan and recent PR history.

## Verification Snapshot

Local checks run on 2026-06-05:

```bash
npm run check
npm run build
npm run test --workspaces --if-present -- --run
npm run audit:security
npm run visual:smoke
cd backend && make test
```

Results:

- Biome: passed.
- Frontend build: passed.
- Frontend tests: 249 passed across dashboard, api-client, ui, widget-renderers, widgets.
- Backend tests: 138 passed.
- Dependency audits: no known npm or Python vulnerabilities reported.
- Visual smoke: passed, screenshots written to `/tmp/bloom-visual-smoke`.
- GitHub checks: latest `main` CI and CodeQL runs are green.

## Current Strengths

- The product boundary is now healthy: Bloom has a landing page, builder, runtime, help/docs, and runtime app library.
- Runtime and builder share the same screen/widget model; runtime adds presentation-only scaling/profile logic.
- ROS-facing behavior is behind backend/session/adapter boundaries rather than embedded in React widgets.
- Runtime command safety exists: topic/message allowlists, teleop target allowlists, rate limits, audit records, and a rosbag gateway contract.
- SQLite now reconstructs bundles from normalized rows and has non-breaking workspace/project hooks.
- CI is useful: backend, frontend, visual smoke, dependency audit, dynamic security smoke, and CodeQL all run.
- Docs and ADRs are unusually strong for a young repo. Keep this culture: it is one of Bloom's superpowers.

## Highest-Risk Findings

### 1. Runtime Route Is Doing Too Much

`backend/apps/bloom_api/routes/runtime.py` mixes HTTP recording endpoints, WebSocket session orchestration, topic subscription handling, audit handling, queue backpressure, and message dispatch.

Risk:

- Future runtime features will grow this file into a fragile controller.
- WebSocket lifecycle bugs are hard to reason about when task management and domain dispatch live together.
- Security/audit behavior may become inconsistent between HTTP and WebSocket paths.

Refactor direction:

- Extract `RuntimeRecordingService` for validation, gateway calls, and audit.
- Extract `RuntimeWebSocketSessionService` for receive/sample task lifecycle.
- Keep FastAPI route functions as thin adapters only.
- Move `build_runtime_ack` into a runtime dispatch module with tests independent from FastAPI.

### 2. SQLite Repository Has Mapping And Persistence Coupled

`backend/libs/config/sqlite_repository.py` is acceptable today but combines SQL writes, normalized row sync, JSON fallback, and model reconstruction.

Risk:

- Schema v5+ will be harder to review.
- Future project/workspace APIs will duplicate query logic or overfit this file.
- Partial normalized row corruption will be difficult to diagnose.

Refactor direction:

- Split into `SQLiteConfigurationRepository`, `ConfigurationRowWriter`, `ConfigurationRowLoader`, and `ConfigurationRowQueries`.
- Add explicit migration tests from older schema snapshots if possible.
- Add integrity checks: orphan screens/widgets, duplicate positions, invalid JSON row payloads.
- Add a small repair/export command before real lab data becomes important.

### 3. Frontend Product Orchestration Is Concentrated In `App.tsx`

`frontend/apps/bloom-dashboard/src/App.tsx` owns routing, selection state, runtime recent apps, saving, duplication, deletion, asset upload, and product view transitions.

Risk:

- Every new feature touches the same component.
- Error handling is mostly thrown exceptions, not user-centered recovery.
- Browser history and selection state can drift as flows grow.

Refactor direction:

- Extract `useBloomRoute`, `useWorkspaceSelection`, `useApplicationCommands`, and `useRuntimeRecents`.
- Keep `App.tsx` as composition shell only.
- Move command errors into typed results so pages can render inline recovery instead of depending on the error boundary.
- Persist recent runtime apps only after the user/profile model is ready.

### 4. Builder App Configuration Is Too Large

`BuilderAppConfig.tsx` mixes app identity, theme inspiration, palette editing, runtime policy editing, preset library, screen library, drag/drop, save state, and copy.

Risk:

- Harder to make UI/UX improvements without regressions.
- Harder to unit test individual flows like preset sync or screen drag/drop.
- Accessibility review becomes noisy because many responsibilities share one DOM tree.

Refactor direction:

- Split into `AppIdentityPanel`, `ThemePanel`, `RuntimePolicyPanel`, `CommandPresetPanel`, `ScreenCompositionPanel`, and `SaveBar`.
- Move pure screen grouping and preset syncing into tested model helpers.
- Keep drag/drop helpers reusable across app composition and future widget palette interactions.

### 5. Widget Settings Registry Is Becoming A God Object

`frontend/libs/widgets/src/settings.ts` is the central contract authority and is now over 1,300 lines.

Risk:

- Adding widget families will become high-conflict.
- Discoverability for contributors will degrade.
- Runtime/builder settings could accidentally diverge.

Refactor direction:

- Split by family: `controlSettings`, `displaySettings`, `debugSettings`, `rosActionSettings`, `layoutSettings`.
- Keep one public `settings.ts` barrel export to preserve external imports.
- Add contract snapshot tests per widget family.
- Add explicit capability schema tests for runtime clean-mode defaults.

### 6. CSS Is Split By Product Area But Still Too Monolithic

`builder.css`, `runtime-widgets.css`, `App.css`, and `runtime-app.css` are large. The split is better than before, but not yet a stable design-system architecture.

Risk:

- Component-specific styles become hard to delete or reuse.
- Design-system decisions remain partly implicit.
- Tablet-first rules can be overridden accidentally by page CSS.

Refactor direction:

- Promote repeated card/action/form styles to `@bloom/ui` primitives.
- Introduce CSS layers or clear file sections: tokens, primitives, product layout, component skins.
- Add a small internal styleguide route/page before adding many more primitives.
- Make visual smoke assert critical target sizes for joystick/slider buttons, not only horizontal overflow.

### 7. Tests Are Strong But Too Centralized

`App.test.tsx` and several widget tests are large. This is a good sign of coverage, but it will slow future diagnosis.

Risk:

- A failure in product navigation, runtime, builder, or debug all lands in the same huge file.
- Contributors may avoid adding tests because the file feels intimidating.

Refactor direction:

- Split dashboard tests by product area: `landing`, `builder-home`, `app-config`, `screen-builder`, `runtime`, `bloom-debug`, `navigation`.
- Keep shared test fixtures/builders in `test-support`.
- Add `npm run test:frontend:watch` and targeted package scripts if useful.
- Add coverage reporting later, but do not chase 99%; aim for meaningful coverage on safety-critical flows.

## Security Hardening Plan

### Immediate

- Add CSP header planning. Current headers are good, but CSP is still missing. Start with report-only in docs/CI before enforcing.
- Add persistent audit storage design. In-memory audit is fine for dev but not enough for accepted robot sessions.
- Add explicit WebSocket message rate limits for topic subscriptions, not only teleop commands.
- Add maximum topic subscription count per session and max message size/shape guards.
- Add upload hardening for theme assets: image dimension check, stronger content sniffing, and asset cleanup policy.
- Add structured security tests for production mode: auth required, operator cannot mutate admin-only resources, CORS denies unknown origins.

### Before Lab Deployment Beyond Localhost

- Replace static API keys with a user/session flow or device pairing flow.
- Ensure secrets are never passed in WebSocket query params except as a documented compatibility fallback.
- Add persistent command/audit logs with retention and export.
- Document SROS2/rmw security expectations for ROS graph transport.
- Add a scheduled dependency audit workflow and Dependabot configuration if not already enabled at repo/org level.

## Reliability Plan

### Runtime

- Extract runtime task lifecycle and test disconnect paths more deeply.
- Add reconnection behavior tests for the frontend runtime WebSocket client.
- Add bounded retry/backoff for runtime WebSocket reconnects, with user-visible status.
- Add status surfaces for backend connected, runtime session connected, ROS adapter connected, and robot command accepted/rejected.

### Storage

- Add DB integrity command through Typer: list configs, validate normalized rows, export bundle, repair missing mirror rows from bundle JSON.
- Add tests for old schema database migration, not only fresh DB creation.
- Add backup/export workflow before destructive app/screen operations.

### Frontend

- Introduce typed command result objects instead of throwing from UI command handlers.
- Add loading/empty/error states per panel rather than only global error boundaries.
- Add end-to-end tests with mocked API failures and offline backend.

## Maintainability Plan: Ordered PR Slices

### PR 1 - Runtime Backend Service Extraction

Goal: make runtime routes thin and reduce WebSocket fragility.

Tasks:

- Create `backend/libs/runtime/recording_service.py`.
- Create `backend/libs/runtime/websocket_session.py` or `runtime_dispatch.py`.
- Move recording validation/audit/gateway calls out of route functions.
- Move `build_runtime_ack`, topic subscription dispatch, queue sample handling into a tested service module.
- Keep API behavior unchanged.

Validation:

- `cd backend && make test`
- Add targeted runtime service tests.
- Existing WebSocket tests must remain green.

### PR 2 - Frontend Shell And Command Hooks

Goal: reduce `App.tsx` orchestration pressure.

Tasks:

- Extract `useBloomRoute`.
- Extract `useWorkspaceSelection`.
- Extract `useApplicationCommands` for create/save/delete/duplicate/upload.
- Extract `useRuntimeRecents`.
- Keep UI behavior unchanged.

Validation:

- Dashboard tests.
- Visual smoke.
- Browser back/forward smoke still passes.

### PR 3 - Builder App Config Decomposition

Goal: make app configuration maintainable and accessible.

Tasks:

- Split panels by responsibility.
- Move screen grouping and preset syncing to pure helpers.
- Add focused tests for helpers and panel actions.
- Preserve current UX, then polish after split.

Validation:

- App config tests.
- Visual smoke at `1024x600`, `1280x800`, `1920x1080`.

### PR 4 - Widget Settings Registry Split

Goal: reduce widget contract coupling.

Tasks:

- Split settings contracts by widget family.
- Keep public exports stable.
- Add family-level contract tests.
- Document how new widgets should add settings/capabilities.

Validation:

- Widget package tests.
- Legacy JSON fixture import tests.
- Visual smoke with migrated widgets.

### PR 5 - SQLite Mapping Split And Integrity Checks

Goal: make normalized storage safer before real lab data accumulates.

Tasks:

- Split row writer/loader/query helpers.
- Add integrity validation command.
- Add old-schema migration fixture tests.
- Add export/backup CLI docs.

Validation:

- Backend tests.
- SQLite repository targeted tests.
- CLI tests.

### PR 6 - Runtime Status And Security UX

Goal: show useful status without noisy robotics logs.

Tasks:

- Add backend/API/runtime/ROS adapter status model.
- Show compact operator status chips in runtime and Bloom Debug.
- Add WebSocket reconnect status.
- Add topic subscription limit and audit visible rejection reason.

Validation:

- Runtime tests.
- Security smoke.
- Visual smoke.

### PR 7 - Design System Primitive Promotion

Goal: stop repeating card/form/action styling.

Tasks:

- Promote reusable card, section header, action row, form field, status chip, empty state primitives to `@bloom/ui`.
- Replace dashboard-local repeated styles incrementally.
- Add component examples or a styleguide page.

Validation:

- UI package tests.
- Visual smoke and screenshots.
- Contrast tests remain green.

## CI And Quality Improvements

- Add explicit `npm run typecheck` script even if build currently typechecks.
- Add backend static checks once chosen: Ruff is a good first candidate, but adopt it deliberately with formatting rules documented.
- Add coverage reporting only after test files are split; do not optimize for a vanity number first.
- Add CI artifact upload for visual smoke screenshots on failure.
- Add a scheduled security workflow for dependency audits.
- Consider PR size guidance in `CONTRIBUTING.md`: small slices, ADR when architecture changes, visual smoke for UI.

## Process Notes

- Current GitHub checks are green.
- The repo instruction says squash merge subjects should include the PR suffix, e.g. `feat(cli): add backend command line (#3)`. We should follow that from now on to preserve the history convention the team wanted.
- Continue using ADRs for architecture changes, but do not add ADRs for tiny mechanical refactors.

## Suggested Next Action

Start with PR 1: Runtime Backend Service Extraction.

Why first:

- Runtime is the highest safety/robot-facing surface.
- The route currently mixes too many responsibilities.
- Extracting services before adding more robot adapters will reduce regression risk.
- Existing tests are strong enough to protect behavior during refactor.
