# Bloom Operator Runtime

Current behavior as of 2026-09-17. This is the canonical operating contract for Bloom runtime. It documents what the
merged product does; live robot acceptance is tracked separately in
[Extender and Petanque end-to-end validation](extender-petanque-validation.md).

Bloom is the active Extender IHM. `extender_ui` is legacy and may be used only as a behavior reference or emergency
rollback while live acceptance is completed.

If you are about to drive an arm rather than check a claim, read [Operate safely](tutorials/operate-safely.md)
first. It is this contract in the order the work happens.

## Launch An Application

1. Start the Bloom API and dashboard. For an Extender lab session, use
   `scripts/extender-workspace-dev.sh` from the repository root.
2. Open **Runtime**. The library lists the apps on this robot; select one to see its roles in the right rail.
3. Choose a role and press **Open as <role>**. The role opens the screen its profile names.
4. Confirm the kiosk bar names the expected application, screen, link state, command frame, and role before moving a
   control.
5. Use **STOP** immediately if the command path or motion is not what you expect.

Runtime is an operator surface, not a builder preview. Product navigation, screen switching, editing links, Help, and
diagnostics are absent from the normal operating surface. Hold the **⋯** maintenance button for 1.5 seconds to reveal
them. Screen changes are deliberately kept inside maintenance so an accidental tap cannot replace the controls under a
hand. When a fitted artboard is smaller than its authored size, Maintenance also reports the authored dimensions, actual
rendered percentage, and risk that targets have fallen below the 44 px touch floor. The warning stays off the operating
surface and does not claim that scaling is safe.

### Library And Roles

Each row shows the app's screens, the device classes it was authored for, and an **Archived** badge when it is no
longer maintained. The rail shows one card per profile with a short tagline. The role used last on this device is
marked **last used** and preselected, but nothing opens until the operator presses **Open as <role>**: choosing a role
is deliberate. An app that declares no profiles says so and opens with runtime defaults. The supervisor mirror is a
secondary action under the open button. The former **Auto** choice is gone; a stored `Auto` reads as no role
remembered. A **This device** note in the rail names the class this browser counts as, its floor and its input. The
app opened last is preselected once its configuration loads, and Escape closes the library menu.

A profile's `preferred_control_layout_id` selects the screen a role opens on. When it names no existing screen, the app
opens on its first screen. On the Manager apps, **Operator** and **One switch** open **Drive · Operator** and **Bench**
opens **Drive · Bench**. To change role mid-session, open Maintenance and hold **Switch role**, which needs its own
1.5 second hold.

### Kiosk Bar

The 44 px bar reads, left to right: app name, screen title, a status chip, the command frame, the publish rate, the
role pill, and the **⋯** maintenance hold, drawn as a fill on the button itself.

| Chip | Meaning |
| --- | --- |
| READY | Linked and this session controls the robot. |
| HELD FOR MAINTENANCE | Maintenance, Settings, or the practice tour is open; teleop is suspended at zeros. |
| STOPPED | The backend STOP latch is engaged. |
| NOT IN CONTROL | Another session owns the robot; this screen is inert until you **Take control**. |
| LINK DOWN / CONNECTING | The frontend has no backend link yet or lost it. |
| DEBUG | Bloom Debug, in place of READY. Every other chip still outranks it. |

The rate reads `N Hz` at rest, `publishing · N Hz` while a control moves, and `zeros held` while held or stopped. A
**Command failed** or **Not sent** alert appears beside the rate when the backend refuses or simulates an action. The
gamepad and ownership tags moved into the maintenance sheet's facts. The robot name left the bar altogether: it is on
the supervisor mirror and in `GET /api/v1/capabilities`, because one backend serves one robot and the operator is
already looking at that arm.

### Maintenance Sheet

The sheet opens over a scrim with a **Robot held at zeros** badge. While it is open, only releases reach the robot: a
joystick still held under the sheet does not resume motion when the zero goes out. It lists six read-only facts (link,
publish rate, command frame, profile and its layout, device class, and **App**, which names the application) and four
actions: **Settings**, **Switch role**, **Reload this app**, and **Exit to library**. **Switch role** appears only when
the app offers more than one profile. Reloading returns to the same app, role and screen. Screen switching, the
practice tour, the supervisor mirror, Builder shortcuts, Help, Home, and the EN/ES/FR selector sit in a **More** group
below them; only that group scrolls, so **Close** at the top and **Resume operating** at the bottom stay on screen.
Resuming closes the sheet and publishing resumes at once. Nothing in the sheet changes what the app sends.

The publish rate is the ceiling while a control moves. At rest nothing is streamed: a release sends a short tail of
zeros, and `cartesian_manager` expires an input after 0.2 s, so its output stays at zero.

Runtime also checks each widget's declared backend requirement against `GET /api/v1/capabilities`. When the backend
explicitly reports a required publisher, subscriber, service, or teleop seam unavailable, the control remains in its
authored position but becomes inert and shows the backend's reason. A missing or failed capability report remains
unknown and does not disable the screen by guesswork.

Command controls show acknowledged state, not an optimistic guess. A mode selection or toggle changes only after the
backend reports `accepted`, `called`, or `published`. A blocked, failed, unsupported, or simulated action leaves the
last acknowledged state in place and raises **Command failed** or **Not sent** in the kiosk bar with the backend detail.
Treat either message as an incomplete operation; a simulated response is useful in development but is not robot work.

## Control Ownership And Handover

Each Runtime tab receives an opaque backend session ID and automatically asks to control the robot. Only one connected
session can own robot commands at a time. The owner's kiosk bar reads `READY`, and the maintenance sheet's **Link**
fact adds **you control the robot**. A second Runtime tab reads `NOT IN CONTROL`, keeps its artboard inert and shows
**Another operator controls this robot**; it cannot publish teleop, topic, service, camera, or recording operations.

**Take control** is an explicit retry, not a forced takeover. It succeeds only after the current owner releases control
or disconnects; waiting sessions are never promoted silently. STOP remains available from a blocked Runtime because
stopping must not depend on lease ownership. Scan and dwell profiles restrict themselves to **Take control** and STOP
while blocked rather than disappearing or reaching robot controls. Resume and every other robot-facing command require
the lease.

When the owner leaves Runtime, the frontend clears composed input and asks the backend to release. The backend first
blocks new commands and handover, waits for any in-flight command, publishes zero for every teleop target that still has
a nonzero command, and only then releases the lease. A lost connection follows the same sequence. If that final
neutralization cannot reach the adapter, Bloom latches the shared runtime STOP before relinquishing ownership. Treat an
unasserted STOP as a software-path failure and use the hardware emergency stop and lab procedure.

## Supervisor Mirror

Open **Supervisor mirror** beside an app in the Runtime library. From a running app, hold **Maintenance** and choose the
same action to open that app's mirror in a separate browser tab or display. The route includes the configuration and
application IDs, so a bookmarked mirror resolves the intended app instead of whichever app Builder last selected.

The mirror shows the application, configured robot, shared backend STOP latch, whether an operator currently owns
control, frontend/backend session state, and relevant ROS topic readiness. It refreshes ownership, STOP, and topic
status every two seconds and also offers a manual status refresh.

The frame and mode it reports come from the backend, not from the mirror's own browser. While an operator is driving,
the backend reports the frame their commands are actually stamped with and the mode their session last requested, so a
supervisor watching from another screen reads the operating session rather than a local copy of it. With no operator
driving, the mirror falls back to the app's configured frame and says so. `cartesian_manager` publishes no
authoritative active-mode feedback, so a requested mode is always reported as the last request, never as confirmed
controller state.

This surface is read-only twice over. It receives a projected client with connection observation and status-read
methods only, and a deployment can give the mirror's machine a `BLOOM_OBSERVER_API_KEY` instead of the operator key.
The server then refuses that session's teleop commands and its attempts to claim or release control, so the mirror
cannot command the arm even if someone reaches its keyboard or its browser console. It has no movement, STOP, resume, topic-publish, or configured-action controls. Its ownership notice comes
from the backend lease state; opening or closing a mirror never hands command authority to another browser. Deliberate
supervisor takeover remains a future product and safety decision if supervisory controls are ever introduced.

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
- A screen places STOP in its `stop` reserved region, which widgets cannot occupy. A screen without one keeps STOP in
  the bottom-right corner.
- STOP stays live above the maintenance scrim, Settings, and the practice tour. Over the sheet it keeps its place;
  over Settings and the tour, which replace the canvas, it becomes a full-height rail on the right that those views
  keep clear.
- While stopped, the screen's widgets go muted and inert and the control becomes **HOLD TO RESUME**.
- Resume requires a continuous one-second hold. Leaving or releasing the target cancels the hold.
- Link, stop, and recovery transitions can produce audio cues when the selected profile enables them.

This control does not replace the robot's hardware emergency stop, controller limits, or the operator's normal lab
safety procedure.

## Manager Drive Controls

The shipped **Explorer Manager** and **Kinova Manager** apps each have two Drive layouts that publish byte-identical
messages for the same gesture:

- **Drive · Bench** is the debugging layout. A context row carries the shaping modes and gripper, the stage carries
  Translation with Height and Rotation with Pivot, and a status rail on the right carries continuous speed limits and
  the STOP region.
- **Drive · Operator** is the accessible layout. It uses plain words (**Both**, **Hold snake**, **Close gripper**),
  **Slow / Medium / Fast** speed segments, larger targets, and the same STOP region.

Height is vertical next to Translation (linear axes); Pivot is horizontal under Rotation (angular axes). Pivot's left
end turns the hand left (`+angular.z`). This sign is verified on the ROS wire, not yet on hardware.

| Control | Runtime behavior |
| --- | --- |
| Translation joystick | Contributes `linear.x` and `linear.y`. |
| Rotation joystick | Contributes `angular.x` and `angular.y`. |
| Height slider | Contributes `linear.z` and returns to zero on release. |
| Pivot slider | Contributes `angular.z` and returns to zero on release. |
| Neutral | Requests `geometric/both`. |
| Jaco | Requests `geometric/jaco`. |
| Hold snake | Requests `geometric/snake` while pressed and `geometric/both` on release. A pointer holds it; keyboard, switch scanning, and dwell latch it instead, and the next activation releases it. An unattended latch releases itself after 15 seconds. |
| Gripper | Explorer publishes close `[1.1]` and open `[0.2]`, matching `tablet_interface`. Kinova publishes close `[0.8]` and open `[0.0]`, the Robotiq 85 knuckle joint's range. The button names what it will do (**Close gripper**); the card header names the commanded state. |
| Speed limits | Bench sliders start at the configured controller limits; Operator segments offer Slow, Medium, and Fast (Explorer 0.08 / 0.15 / 0.30, Kinova 0.025 / 0.05 / 0.10). Both publish linear/angular limits to `qontrol_controller` and are disabled when the ROS graph has no subscriber. |

The four Cartesian widgets are composed into one complete 6-DoF twist. Releasing one source clears only its
contribution. The runtime continues publishing the composed value so `cartesian_manager` can enforce its source timeout.
Bloom sends normalized values and does not add a hidden linear or angular scale. Widgets may sample at up to 30 Hz,
but one latest-value gate caps the combined WebSocket stream at 30 commands/s. Explicit zero commands bypass that gate
and discard any queued movement; the backend's default 60 commands/s ceiling remains an independent safety boundary.
The speed slider readouts are therefore downstream limits, not a second scale in Bloom. Maintenance diagnostics list
their topics explicitly; **No subscriber** means the controller is not ready and the corresponding slider stays inert.

Saved positions belong to one application. A pose is a joint vector in one arm's joint order, so Explorer's poses never
appear in Kinova's export, where the same numbers would mean different angles.

The Positions screen supports confirmed named targets, explicit release/cancel, saving the current joint state, deleting
a saved pose, and export of a `joint_targets` configuration block. Explorer offers **Go home**, which arms on the first
press and publishes on the second; Kinova offers none, because its manager loads no home joint target
(cartesian_manager#10). Both offer **Release**. A saved pose cannot be replayed or renamed from Bloom:
the manager moves only to targets it loaded at start, so a new pose reaches the robot through the export and a manager
restart. Saved poses live in the API process and are lost when it restarts, so export them before stopping it. Robot
Feedback and Command Sources expose measured state and the manager's summed inputs without placing debug detail on the
Drive screen.

## Joystick Lab

Both Manager applications include **Joystick lab**, a virtual version of the physical joystick workflow used for
Robin. It puts translation, height, rotation, pivot, mode requests, momentary Snake, gripper, and the command echo on
one screen. The same screen works with direct touch, keyboard, gamepad, and the `scan` profile.

The Base, Tool, Hybrid, and Force sensor buttons select the current runtime session's command frame. Bloom keeps a
frame visible when the connected robot does not report it, disables it, and says that it is unavailable. While any
composed twist is non-zero, all frame buttons are disabled with **Release controls**. A frame change therefore cannot
reinterpret motion already in progress. The kiosk bar updates immediately, and the next widget or gamepad command uses
the selected frame.

Under **SENT — /joystick_cartesian_command**, the **Twist** echo subscribes to that topic and prints the latest
`twist` with signed two-decimal linear and angular rows. Its header names the frame the session is stamping, so it is
readable before anything has been sent; once a message arrives the frame comes from the message itself. Its Pause,
Clear and Copy words and its empty line follow the profile's language, and the empty line wraps inside the card, while
message text keeps its own line breaks and scrolls. The echo helps verify the command leaving Bloom; it is not
controller feedback or proof of robot motion.

The README includes a [live Joystick Lab capture](assets/screenshots/11-joystick-lab.png) and a
[five-minute walkthrough](assets/demo/bloom-demo.mp4) recorded against the Explorer Gazebo simulation: the Builder, both
Drive layouts, Positions, Robot feedback, Joystick Lab, Settings, STOP, Bloom Debug and the camera. It is simulation
evidence without physical hardware acceptance; Kinova follows the same flow with its own frame allowlist, and
`npm run e2e:sim` checks both robots' command paths on the ROS graph.

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

Hold **Maintenance**, then open **Settings** to adjust the current profile without entering Builder. Settings replaces
the robot controls rather than covering them, the bar reads **HELD FOR MAINTENANCE**, and composed teleop stays
suspended.

Settings has three columns:

- **Display**: text size (Normal, Large, Larger), language (EN, ES, FR), and sound on every press.
- **How you reach the controls**: the input method (Touch, Dwell, Scan) and, as a separate card, **How a push moves**
  (Drag, Tap by tap, Keep going), which maps to the direct, step, and latch presets.
- **Timing**: hold to activate, scan step, ignore repeats, and joystick dead zone. A setting that does not apply to the
  chosen input method is drawn dashed and reads, for example, **only for Scan**. A dead zone of zero reads **each
  control's own**, because each widget then keeps its authored dead zone.

**Try it** runs a press target with the draft settings and a readout of target size, font scale, and timing. Nothing is
sent. Changes stay a draft until **Save and resume**, which stores them in the browser preference payload under
`profileOverrides[configId:appId:profileId]` and returns to operation. **Discard changes**, or Escape on a keyboard,
leaves without saving. Malformed stored values are ignored.

The command frame is no longer a setting: it changes what the app publishes, so it is chosen on the Joystick Lab frame
row and shown read-only in the bar and the maintenance sheet. A stored per-profile frame override is ignored and
removed.

Settings uses the active scan period and dwell duration itself, so its controls and **Save and resume** stay reachable
under scanning and dwell. **Practice tour** opens the guided local-only path without returning through the live
controls first.

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

The runtime status, STOP/resume control, Maintenance, scanner, Settings, the library, and empty-screen state use the
selected catalog. App names remain configuration data. Widget labels, screen titles and role names are authored in
English; the vocabulary the shipped seeds use (speed words, shaping modes, frames, turn words, gripper verbs and state,
directions, group labels, screen titles and role names) is shown in the profile's language from a glossary, and any
other authored text stays as written. A longer
language wraps to a second line and the control grows; nothing truncates. Numbers, axis values, topic names, and frame
IDs remain unchanged. French and Spanish wording, STOP and the resume hold above all, still requires native-speaker and
operator review before participant use.

## Cartesian Command Frame

Every virtual Cartesian control and physical gamepad contribution in one runtime session uses one effective command
frame. Its initial value is:

1. `application.runtime_policy.command_frame_id`, when set;
2. otherwise the backend `BLOOM_ROS_COMMAND_FRAME_ID` deployment default.

Set it in **Builder > App configuration > Adapter guardrails > Cartesian command frame**. The selector is populated
from `GET /api/v1/capabilities`, and the effective frame is visible in the kiosk bar. A screen may offer a
`teleop-frame` selector such as Joystick Lab. It can choose only a reported frame and only while the composed twist is
zero; that selector lasts for the current app runtime session and does not rewrite the application bundle. Runtime
Settings no longer offers a frame, and a stored per-profile frame override is ignored.

Bloom accepts only `BLOOM_ALLOWED_COMMAND_FRAME_IDS`. `cartesian_manager` recognizes its configured base,
end-effector, and hybrid frames; it does not perform a general TF lookup. The linear component follows the manager's
base convention. Angular components from end-effector or hybrid frames are rotated using the live pose. Unknown frames
are rejected by Bloom when outside the allowlist and skipped by the manager if they reach it.

The default allowlist is `base_link` and `hybrid_frame`, which every manager config has. Set `BLOOM_ROS_EE_FRAME_ID`
to the served robot's end-effector frame (`ft_frame` on Explorer, `effector_frame` on the Kinova gen3) to offer it too.
An Explorer backend that advertised `effector_frame` accepted commands the manager then discarded without a word. One
backend instance represents one robot and can name it with `BLOOM_ROBOT_NAME`.

## Shared Applications And Local State

Tracked applications live under `backend/seed/applications/`. On every start, missing applications are imported into
the configured store and unedited copies take the shipped version. Seeding never overwrites local edits, and it does
not bring back a shipped application someone deleted.

```bash
cd backend
uv run python -m apps.bloom_cli.main config status
uv run python -m apps.bloom_cli.main config seed --force explorer-manager
uv run python -m apps.bloom_cli.main config publish explorer-manager
```

Use `config status` before assuming a local runtime matches the committed application. It reports `shared` when the
store matches the shipped bundle, `outdated` when this machine never edited its copy and a newer version ships, and
`edited` when the local copy is someone's own work, `local` for an app that ships nowhere, `missing` for a shipped app
not yet seeded, and `deleted` for a shipped app removed on purpose. Startup takes shipped updates for `outdated` apps
automatically and never touches an `edited` one. Use `seed --force <app-id>` to discard local edits and restore the tracked seed, and
`config publish <app-id>` when the local version is the one the team should share.

## Live Telemetry

A runtime workspace holds at most one subscription per topic per socket, whichever widget asked first, so two widgets
reading the same topic are served by one stream and a sample arrives once (decision 0134). Changing screen releases the
topics the new screen does not show with an `unsubscribe_topic` message. The backend keys each handle by widget id and
topic, so an unsubscribe closes exactly the handle it names and a widget asking again for its own topic replaces its
handle instead of stacking one; a session may hold at most 64. Every subscription belongs to the socket that made it: a
reconnect starts a session holding none, so the screen re-requests them when the link comes back. Without that, the chip
could return to `READY` over blank telemetry panels.

Values that JSON cannot carry are not dropped. A non-finite number anywhere in a message — the NaN velocity and effort
the simulated passive gripper joints report, for instance — is sent as `null`, so the rest of the message still
arrives. Plots skip a `null` reading rather than drawing it as zero.

### Display Widgets

**Robot feedback** and **Command sources** are built from a plot board, a picker beside it, and either a value strip or
an event log. The board draws up to eight series from the `--bloom-series-1 … -8` ramp, in order and never by meaning; a
ninth series repeats a colour dashed. The picker chooses which series are drawn and remembers the choice per profile.
Command sources also states which input is driving, judged on the whole twist rather than one axis.

- A sample is timed by the browser that received it, not by the message stamp, so a tablet clock running behind the
  robot's cannot push a live reading off the window.
- `history_seconds` sets the window, 30 s by default, and the board keeps that whole window even on a fast topic.
- `y_fit_data` is on by default. It widens the authored `y_min`/`y_max` to take in the data with 5% headroom; it never
  narrows below the authored range.
- A reading with no new sample for three seconds dims and is marked **stale** in the value strip and in a picker row
  that shows values. The newest sample stops at the right edge instead of drawing past it.

**Bloom Debug** is a desktop app authored at 1920×1080. Its three header cards — Robot preflight, Topic catalog,
Runtime audit — are runtime chrome drawn inside the screen's `debug-status` reserved region, not widgets, so no author
can place or resize them. Below them sit the plot board and picker, a joint table, a Jacobian with its manipulability
row, and the raw topic echo. The joint table and the Jacobian read **not reported** when joint limits or `/ee_jac` are
missing, manipulability is compared against this session's best rather than a guessed threshold, and a value under 0.01
is shown in exponent form rather than rounding to `0.000`. Every list scrolls inside its own card.

## Recording And Diagnostics

Diagnostics and recording remain maintenance/debug workflows, not primary kiosk controls. Bloom Debug can inspect the
topic catalog, subscriptions, audit records, and recording state. Real rosbag recording is opt-in with
`BLOOM_RUNTIME_RECORDING_GATEWAY=rosbag`; the default is a safe no-op/simulated gateway.

Before a robot session, verify:

- the kiosk bar reports the expected app, screen, frame, role, and link state, and the maintenance sheet the expected
  profile, device class and publish rate;
- `/joystick_cartesian_command` has the expected publisher/subscriber graph;
- the manager output `/cartesian_command` returns to zero when controls are released;
- valid mode requests reach `/mode_request`, while invalid requests are rejected and audited;
- STOP latches across a reload or second runtime client;
- the target tablet, gamepad, and selected accessibility profile have been tested together.

The complete command sequence and remaining acceptance work are in
[Extender and Petanque end-to-end validation](extender-petanque-validation.md).
