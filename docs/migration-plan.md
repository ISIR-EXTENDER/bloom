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
- Add Docker and Extender workspace deployment entrypoints.
- Mark legacy repos/packages as legacy only after Bloom passes the full end-to-end pipeline.

## Non-Goals For The First Migration

- Do not redesign the robot controllers.
- Do not move low-level ROS control packages into Bloom.
- Do not delete legacy JSON files or legacy repos during transition.

