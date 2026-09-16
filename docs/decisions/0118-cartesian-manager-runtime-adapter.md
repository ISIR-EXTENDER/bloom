# 0118 - Cartesian manager runtime adapter

Date: 2026-09-01

## Context

The Extender control stack changed. `cartesian_manager` now sits between operator
inputs and `qontrol_controller`, and `sandbox_controller` has left the workspace
manifest on `topic/new_manager`.

Bloom published `extender_msgs/msg/TeleopCommand` on `/teleop_cmd`. The only
consumers of that topic were `sandbox_controller`, `controllers/cartesian_velocity`
and `joystick_interface` - two dropped from the manifest, one declared legacy.
On the new stack Bloom was publishing into the void.

`cartesian_manager` consumes two standard messages instead:

- `geometry_msgs/msg/TwistStamped` on `/joystick_cartesian_command`
- `std_msgs/msg/String` mode requests on `/mode_request`

## Decision

Add `RclpyCartesianManagerGateway` beside the existing `RclpyTeleopCommandGateway`,
and select between them with a `ros_command_backend` setting that defaults to
`cartesian_manager`.

The default teleop target moves from `/teleop_cmd` to
`/joystick_cartesian_command`. `/teleop_cmd` stays in `allowed_teleop_targets`
so the legacy path remains reachable as a rollback.

Mode requests are validated against the manager grammar in
`libs/ros_adapters/mode_request.py` before publication.

Apps split by stack rather than being migrated wholesale:

- **Sandbox V0.0** and **Explorer user tests** move to the manager contract.
- **Petanque** stays on `/teleop_cmd`, because its stack (`apps-petanque`,
  `controllers`) is legacy and is not part of the new architecture.

## Rationale

**Validate locally, because the manager cannot report back.** `cartesian_manager`
drops an unparseable mode string silently. If Bloom forwarded it blindly, an
operator would see a robot that does nothing and no error anywhere. Parsing the
grammar in Bloom turns that into a runtime error the UI can show. The same check
exists in `tablet_interface`, deliberately duplicated: both are clients of the
same contract, and neither should depend on the other.

**Stamp the frame explicitly.** The manager accepts its configured base,
end-effector, and hybrid frames and rotates angular commands from live robot
poses; it performs no general TF lookup. Unknown frames are skipped. The frame
is therefore configuration, not a hard-coded constant, and the gateway stamps
every message.

**Keep the legacy gateway.** Bloom's migration rules say not to replace working
legacy functionality until the replacement is tested end to end. The manager
stack has not been accepted on Extender hardware yet, so `teleop_command` remains
one setting away.

**Standard message types are a simplification.** Replacing an Extender-specific
custom message with a `TwistStamped` and a `String` removes an `extender_msgs`
dependency from the runtime command path, which matches the architecture rule
that generic models must not encode Extender naming.

## Consequences

- `allowed_teleop_targets` now defaults to both topics; `/mode_request` is added
  to `allowed_publish_topics`, and the manager topics to
  `allowed_recording_topics`.
- The seeded Sandbox and Explorer configurations were refreshed from their
  fixtures, so `validation:frontend-backend` stays coherent.
- `validation:sandbox-runtime` and `validation:sandbox-tablet` now assert the
  manager topic. `validation:petanque-parity` deliberately still asserts
  `/teleop_cmd`.
- Runtime clients must keep sending zeros on release. The manager **sums** all
  activated inputs rather than arbitrating between them, so a stale non-zero
  Bloom twist would keep adding to a joystick or visual-servoing command.

## Bloom does not scale commands

Bloom publishes the values its widgets produce, unchanged. `tablet_interface`
scales by `linear_scale` / `angular_scale` before publishing; Bloom does not, and
will not.

Widget settings already carry their own gains and ranges, and app configuration
is where an operator tunes them. A second, invisible scale factor in the adapter
would mean the same slider position produced different robot motion depending on
which client sent it, and would make a widget's configured range a lie.

The consequence is that `cartesian_manager` sees Bloom's raw values. Since the
manager sums all activated inputs, a Bloom widget configured with a large range
contributes proportionally more than a tablet at the same visual deflection.
Ranges belong in app configuration, bounded by `max_velocity`-style widgets, not
in the adapter.

## Follow-up

The target architecture replaces `geometric/jaco` with `translation` and
`orientation` behaviours. When those land, add them to `GEOMETRIC_MODES` and let
mode-aware joystick bindings request them directly.

Live validation on Extender hardware is still pending and is tracked in
`docs/extender-petanque-validation.md` and `docs/ux-design-handoff.md`.

## 2026-09-16 Amendment

The frame is now selected once per application through
`runtime_policy.command_frame_id`, offered in Builder from the backend capability
report, and shown in the runtime kiosk bar. It stamps every composed widget and
physical-gamepad contribution. An empty app value keeps the deployment default;
legacy per-widget frame metadata remains only as a compatibility fallback.

The backend capability report exposes the accepted frame set and robot name,
and the teleop session rejects any non-empty frame outside
`BLOOM_ALLOWED_COMMAND_FRAME_IDS`. See decision 0125.

Joystick Lab may replace the app default for the current runtime session, but only with a reported frame and while the
composed twist is zero. The kiosk, virtual controls, and gamepad all follow that one effective selection.
