# 0125 - Application-scoped command frame and input composition

Date: 2026-09-16

## Context

Bloom can assemble one Cartesian command from touch joysticks, return-to-center sliders, keyboard input, and a physical
gamepad. Earlier bindings could also carry their own `frame_id`. That made it possible for controls on one operating
screen to describe movement in different frames, even though they were summed into one twist before publication.

The active frame also remained difficult for an operator to verify. The deployment default existed, but app authors
could not select from the frames reported by the connected backend and runtime did not consistently show the effective
choice.

## Decision

Add `runtime_policy.command_frame_id` to `ApplicationConfig` and make it the shared frame for every Cartesian
contribution in that application.

- The builder offers the command frames reported by `GET /api/v1/capabilities`.
- An empty app value delegates to `BLOOM_ROS_COMMAND_FRAME_ID`.
- Runtime stamps widget and physical gamepad contributions with the same effective frame.
- The kiosk bar shows the effective frame when known.
- The backend rejects a non-empty frame outside `BLOOM_ALLOWED_COMMAND_FRAME_IDS` before publishing.
- Legacy per-widget `value_mapping.frame_id` remains a compatibility fallback only when no app frame is supplied.

Input devices remain frontend concerns. Touch, keyboard, step, latch, scan, dwell, and gamepad sources are mapped toward
normalized contributions for the same `TeleopTwistComposer`; the ROS adapter does not need device-specific branches.
Directional switch scanning is not complete at this decision date because activating the focused joystick pad produces
no vector. That correction remains on the frontend side of this boundary.

## 2026-09-16 Amendment — runtime session selection

Directional scanning now renders joystick and slider step targets and emits real movement intents. An application may
also expose `teleop-frame` command buttons, as the Explorer and Kinova Joystick Lab screens do. They replace the
effective frame for the current runtime session without rewriting app configuration or calling a backend action. The
dispatcher accepts the change only when the composed twist is zero and the frame appears in the backend capability
report. Unsupported frames remain visible and disabled. The kiosk bar, widgets, and gamepad all consume the same
selected value, so this amendment preserves the decision's no-mixed-frames invariant.

## 2026-09-23 Amendment — a widget may name its own frame

Robin, at the bench: *"est-il possible de rendre paramétrable le `frame_id` du message twist ?"* He had set
`value_mapping.frame_id` and watched it be ignored, because the session frame shadowed it in every case: an app always
carries one, from `command_frame_id` if nothing else. The fallback this decision kept was unreachable.

The no-mixed-frames invariant is narrower than it reads. `InputManager::commandInBaseFrame` rotates **only** the angular
part by the frame and passes the linear part through untouched, so a translation pad in `base_link` and a rotation pad
in `effector_frame` do not describe contradictory movement. The case that cannot be honoured is two widgets turning the
hand under different frames, because one message carries one frame.

So the precedence inverts, and the composer decides rather than the dispatcher:

- A widget that declares a frame wins while it is the only one contributing an angular component.
- Two widgets turning under different frames keep the session frame, and `resolveFrame` names them rather than letting
  one silently lose.
- A widget that declares none still follows the app frame and the `teleop-frame` buttons, unchanged.

This makes a tool-frame rotation pad authorable beside a base-frame translation pad on one screen, which is what the
bench asked for and what the manager has always been able to serve.

## Rationale

`cartesian_manager` interprets angular velocity according to a known base, end-effector, or hybrid frame and does not do
a general TF lookup. A frame is therefore part of the operator contract, not styling or per-widget tuning. Selecting it
once per app prevents a composed twist from mixing incompatible interpretations.

Keeping input sources above the adapter boundary also makes accessibility behavior testable without ROS and avoids
giving each assistive device a separate robot protocol.

## Consequences

- The app model, API client, SQLite normalized mirror, seeds, and builder persistence all carry the field.
- Changing the app frame changes all Cartesian controls together, including a connected gamepad.
- Deployment configuration remains the final allowlist and fallback.
- Existing applications with an empty field retain backend-default behavior.
- The effective frame can be verified on the operating surface before motion.

## Validation

Unit and integration coverage verifies app-model normalization, SQLite round trips, builder selection, runtime frame
precedence, gamepad stamping, WebSocket rejection of unknown frames, and kiosk display. Live operator validation on each
robot/frame combination remains required.
