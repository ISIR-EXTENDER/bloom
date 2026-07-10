# 0116 - App-Scoped Runtime Action Dispatch

Date: 2026-07-10.

## Context

Migrated command widgets can carry ROS topic metadata for compatibility with
legacy `extender_ui` JSON, but concrete robot actions such as deploy, repli,
saved-pose replay, emergency stop, and gripper commands should not depend on a
browser-supplied topic/message/payload triple at runtime.

Bloom already has app-level runtime policies and a backend ROS safe publish
path. The missing boundary was an app-scoped backend action endpoint that
resolves saved commands from the persisted app configuration before publishing.

## Decision

Add `POST /api/v1/runtime/actions`.

The endpoint accepts `config_id`, `app_id`, and either `preset_id` or `command`.
It then:

- reloads the saved configuration from the configured repository;
- resolves the command against the app's saved `action_presets`;
- rejects unknown or unsupported presets;
- parses the saved preset payload;
- enforces the app runtime policy;
- calls the existing backend ROS safe publish path for global policy, payload
  shape validation, rate limiting, gateway publication, and audit logging.

The dashboard uses this endpoint for command intents when it has saved app
context. Older clients and direct topic-publish widgets keep using the generic
ROS publish path.

## Consequences

- Concrete robot actions are now tied to saved app configuration rather than ad
  hoc frontend payload construction.
- App policy failures happen before the ROS gateway is called and are audited as
  runtime action rejections.
- The Explorer user-test fixture can model deploy/repli, saved poses, favorites,
  emergency stop, and gripper close as concrete presets without hard-coding
  Explorer behavior into generic widgets.
- Live robot validation still has to confirm the target controller behavior for
  each preset topic and payload.

