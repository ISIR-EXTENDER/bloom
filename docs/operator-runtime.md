# Bloom Operator Runtime

Current behavior as of 2026-09-16. This is the canonical operating contract for Bloom runtime. It documents what the
merged product does; live robot acceptance is tracked separately in
[Extender and Petanque end-to-end validation](extender-petanque-validation.md).

Bloom is the active Extender IHM. `extender_ui` is legacy and may be used only as a behavior reference or emergency
rollback while live acceptance is completed.

## Launch An Application

1. Start the Bloom API and dashboard. For an Extender lab session, use
   `scripts/extender-workspace-dev.sh` from the repository root.
2. Open **Runtime** and choose an application from the app library.
3. Confirm the kiosk bar names the expected application, robot when configured, command frame, profile, and connection
   state before moving a control.
4. Use the fixed **STOP** control immediately if the command path or motion is not what you expect.

Runtime is an operator surface, not a builder preview. Product navigation, screen switching, editing links, Help, and
diagnostics are absent from the normal operating surface. Hold the maintenance button for 1.5 seconds to reveal them.
Screen changes are deliberately kept inside maintenance so an accidental tap cannot replace the controls under a hand.
When a fitted artboard is smaller than its authored size, Maintenance also reports the authored dimensions, actual
rendered percentage, and risk that targets have fallen below the 44 px touch floor. The warning stays off the operating
surface and does not claim that scaling is safe.

Runtime also checks each widget's declared backend requirement against `GET /api/v1/capabilities`. When the backend
explicitly reports a required publisher, subscriber, service, or teleop seam unavailable, the control remains in its
authored position but becomes inert and shows the backend's reason. A missing or failed capability report remains
unknown and does not disable the screen by guesswork.

## Supervisor Mirror

Open **Supervisor mirror** beside an app in the Runtime library. From a running app, hold **Maintenance** and choose the
same action to open that app's mirror in a separate browser tab or display. The route includes the configuration and
application IDs, so a bookmarked mirror resolves the intended app instead of whichever app Builder last selected.

The mirror shows the application, configured robot, effective default command frame, shared backend STOP latch,
frontend/backend session state, and relevant ROS topic readiness. It refreshes STOP and topic status every two seconds
and also offers a manual status refresh. `cartesian_manager` does not publish authoritative active-mode feedback, so a
fresh mirror says **Not checked** and **No mode request observed in this browser session** rather than presenting the
configured fallback as live robot state.

This surface is read-only by construction. It receives a projected client with connection observation and status-read
methods only. It has no movement, STOP, resume, topic-publish, or configured-action controls. The ownership notice says
that the operator retains control; opening or closing a mirror never hands command authority to another browser.
Deliberate handover remains a future product and safety decision if supervisory controls are ever introduced.

## Guided Practice

Hold **Maintenance** and choose **Practice tour**, or open the same tour from Runtime Settings. Practice replaces the
live artboard and suspends composed teleop. Its five checks introduce the current screen, use the app's own movement
label twice, rehearse STOP and held resume, rehearse the Maintenance hold, and return to operation.

The practice surface has no runtime action client, robot-intent callback, or teleop callback. Its movement, STOP, and
Maintenance controls change local component state only. The banner therefore says the practice controls are
disconnected from robot commands; it does not make a claim about physical robot power or the live backend session.
Practice uses the selected language, font scale, scan period, and dwell behavior. Completed checks persist locally per
configuration and app, but the tour remains available for repetition.

## Stop And Resume

- A pointer press on **STOP** engages the backend runtime stop immediately. Keyboard activation is also supported.
- The stop is a backend latch shared by runtime clients; it is not a decorative local button.
- While stopped, command controls are disabled and the control becomes **HOLD TO RESUME**.
- Resume requires a continuous one-second hold. Leaving or releasing the target cancels the hold.
- Link, stop, and recovery transitions can produce audio cues when the selected profile enables them.

This control does not replace the robot's hardware emergency stop, controller limits, or the operator's normal lab
safety procedure.

## Manager Drive Controls

The shipped **Explorer Manager** and **Kinova Manager** Drive screens expose the virtual IHM used for
`cartesian_manager` experiments:

| Control | Runtime behavior |
| --- | --- |
| Translation joystick | Contributes `linear.x` and `linear.y`. |
| Rotation joystick | Contributes `angular.x` and `angular.y`. |
| Height slider | Contributes `linear.z` and returns to zero on release. |
| Pivot slider | Contributes `angular.z` and returns to zero on release. |
| Neutral | Requests `geometric/both`. |
| Jaco | Requests `geometric/jaco`. |
| Hold snake | Requests `geometric/snake` while pressed and `geometric/both` on release. |
| Gripper | Publishes close `[1.1]` and open `[0.2]`, matching `tablet_interface`. |
| Speed sliders | Start at the configured controller limits and publish linear/angular limits to `qontrol_controller`. They are disabled when the ROS graph has no subscriber. |

The four Cartesian widgets are composed into one complete 6-DoF twist. Releasing one source clears only its
contribution. The runtime continues publishing the composed value so `cartesian_manager` can enforce its source timeout.
Bloom sends normalized values and does not add a hidden linear or angular scale. Widgets may sample at up to 30 Hz,
but one latest-value gate caps the combined WebSocket stream at 30 commands/s. Explicit zero commands bypass that gate
and discard any queued movement; the backend's default 60 commands/s ceiling remains an independent safety boundary.
The speed slider readouts are therefore downstream limits, not a second scale in Bloom. Maintenance diagnostics list
their topics explicitly; **No subscriber** means the controller is not ready and the corresponding slider stays inert.

The Positions screen supports confirmed named targets, explicit release/cancel, saving the current joint state, replay,
rename/delete, and export of a `joint_targets` configuration block. Robot Feedback and Command Sources expose measured
state and the manager's summed inputs without placing debug detail on the Drive screen.

## Joystick Lab

Both Manager applications include **Joystick lab**, a virtual version of the physical joystick workflow used for
Robin. It puts translation, height, rotation, pivot, mode requests, momentary Snake, gripper, and the command echo on
one screen. The same screen works with direct touch, keyboard, gamepad, and the `scan` profile.

The Base, Tool, Hybrid, and Force sensor buttons select the current runtime session's command frame. Bloom keeps a
frame visible when the connected robot does not report it, disables it, and says that it is unavailable. While any
composed twist is non-zero, all frame buttons are disabled with **Release controls**. A frame change therefore cannot
reinterpret motion already in progress. The kiosk bar updates immediately, and the next widget or gamepad command uses
the selected frame.

The **Sent to manager** echo subscribes to `/joystick_cartesian_command` and shows its `twist`. It helps verify the
command leaving Bloom; it is not controller feedback or proof of robot motion.

The README includes a [live Joystick Lab capture](assets/screenshots/11-joystick-lab.png) and a
[1:55 Explorer walkthrough](assets/demo/bloom-explorer-demo.mp4) covering Drive, Joystick Lab, feedback, command
sources, and Bloom Debug. These are ROS-bench evidence without physical hardware acceptance; Kinova follows the same
flow with its own frame allowlist.

## Physical Gamepad

When the browser exposes a standard gamepad, Bloom treats it as another contribution to the same composed twist. The
kiosk bar shows `gamepad` while one is connected.

Default axes are:

| Gamepad axis | Twist component |
| --- | --- |
| Left stick X | `linear.x` |
| Left stick Y | `linear.y`, inverted so up is positive |
| Right stick X | `angular.x` |
| Right stick Y | `angular.y`, inverted so up is positive |

The active profile dead zone is applied per axis with the same scaled-dead-zone rule as `joystick_mapper`. Returning all
sticks to center emits one release and clears the gamepad contribution. Browser Gamepad API support and live hardware
mapping must be checked with the actual controller before a session.

## Accessibility Profiles

An application profile controls display density, font scale, audio cues, signal conditioning, and motor interaction.
The runtime chooses a preferred profile by saved user preference, then viewport display preset, then a comfort/default
fallback.

Supported motor presets are:

| Preset | Behavior |
| --- | --- |
| `default` | Direct pointer, touch, and keyboard operation. |
| `large-targets` | Larger runtime targets. |
| `assisted-touch` | Larger targets and touch-oriented presentation. |
| `reduced-motion` | Reserved in the profile model. The browser's `prefers-reduced-motion` setting is honored, but this profile value is not wired independently yet. |
| `step` | Joysticks/sliders expose discrete tap targets instead of requiring sustained dragging; held teleop values expire after 15 seconds. |
| `latch` | Compatible controls hold their value until explicit zero/release or the 15-second attention timeout. |
| `scan` | Joysticks and sliders render step targets, and a highlight advances through every button on the screen; Space, Enter, a tap outside a control, or a tap on the full-width switch bar fires the lit target. |
| `dwell` | Legacy combined step-and-dwell preset; existing profiles remain supported. |

Profile bounds are enforced by the model: dead zone `0..0.5`, repeat guard `0..600 ms`, scan period `600..3000 ms`,
and dwell duration `400..4000 ms`. `dwell_enabled` enables pointer dwell alongside any motor preset, including `scan`;
the old `dwell` preset also enables it for compatibility. `dwell_ms` controls only the duration and cannot enable the
feature by itself because it has a nonzero default. Dwell never shortens the one-second resume hold.

Latched and stepped return-to-center controls automatically publish zero after 15 seconds without renewed input; the
visible zero control releases them sooner.

### Runtime Settings

Hold **Maintenance**, then open **Settings** to adjust the currently selected profile without entering Builder. The
settings screen replaces the robot controls rather than covering them. Entering it clears composed teleop sources and
stops the runtime stream; its bottom try strip is local state and has no robot-action interface.

Changes apply immediately and are stored in the existing browser preference payload under
`profileOverrides[configId:appId:profileId]`. Reloading and reopening the same application/profile restores them.
Malformed stored values are ignored. **Undo changes** restores the overrides present when Settings opened, while
**Done** returns to operation.

The movement choices expose direct drag, step, latch, and scanning behavior in operator language. **At the edge** is
visible but disabled because Bloom has no edge-control runtime behavior yet. Fine tuning uses 88x72 decrement/increment
targets for scan period, dead zone, dwell duration, and repeat guard, plus toggles for dwell and status sounds. Command
frame choices come from the connected backend's allowlist and remain disabled while teleop is active. Display preset
and text scale are read-only installation facts. The Language category switches the runtime shell between English,
Spanish, and French.

Settings uses the active scan period and dwell duration itself. Its header, category rail, controls, safe preview, and
Done action therefore remain reachable when the current profile uses scanning and/or dwell.
**Practice tour** opens the guided local-only path without returning through the live controls first.

The scan set is read from the DOM, so it contains exactly the buttons a screen renders; a pad is never a scan target
because a click on it moves nothing. Under scan, dwelling on the full-width SWITCH bar activates the highlighted target
without a firm press. Single-switch and combined scan-plus-dwell teleop are covered by tests but not yet validated with
the intended devices.

Joysticks are keyboard operable. Focus the pad and use arrow keys; the same conditioning and command path are used as
for pointer input. The currently shipped shared applications demonstrate only part of the profile matrix, so configure
and verify the intended profile before relying on it in a session.

### Runtime Language

Runtime language belongs to the selected profile. A missing value falls back to English; a local choice is stored with
the other per-profile overrides and is restored for the same application and profile. The selector is available in
Maintenance for a fast change and in **Settings > Language** with full language names.

The runtime status, STOP/resume control, Maintenance, scanner, Settings, and empty-screen state use the selected
catalog. Authored app names, screen names, and widget labels remain configuration data and are not translated by the
shell. Numbers, axis values, topic names, and frame IDs also remain unchanged. French and Spanish safety wording still
requires native-speaker and operator review before participant use.

## Cartesian Command Frame

Every virtual Cartesian control and physical gamepad contribution in one runtime session uses one effective command
frame. Its initial value is:

1. `application.runtime_policy.command_frame_id`, when set;
2. otherwise the backend `BLOOM_ROS_COMMAND_FRAME_ID` deployment default.

Set it in **Builder > App configuration > Adapter guardrails > Cartesian command frame**. The selector is populated
from `GET /api/v1/capabilities`, and the effective frame is visible in the kiosk bar. A screen may offer a
`teleop-frame` selector such as Joystick Lab. It can choose only a reported frame and only while the composed twist is
zero; that selector lasts for the current app runtime session. A choice made in Runtime Settings is a per-profile local
override and is restored when that application/profile is reopened. Neither path rewrites the application bundle.

Bloom accepts only `BLOOM_ALLOWED_COMMAND_FRAME_IDS`. `cartesian_manager` recognizes its configured base,
end-effector, and hybrid frames; it does not perform a general TF lookup. The linear component follows the manager's
base convention. Angular components from end-effector or hybrid frames are rotated using the live pose. Unknown frames
are rejected by Bloom when outside the allowlist and skipped by the manager if they reach it.

The defaults cover the current Explorer and Kinova bringups: `base_link`, `ft_frame`, `effector_frame`, and
`hybrid_frame`. Narrow the allowlist to the robot actually served by the backend. One backend instance represents one
robot and can name it with `BLOOM_ROBOT_NAME`.

## Shared Applications And Local State

Tracked applications live under `backend/seed/applications/`. On first start, missing applications are imported into
the configured store. Seeding does not overwrite local edits.

```bash
cd backend
uv run python -m apps.bloom_cli.main config status
uv run python -m apps.bloom_cli.main config seed --force explorer-manager
uv run python -m apps.bloom_cli.main config publish explorer-manager
```

Use `config status` before assuming a local runtime matches the committed application. Use `seed --force <app-id>` to
discard that app's local version and restore the tracked seed. Use `config publish <app-id>` when the local version is
the one the team should share.

## Recording And Diagnostics

Diagnostics and recording remain maintenance/debug workflows, not primary kiosk controls. Bloom Debug can inspect the
topic catalog, subscriptions, audit records, and recording state. Real rosbag recording is opt-in with
`BLOOM_RUNTIME_RECORDING_GATEWAY=rosbag`; the default is a safe no-op/simulated gateway.

Before a robot session, verify:

- the kiosk bar reports the expected app, robot, frame, profile, and link state;
- `/joystick_cartesian_command` has the expected publisher/subscriber graph;
- the manager output `/cartesian_command` returns to zero when controls are released;
- valid mode requests reach `/mode_request`, while invalid requests are rejected and audited;
- STOP latches across a reload or second runtime client;
- the target tablet, gamepad, and selected accessibility profile have been tested together.

The complete command sequence and remaining acceptance work are in
[Extender and Petanque end-to-end validation](extender-petanque-validation.md).
