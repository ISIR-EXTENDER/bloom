# Migration Plan

## Phase 0: Baseline

- Keep `extender_ui` and `input_interfaces/tablet_interface` alive and untouched as legacy sources.
- Create this monorepo with executable checks before moving feature code.
- Document architecture boundaries and naming decisions.

## Phase 1: Safe Extraction

- Move frontend code into `frontend/apps/bloom-dashboard` in small slices.
- Move reusable widgets into `frontend/libs/widgets`.
- Move API transport code into `frontend/libs/api-client`.
- Move backend FastAPI entrypoints into `backend/apps/bloom_api`.
- Move ROS-specific publishing/subscribing code into `backend/libs/ros_adapters`.
- Add tests for each migrated slice before deleting legacy equivalents.

## Phase 2: Data And Deployment

- Introduce the database layer in `backend/libs/db`.
- Replace JSON sync progressively with database-backed configuration storage.
- Add migrations and import/export tools so existing JSON files are never lost.
- Add Extender workspace deployment entrypoints.
- Mark legacy repos/packages as legacy only after Bloom passes the full end-to-end pipeline.

## Next Migration Slices

1. Add configuration domain models.
   - Define typed models for applications, screens, widgets, and configuration metadata.
   - Keep this backend-only and independent from ROS, database storage, and frontend rendering.
2. Add JSON import/export services.
   - Load current JSON configuration files into the domain models.
   - Export models back to JSON so existing files remain recoverable.
   - Keep legacy adapters temporary and remove them once canonical Bloom configs replace old `extender_ui/data` files.
3. Add configuration API endpoints.
   - Expose listing, loading, and saving configuration data through `/api/v1`.
   - Start with file-backed or in-memory storage before adding the database.
4. Start the frontend dashboard migration shell.
   - Move the generic app shell and configuration loading flow into Bloom.
   - Keep widgets and ROS behavior in later focused PRs.
5. Add SQLite-backed configuration storage.
   - Introduce the database only after JSON compatibility and API behavior are tested.
   - Keep JSON import/export as the safety bridge during migration.

## Non-Goals For The First Migration

- Do not redesign the robot controllers.
- Do not move low-level ROS control packages into Bloom.
- Do not delete legacy JSON files or legacy repos during transition.
