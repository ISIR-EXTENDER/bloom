# Robot-agnostic Bloom: where the seams are, and where they are not

Status: **design note, not a decision.** Written to be argued with.

Update 2026-09-16: Bloom is now the active Extender IHM. Application-default and safely session-selectable command
frames, kiosk operation, and device-independent input composition have landed, but they do not remove the Extender
topic/mode constants catalogued below. The robot-profile proposal remains open and is tracked in the
[UX design handoff](ux-design-handoff.md).

## Why this exists

Bloom is meant to be usable by people with no ROS at all, and reusable across
robots. Four concerns were raised against the current state:

1. There is no robot abstraction, so Bloom is welded to the Extender.
2. The mode is a separate topic, so it may not be synchronised with anything.
3. The stack is pinned to the QP controller, with no room for a custom ROS 2
   controller.
4. A library for people with no ROS is a stated goal that nothing yet serves.

All four are real. One of them is much closer to solved than it looks, and one
is worse than it looks.

## What is already true

**The backend is genuinely ROS-optional, and it works today.**

- `rclpy` is not a dependency of `backend/pyproject.toml`.
- Every `rclpy` and `extender_msgs` import is function-local and guarded, in
  `rclpy_cartesian_manager.py`, `rclpy_teleop.py`, `rclpy_topic_streams.py`,
  `camera_frames.py`, `rclpy_publishers.py`.
- `create_app()` installs a Noop for every ROS seam when nothing real is passed.
- `bloom api run` and `bloom api run-ros` are separate entry points, and the
  ROS-free one is the default.
- The rule is written down: `docs/architecture.md` — *generic libs may not
  import ROS.*

So "Bloom without ROS" is not a future project on the backend. It is how the
backend already runs.

**The frontend had no equivalent, and that is now partly addressed.**
`GET /api/v1/capabilities` reports which seams are wired, and the builder marks
widgets that cannot work here instead of offering them silently. That closes the
"a joystick places happily and moves nothing" gap. It does not make the frontend
robot-agnostic.

## What is not true yet

**The seam is per-transport, not per-robot.** `RosPublisherGateway`,
`TeleopCommandGateway`, `RuntimeTopicSubscriptionGateway` abstract *how* a
message is sent. Nothing abstracts *what* the robot is. Extender specifics are
spread across both sides:

| Where | What is baked in |
| --- | --- |
| `runtime-action-dispatcher.ts` | `/tablet_cartesian_command` as the teleop default; mode names mapped to the integers 1–4 |
| `widget-destination.ts` | the same teleop default, and `/joint_states` |
| `widgets/src/settings.ts` | both topics again, in default widget settings |
| `runtimeModeState.ts` | robot modes typed as `"b1" \| "b2"`; a fixed five-topic Extender list forced into every app's status panel |
| `backend/apps/bloom_api/settings.py` | a ~45-topic Extender/Petanque allowlist as the default |
| `backend/libs/ros_adapters/actuators.py` | gripper open/close constants copied from `tablet_interface` |
| `backend/libs/ros_adapters/mode_request.py` | `/mode_request` and the manager's mode grammar |
| `backend/apps/bloom_api/routes/runtime_positions.py` | endpoints that emit YAML for `explorer_params.yaml` |

The same topic string is written in at least four places. That is the real
measure of the problem: not that a robot profile is missing, but that there is
nowhere for one to go.

## Proposal: a robot profile

One document, owned by the app, describing the robot and the controller it
talks to. Everything in the table above reads from it instead of from a
constant.

```
robot_profile:
  id: extender-cartesian-manager
  transport: ros2            # or: none, websocket, http
  teleop:
    target: /tablet_cartesian_command
    message_type: geometry_msgs/msg/TwistStamped
    frame_id: base_link      # known base, end-effector, or hybrid rotation frame
  mode:
    topic: /mode_request
    grammar: [geometric/*, behaviour/*]
    feedback: null           # see "Mode synchronisation"
  feedback:
    joint_states: /joint_states
    command_echo: /cartesian_command
  joints: [...]
  actuators:
    gripper: {topic: ..., open: 0.2, close: 1.1}
```

Three properties matter more than the exact shape:

- **A profile can describe a robot that is not the Extender**, which is the
  test. If writing a second profile is awkward, the seam is in the wrong place.
- **`transport: none` must be meaningful.** A profile with no ROS is how the
  non-ROS story stops being a slogan: widgets resolve against capabilities that
  are simply absent, which already works.
- **The profile is data, not code**, so it ships in a bundle like everything
  else and can be published between machines with the mechanism that already
  exists.

## Mode synchronisation: worse than it looks

`cartesian_manager` publishes only `/cartesian_command` and
`/joint_target_command`. **It never reports the mode it is in**, and an invalid
mode request is only an `RCLCPP_WARN` — nothing goes on the wire. So:

- No UI can show the arm's real mode. Bloom shows "last requested", labelled as
  such, because that is the only honest claim available.
- No UI can tell an accepted request from a rejected one.
- `behaviour/joint_target/*` sets the mode back to `behaviour/passthrough`
  immediately after publishing the target, so even the requested mode is
  transient in a way the operator is not told about.

This is not something Bloom can fix on its own, and no abstraction hides it. The
question is out with Mégane: publish the active mode, for example latched
`std_msgs/String` on `/mode_state`. **Her answer determines the `mode.feedback`
field above**, and until it lands, mode display stays a request log rather than
state.

## Beyond the QP controller

The pinning is not to the QP controller directly — Bloom never speaks to
`qontrol_controller`. It is pinned to the `cartesian_manager` *contract*:
`TwistStamped` on a topic, `String` modes, `JointState` targets out.

That contract is a reasonable boundary and a custom ROS 2 controller could
satisfy it. Two things stop it being a clean one today:

- The mode grammar is the manager's, so a controller with different modes needs
  the grammar to become profile data rather than a hardcoded regex.
- The known frame set and its rotation semantics are manager properties. Bloom
  exposes one app-level selection and keeps a deployment-wide fallback.

Both move into configuration. Neither requires a new abstraction layer — which is
the useful finding: **the controller boundary is already in about the right
place; it is just not parameterised.**

## The non-ROS story

What "a library people can use with no ROS" concretely means, given what exists:

- **Works today with no ROS:** the whole builder, screen library, app
  configuration, theming, and the widgets that need no backend — label, button,
  camera (browser webcam or a stream URL).
- **Works but does nothing:** every publishing and subscribing widget. They are
  now marked as such rather than failing silently.
- **What is missing:** a non-ROS transport. `transport: websocket` or `http`
  against a plain endpoint would make Bloom useful to someone with a robot that
  is not ROS, or no robot at all, and the gateway seam already has the right
  shape for it — `NoopRosPublisherGateway` and `RclpyRosPublisherGateway` are
  two implementations of an interface that a third could join.

The honest summary: the non-ROS story is one adapter away on the backend, and a
profile away on the frontend. It is not a rewrite.

## Suggested order

1. Land the robot profile as data, with the Extender as the first profile, and
   move the duplicated topic constants onto it. Nothing changes behaviourally;
   the duplication stops.
2. Get an answer on mode feedback, and add `mode.feedback` when there is
   something to point it at.
3. Write a second profile for a different robot, even a hypothetical one, as the
   test of whether the seam is real.
4. Add one non-ROS transport adapter, and prove it with a profile that has no
   ROS in it at all.

Step 3 is the one worth not skipping. A robot abstraction validated against a
single robot is not an abstraction.
