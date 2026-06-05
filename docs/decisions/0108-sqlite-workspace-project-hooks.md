# 0108 - SQLite Workspace And Project Hooks

Date: 2026-06-05

## Context

Bloom should eventually support multiple projects/workspaces: Extender can own apps such as Sandbox and Petanque, while
future lab machines may use Bloom without ROS. The public app/screen JSON model should not be forced to expose this
too early, but SQLite normalization is becoming stable enough that adding query hooks now avoids a harder migration
later.

## Decision

SQLite schema version 4 adds non-breaking workspace/project columns to normalized storage:

- `configuration_bundles.workspace_id`;
- `configuration_applications.workspace_id` and `project_id`;
- `configuration_screens.workspace_id` and `project_id`;
- `configuration_widgets.workspace_id` and `project_id`;
- query indexes for future workspace/project listings.

These fields default to the current single-workspace behavior and are not exposed in the public configuration model yet.

## Consequences

- Existing JSON import/export and current app builder flows remain unchanged.
- Future project/workspace APIs can query existing normalized rows without rebuilding the storage layer.
- Bloom avoids hard-coding Extender as the top-level product concept.
- A later model/API migration must decide how project membership is edited and displayed in the UI.
