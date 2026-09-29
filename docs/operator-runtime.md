# Bloom Operator Runtime

Current behavior as of 2026-09-29. This is the canonical operating contract for Bloom runtime. It documents what the
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
3. Press **Open as <role>**. A role is offered so the app is always one press from opening: the one this
   device opened last, then Operator, then whatever the app lists first. Pressing another role first opens as
   that one instead, and that choice is what the device remembers next time. The role opens the screen its
   profile names.
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
marked **last used** and preselected, and **Open as <role>** opens it in one press. An app that declares no profiles says so and opens with runtime defaults. The supervisor mirror is a
secondary action under the open button. The former **Auto** choice is gone; a stored `Auto` reads as no role
remembered. A **This device** note in the rail names the class this browser counts as, its floor and its input. The
app opened last is preselected once its configuration loads, and Escape closes the library menu.

A profile's `preferred_control_layout_id` selects the screen a role opens on. When it names no existing screen, the app
opens on its first screen. On the Manager apps, **Operator** and **One switch** open **Drive · Operator** and **Bench**
opens **Drive · Bench**. To change role mid-session, open Maintenance and hold **Switch role**, which needs its own
1.5 second hold; a scan or dwell press selects it directly.

### Kiosk Bar

The 44 px bar reads, left to right: app name, screen title, a status chip, the command frame, a behaviour chip
(**Speed up on** / **Assist on**) while a manager behaviour is on, the publish rate, a **Gamepad** chip while a pad
is connected, the practice offer on a role's first entry, the role pill, and the **⋯** maintenance hold, drawn as a
fill on the button itself. Under scanning **⋯** is part of the
scan set, and selecting it opens maintenance at once: a switch cannot hold anything down, and waiting out the scan
cycle is already the deliberate act the 1.5 s hold asks a pointer for. The pointer and keyboard hold is unchanged.
A tap released too early says to keep holding.
With a mouse, resting on a chip shows a short native tooltip saying what it means; touch never shows one.

A role that does not drive can skip the hold: with **A tap opens the menu** set in the Builder's role editor
(`menu_on_tap`), a tap on **⋯** opens maintenance, and the screen title becomes a button that opens it on the screen
list. Opening maintenance still holds the robot at zeros, and **Switch role** keeps its own hold. The shipped
**Bench** and **Lab** roles use it; **Operator** and **One switch** keep the hold.

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
the app offers more than one profile. Reloading returns to the same app, role and screen. The app's **Screens** come
first, when it has more than one. **Practice**, the supervisor mirror, Builder shortcuts, Help, Home, and the EN/ES/FR
selector sit in a **More** group below the actions. Only the middle of the sheet scrolls, so **Close** at the top and
**Resume operating** at the bottom stay on screen. Resuming closes the sheet and lifts the hold; it sends nothing, and
the arm moves again only on a new push. Nothing in the sheet changes what the app sends. Maintenance sends only teleop
zeros: it does not engage STOP or cancel a pose target already running. The
[maintenance tutorial](tutorials/maintenance.md) is the same material for operators and lab staff, step by step.

Focus moves into the sheet when it opens and is trapped there while it is open: the artboard behind the scrim is
hidden from screen readers by `aria-modal`, so Tab must not walk into it. **Close**, **Resume operating** and Escape all
return focus to **⋯**. STOP stays live above the scrim for pointer and scanning, and it is part of the sheet's Tab
loop, so a keyboard operator reaches it without closing the sheet.

Under scanning the sheet becomes the scan root while it is open, with STOP first and its own SWITCH bar in the footer,
so Settings, a screen change, a role switch and **Resume operating** are all reachable by switch. The canvas behind the
scrim is never scanned. Settings does the same with its own controls. The entries that leave the runtime (**Exit to
library**, **Supervisor mirror**, **Edit**, Help and Home) are not scanned, and the sheet says so: they lead to a page
with no scanner, so a caregiver opens them by touch.

The publish rate is the ceiling while a control moves. At rest nothing is streamed: a release sends a short tail of
zeros, and `cartesian_manager` expires an input after 0.2 s, so its output stays at zero.

A Runtime tab names the app it is running on its socket as soon as it opens (`app_context`). From then on teleop,
topic publishes and service calls are limited to the intersection of the deployment allowlists and that app's
`runtime_policy`, the same narrowing `POST /runtime/actions` has always applied. An app that declares no teleop target
of its own, such as Bloom Debug or the webcam visualizer, can stream none. A client that names no app keeps the
deployment-wide limits. The HTTP routes do the same: a widget's topic publish or parameter set carries its
`config_id` and `app_id`, and the API checks that app's policy, `allowed_parameters` included.

Runtime also checks each widget's declared backend requirement against `GET /api/v1/capabilities`. The report names one
seam each for commands, services, topic data, teleop, camera frames, and recording. When the backend
explicitly reports a required publisher, subscriber, service, or teleop seam unavailable, the control remains in its
authored position but becomes inert and shows the backend's reason. A missing or failed capability report remains
unknown and does not disable the screen by guesswork.

### What a stateful control shows

Since [ADR 0142](decisions/0142-command-state-lives-in-the-backend.md), the backend keeps one record per command
target (a topic, a `/hub/digital_output` pin, a node parameter, the manager's shaping mode, behaviour and target,
visual servoing, the Petanque state) and pushes the whole record to every runtime socket, supervisor included: on
connect, on every change (at most 20 times a second) and every 500 ms regardless. A toggle, a latched mode button or
a parameter switch renders that record and nothing else; the screen keeps no state of its own and never re-sends.

Each record says where its value came from:

- **reported by the robot**: a parameter read back from `/parameter_events`, the Kinova gripper finger in
  `/joint_states`, the Petanque state machine on `/fsm_viewer`, visual servoing seen commanding on
  `/visual_servoing/velocity_command`, or the manager's shaping, behaviour and target from its latched
  `/cartesian_manager/status`.
- **last asked**: the last value published on the command topic, by this tablet, another tablet, the joystick mapper
  or the server's own STOP and leave resets. The backend subscribes to its own command topics, so a press from any
  source shows up. A mode request reads **last asked** until the manager's status takes it up; if the status has not
  moved within 1 s, the manager refused or ignored it and the control returns to what the status reports. A manager
  without `~/status` (before cartesian_manager#12) leaves shaping, behaviour and targets **last asked**; the speed
  limits and the digital outputs always are.
- **Unknown**: never seen, or lost (the manager restarted, a pose target that nobody saw end for 30 s). The control
  lights neither side and offers both actions, for example **Close gripper** and **Open gripper**; a known state
  offers one.

A press only sends the request:

- The control reads **Sending…** until the store moves or 3 s pass, then shows whatever the store says.
- **Accepted** (`accepted`, `called` or `published`): the store records the value as last asked at once; the robot's
  feedback, where there is any, turns it into reported by the robot.
- **No reply** (a timeout, a network error, or a 500, 502, 503 or 504): the robot may have applied it. The control
  keeps showing the store and reads **Not confirmed by the robot** until the store moves on that target; nothing is
  re-sent. The kiosk bar reads **Command failed** for the send that got no reply.
- **Refused** (STOP latched, not in control, outside the app's policy, any other 4xx, or simulated with no ROS): the
  robot did not apply it. The control keeps showing the store, with the reason as its mark, and the kiosk bar raises
  **Command failed** or **Not sent** with the backend detail.
- **Superseded** (409): a newer send on the same target already won; nothing to do.
- A joint target sends once and is never lit. A pose target stays lit until the arm reaches it, when the manager's
  status (or, without one, the arm's pose) returns the behaviour to passthrough.

STOP and a leave publish their resets themselves (shaping to Both, visual servoing off, a target cancelled), and the
store shows them on every screen; nothing is re-applied after Resume without a new press.

What to do when a mark shows:

- Do not press again to test it; the next push from the backend says what happened.
- Watch the arm.
- Press STOP if the arm does not match the screen.

A simulated response is useful in development but is not robot work.

## Control Ownership And Handover

Each Runtime tab receives an opaque backend session ID and automatically asks to control the robot. Only one connected
session can own robot commands at a time. The owner's kiosk bar reads `READY`, and the maintenance sheet's **Link**
fact adds **you control the robot**. A second Runtime tab reads `NOT IN CONTROL`, keeps its artboard inert and shows
**Another operator controls this robot**; it cannot publish teleop, topic, service, camera, or recording operations.

One backend serves at most 32 runtime sessions at once, tabs and mirrors together. A connection past that is refused
with **this robot already has enough connections** and closed; close a Bloom tab or a mirror and reconnect. Each
session may hold up to 64 topic subscriptions.

**Take control** is an explicit retry, not a forced takeover. It succeeds after the current owner releases control,
disconnects, or has said nothing at all for 10 seconds — a tablet that lost Wi-Fi keeps its connection open, and its
lease must not block the room until that connection finally dies (decision 0135). A Runtime tab pings every 3 seconds
while it is open, so an operator reading the screen and moving nothing never looks stale. Waiting sessions are never
promoted silently: someone has to press **Take control**. Taking a stale lease is not free of side effects: before the
new owner can drive, Bloom undoes what the silent owner left set, a Go home still running (`behaviour/passthrough`), a
Snake or Jaco shaper (`geometric/both`) and visual servoing it switched on. STOP remains available from a blocked Runtime because
stopping must not depend on lease ownership. Scan and dwell profiles restrict themselves to **Take control** and STOP
while blocked rather than disappearing or reaching robot controls. Resume and every other robot-facing command require
the lease.

When the owner leaves Runtime, the frontend clears composed input and asks the backend to release. The backend first
blocks new commands and handover, waits for any in-flight command, publishes zero for every teleop target that still has
a nonzero command, cancels a joint target it started, resets a shaper it left set to `geometric/both`, switches off
visual servoing it switched on, and only then releases the lease. A lost connection follows the same sequence. If that final
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
the backend reports the frame their commands are actually stamped with, so a supervisor watching from another screen
reads the operating session rather than a local copy of it. With no operator driving, the mirror falls back to the
app's configured frame and says so. The mode is the command store's: what `/cartesian_manager/status` reports, or,
with a manager that has no status (before cartesian_manager#12), the last request.

This surface is read-only twice over. It receives a projected client with connection observation and status-read
methods only, and a deployment can give the mirror's machine a `BLOOM_OBSERVER_API_KEY` instead of the operator key.
The server then refuses that session's teleop commands and its attempts to claim or release control, so the mirror
cannot command the arm even if someone reaches its keyboard or its browser console. It has no movement, STOP, resume, topic-publish, or configured-action controls. Its ownership notice comes
from the backend lease state; opening or closing a mirror never hands command authority to another browser. Deliberate
supervisor takeover remains a future product and safety decision if supervisory controls are ever introduced.

## Guided Practice

On the first entry to an app the bar offers practice: **Try the controls first — nothing is sent to the robot**, with
**Start practice** and **× Hide**, both the bar's full height. On the 1024×600 panel, and whenever a behaviour,
gamepad or command-feedback chip takes the room, the sentence folds away and the two buttons stay; a screen reader
still hears it as the button's description. On that crowded narrow bar the app name steps aside too, so the screen
title reads whole; the name stays on the title's hover help and in the maintenance sheet's facts. **Hide** keeps the offer out of the bar for this role and app on this
device, and opening practice, from the offer or from the menu, does the same; a Builder preview hides it for that
session only. The **Practice offer**
card in Runtime Settings, under **How you reach the controls**, reads **Offer at start** or **Off**: a hidden offer
shows as neither, choosing **Offer at start** brings it back on **Save and resume**, and **Off** keeps it out of the
bar for this role on this device. Practice itself stays findable either way: hold **Maintenance** and choose
**Practice** under **More**.

Practice replaces the live artboard and suspends composed teleop. Its five checks introduce the current screen, use the app's own movement
label twice, rehearse STOP and held resume, rehearse the Maintenance hold, and return to operation.

The practice surface has no runtime action client, robot-intent callback, or teleop callback. Its movement, STOP, and
Maintenance controls change local component state only. The banner therefore says the practice controls are
disconnected from robot commands; it does not make a claim about physical robot power or the live backend session.
Practice uses the selected language, font scale, scan period, and dwell behavior. Completed checks persist locally per
configuration and app, but the tour remains available for repetition.

## Stop And Resume

- A pointer press on **STOP** releases every control on the screen at once and engages the backend runtime stop.
  Outside scan, Enter or Space on a focused STOP engages it on the key press, not the release; under scan those keys
  are the switch. A held key's auto-repeat never stops or resumes a second time; only a fresh press does.
- The latch cancels a joint target in progress (Go home), switches visual servoing off, and resets the shaper to
  **Both**, and the screen then shows Both. The backend records those resets in the command-state store, so every
  screen shows them, and the screen keeps no pending press to re-apply after Resume.
- If the backend cannot be reached, the controls stay stopped on this screen, it shows the error, and
  **HOLD TO RESUME** is the way back.
- **STOP AGAIN** appears beside Resume when a STOP never reached the backend, or when the latch is on but the backend
  could not assert it on ROS. Press it until it goes away. The supervisor mirror shows such a latch as **Stopped, not
  confirmed on the robot**, with the reason. If it stays, use the hardware emergency stop.
- STOP is the first stop in the keyboard tab order, the runtime's only positive `tabindex`; it used to be
  second-to-last, behind every control on the screen.
- The stop is a backend latch shared by runtime clients; it is not a decorative local button.
- A screen places STOP in its `stop` reserved region, which widgets cannot occupy. A screen without one keeps STOP in
  the bottom-right corner.
- STOP stays live above the maintenance scrim, Settings, and the practice tour. Over the sheet it keeps its place;
  over Settings and the tour, which replace the canvas, it becomes a full-height rail on the right that those views
  keep clear.
- While stopped, the screen's widgets go muted and inert and the control becomes **HOLD TO RESUME**. They are marked
  `aria-disabled` and leave the keyboard tab order while the latch is on, so a keyboard or screen-reader operator is
  not walked through controls that answer nothing; STOP and resume stay reachable. Stopping from Settings or the
  practice tour, which replace the canvas, leaves the canvas stopped when it comes back.
- No screen control commands motion while the latch is on. Bloom refuses the command itself, whichever way the
  control was reached — pointer, keyboard, switch, or dwell — rather than leaving it to the robot to refuse. Returning
  a control to zero is still allowed, so a held control can come back to rest.
- A dwell in progress when STOP engages is abandoned rather than completed. Resting on a screen control while another
  operator or a hardware event latches the stop never fires that control; the pointer has to move away and rest again.
  The same holds for the Resume that replaces a STOP fired by dwell.
- Resume requires a continuous one-second hold. Leaving or releasing the target cancels the hold.
- Scanning stays on while stopped, and the highlight rests on the resume control and on the **⋯** button, so an
  operator who stopped is not held on that screen. Neither a switch press nor a dwell can hold, so resume asks twice:
  the first activation arms it and the control reads **PRESS AGAIN TO RESUME**, the second within eight seconds
  resumes, and the arming lapses on its own. A pointer still holds the full second.
- Under scan, only a switch key, the **SWITCH** bar, or a tap on Resume itself fires Resume. A tap elsewhere on the
  screen (the 3D view, a camera) still fires STOP when it is lit, but never Resume.
- Right after a STOP, a switch or dwell Resume waits for the switch to rest for 1.5 s, or two scan periods if that is
  longer; a press in that window starts it again, so the presses that stopped the robot never resume it. The
  confirming press must come at least one scan period (never under 600 ms) after the arming one, with no other press
  between; otherwise it arms afresh.
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
end turns the hand left (`+angular.z`). The sign is verified on the ROS wire and on both simulated arms, whose hand
yaws positively about the base z axis ([record](validation/ros-sim-e2e.md)); not yet on hardware.

| Control | Runtime behavior |
| --- | --- |
| Translation joystick | Contributes `linear.x` and `linear.y`; which base axis each word drives is the robot's, see below. |
| Rotation joystick | Contributes `angular.x` and `angular.y`; same. |
| Height slider | Contributes `linear.z` and returns to zero on release. |
| Pivot slider | Contributes `angular.z` and returns to zero on release. |
| Neutral | Requests `geometric/both`. |
| Jaco | Requests `geometric/jaco`. |
| Hold snake | Requests `geometric/snake` while pressed and `geometric/both` on release. A pointer holds it; keyboard, switch scanning, and dwell latch it instead, and the next activation releases it. An unattended latch releases itself after 15 seconds. |
| Gripper | Explorer publishes close `[1.1]` and open `[0.2]`, matching `tablet_interface`. Kinova publishes close `[0.8]` and open `[0.0]`, the Robotiq 85 knuckle joint's range. The button names what it will do (**Close gripper**); the card header names the commanded state. |
| Live tuning | A slider or toggle bound to a node parameter (Snake gain on Drive · Bench, the throw shape on Petanque's Teleop settings, the manager's servo input gate on Visual servoing · Approach) sets it through the node's own parameter service and opens on the value the node holds. Owner-only and audited; allowed while STOP is latched, because a gain is configuration, not motion (ADR 0139). |
| Speed limits | Bench sliders start at the configured controller limits; Operator segments offer Slow, Medium, and Fast (Explorer 0.08 / 0.15 / 0.30, Kinova 0.025 / 0.05 / 0.10). Both publish linear/angular limits to `qontrol_controller` and are disabled when the ROS graph has no subscriber. |

What each word drives in the base frame is the seed's `axis_mapping`, one per robot. The Explorer's is the profile
saved from `extender_ui`'s Sandbox teleop config and driven on the arm (swap X/Y, invert linear X); the Kinova's is
that app's unconfigured default, not yet driven on the gen3:

| Word | Explorer | Kinova |
| --- | --- | --- |
| Forward / Back | `linear.x` −1 / +1 | `linear.y` +1 / −1 |
| Right / Left | `linear.y` +1 / −1 | `linear.x` +1 / −1 |
| Up / Down | `linear.z` +1 / −1 | same |
| Tilt up / down | `angular.x` +1 / −1 | `angular.y` +1 / −1 |
| Roll right / left | `angular.y` +1 / −1 | `angular.x` +1 / −1 |
| Turn left / right | `angular.z` +1 / −1 | same |

`npm run e2e:sim` holds each word and checks the simulated hand moves along that base axis
([record](validation/ros-sim-e2e.md)). Flipping a sign or swapping an axis is a seed edit, verified the same way.

The four Cartesian widgets are composed into one complete 6-DoF twist. Releasing one source clears only its
contribution. The runtime continues publishing the composed value so `cartesian_manager` can enforce its source timeout.
Bloom sends normalized values and does not add a hidden linear or angular scale. Widgets may sample at up to 30 Hz,
but one latest-value gate caps the combined WebSocket stream at 30 commands/s. Explicit zero commands bypass that gate
and discard any queued movement; the backend's default 60 commands/s ceiling remains an independent safety boundary.
The speed slider readouts are therefore downstream limits, not a second scale in Bloom. Maintenance diagnostics list
their topics explicitly; **No subscriber** means the controller is not ready and the corresponding slider stays inert.

Saved positions belong to one application. A pose is a joint vector in one arm's joint order, with the hand's
Cartesian pose beside it, so Explorer's poses never appear in Kinova's list or export, where the same numbers would
mean different angles. They live in the configuration database and survive an API restart.

The Positions screen offers **Go home**, which arms on the first press and publishes on the second, on both arms: the
Kinova has its own seven-joint home since cartesian_manager#11, and `npm run e2e:sim --robot kinova` checks that its
press reaches `/joint_target_command` with seven joints. Named pose targets (`behaviour/pose_target/*`) stay refused
when `BLOOM_ROBOT_NAME` names a Kinova or gen3, because its manager still loads the Explorer's Cartesian poses, unless
`BLOOM_ALLOW_KINOVA_POSE_TARGETS=true`. Both offer **Cancel the pose**, which sends `behaviour/passthrough`. The Kinova
Manager app no longer carries a Reset fault button: the manager no longer spawns `fault_controller`. Faults: reset
from the arm's web page, or turn it off and on. Robot Feedback and Command Sources expose measured state and the
manager's summed inputs without placing debug detail on the Drive screen.

## Save A Pose And Go Back To It

Both Manager apps let the operator save where the hand is commanded to be and send the arm back there later, from
**Positions**, with no manager restart. **Positions · Bench** keeps the bench's tools for the same list.

**What is saved.** `/ee_pose` comes from qontrol and is the tip pose it *commands*, computed from its commanded joint
positions, not a measurement. **Save this pose** asks the server, which saves its own newest `/ee_pose` (never the
tablet's numbers; a tablet whose view differs by more than 1 cm or 0.05 rad is told the hand moved while saving),
refuses a pose farther from the base than `BLOOM_MAX_HAND_REACH_M` (1.2 m), and stores `/joint_states` in the
manager's joint order beside it. When TF has the measured tip (robot_state_publisher from the measured
`/joint_states`, base frame to qontrol's `tip_frame` or `BLOOM_ROS_TIP_FRAME_ID`), the server compares the two and
refuses beyond 2 cm or 0.1 rad (`BLOOM_POSE_SAVE_MAX_OFFSET_M` / `_RAD`, the same band that judges arrival): **The arm
is not where it was commanded (in contact or lagging): move it free and save again.** The band catches contact and
gross lag, not small tracking error: an arm a few millimetres and degrees behind its command still saves, and it is
the commanded pose that is saved. Without TF the pose is saved and its row says **not verified**. The server names it: the next free
**Pose 1**, **Pose 2** (stored `pose_1`), and a name already held is never overwritten.

**Go to Pose N** is a one-shot like Go home. The first press arms it for five seconds and the button reads **Press
again to go**; a 3D robot view on the same screen draws the saved pose as a large triad while it is armed. A second
press closer than 600 ms to the first, or a held Enter or Space, is the same gesture and is ignored. The second press
names the pose and the fingerprint of what the tablet showed; the server sends the saved commanded pose as a
`geometry_msgs/msg/PoseStamped` on the manager's `topics.pose_target` (`/pose_target`, cartesian_manager#11), stamped
with the manager's `frames.base_frame`. The manager starts `behaviour/pose_target` at once, drives toward it with its
`behaviours.pose_targets` gains and speed caps, and returns to passthrough within `position_tolerance` and
`orientation_tolerance` (1 cm and 0.05 rad in both shipped configs), judged on the commanded pose. While it moves the
manager ignores the pad, so the row reads **Moving to Pose N · reported by the robot** and the kiosk bar shows **Going
to a pose** on every screen.

The server follows every Go to and writes what it sees in the command state (`positions:go`), so every tablet shows
the same thing. When the status is back in passthrough the row reads **Within tolerance of Pose N** within 2 cm and
0.1 rad, or **Stopped before Pose N**, with the distance and angle left. That distance is the measured tip's when TF
has it (**measured tip … from it**) and the commanded pose's otherwise (**commanded pose … from it, tip not
measured**): nothing on the screen claims a measured accuracy Bloom did not measure.

What ends it:

- **Cancel the pose**, in the library while a Go to runs and as the Release button below it, sends passthrough on the
  manager's mode topic, even while stopped.
- STOP sends passthrough and refuses a Go to until Resume. STOP, losing control, a control going inert, the
  five-second timeout and leaving the screen all disarm an armed Go to; Resume clears the refusal.
- A session that leaves the app, or drops, while its pose target runs has the server send passthrough.
- The server's watchdog sends passthrough, audited, when the tip has not come 2 mm or 0.02 rad closer in 3 s, or
  after three times the time the move should take at the slower of the manager's speed cap and the controller's
  limit, plus 5 s. The row reads **Could not reach Pose N; the pad drives again**.

**Only Go to sends a pose target.** The generic publish refuses the manager's pose target topic for every app, and no
allowlist names it. The Go to route (`POST /runtime/positions/{name}/go`) is owner-only, refused while stopped, rate
limited, and refuses, audited and with the reason: another app than the session runs; an app with no position
library offering Go to; a pose changed since the tablet showed it; a manager that has not reported its base frame
yet; a pose saved in another frame; a pose past the reach; a pose saved with joints this arm does not report, or no
live joint state at all. A pose saved before this release has no hand pose and cannot be gone to; save it again.
The pose being gone to cannot be renamed or deleted until the move ends.

**Positions · Bench** lists the stored names and keeps the bench's tools: save, **Rename** (a–z, 0–9 and `_`, as the
manager can name a target), **Delete** on a second tap within four seconds, and **Export YAML**: the `joint_targets`
block, and a `pose_targets` block with the saved hand poses (names, frames, positions, orientations; the gains, speed
caps and tolerances stay as the manager config has them). A configured target reaches the manager only through that
export and a manager restart; Go to needs neither. The rail shows the live `/ee_pose` that the next save records.

## Manager Behaviours: Speed Up And Assist

Both Manager apps ship a **Behaviours** screen for cartesian_manager's two lasting behaviours. Each is a toggle whose
ON payload is the behaviour and whose OFF payload is `behaviour/passthrough`; the two replace each other on the
manager, so switching one on shows the other off. STOP, **Cancel behaviour**, or the operator leaving the app returns
the manager to passthrough (the server sends it, as it does for a joint target). The card lights from the command
state (ADR 0142): the request as sent, then **reported by the robot** while the manager's feedback topic streams.

| Control | Runtime behavior |
| --- | --- |
| Speed up with intent | Requests `behaviour/intent_scaling`: a push starts at `min_scale` of the linear command and speeds up while it is kept in one direction; a release or a reversal starts slow again. The **Intent scale** gauge reads `/cartesian_manager/intent_scale`, which the manager publishes only while it is on. The gauge is live only while the backend measures that topic as publishing (`intent_scaling:active`); the moment it stops, the gauge reads **not publishing**, keeps the last number greyed as *last value · not publishing*, and is never a live reading again until the topic speaks. |
| Assist to goals | Requests `behaviour/shared_control`: the manager blends the push with assistance towards the goal it believes the operator aims at. Goals arrive as a `geometry_msgs/msg/PoseArray` on `/shared_control/goals` (each message replaces the set, an empty one clears it). The **Goal confidence** bars read `/shared_control/confidences`, one bar per goal id (`agnostic`, shown as *no goal*, first, then `goal_0`, `goal_1`, ...); a repeated id is numbered, an unreadable value left out, and they say **not publishing** as soon as the backend measures the topic silent (`shared_control:active`) or Assist is off. |
| Reset assist | Requests `behaviour/shared_control/reset`: every confidence is forgotten and Assist stays on (the manager enters shared control on a reset, whatever ran before). |
| Cancel behaviour | Requests `behaviour/passthrough`, ending either. |
| Push start, Speed-up gain | Set `behaviours.intent_scaling.{min_scale, gain}` live, within the bounds the manager validates; the Builder's slider can be pointed at `window_sec` and `consistency_threshold` too. |
| Assist gain, Goal match | Set `behaviours.shared_control.{gamma, goal_match_distance}` live. The server also allows and bounds `alpha_conf`, `theta_l_deg`, `v_j_max`, `r1`, `r2`, `theta1_deg` and `theta2_deg`; an app must add them to its own allowed parameters (both Manager seeds stop at `alpha_conf`, `gamma` and `goal_match_distance`). The manager refuses `r1 == r2` and `theta1_deg <= theta2_deg`, and a slider that asks for one shows the manager's reason. |

A behaviour is offered only when the running manager declares it: Bloom reads `behaviours.intent_scaling.*` and
`behaviours.shared_control.*` from the manager at start, and a control of a behaviour the manager lacks is shown
unavailable with the dashed outline and the reason, in the profile's language. A behaviour on outlives a screen change:
the kiosk bar shows **Speed up on** or **Assist on** on every screen, from the manager's own feedback, until STOP,
Cancel or leaving the app ends it. The 3D robot view can name a goals topic and a soft goal topic: the goals draw as
small named triads, the manager's confidence-weighted soft goal as the larger ringed marker. The manager reads goals in
`base_link` only and ignores any other frame, so the view draws only messages whose header is empty or `base_link` and
counts the rest as ignored. Both disappear when Assist ends or the soft goal stops arriving. The Widget Lab's Robot
screen has both wired. Both feedback topics stream at 100 Hz while Assist is on; the socket forwards at most 30 samples
a second per topic, and the bars and the view redraw only when a value moved, the last sample always included.

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

The README includes a [live Joystick Lab capture](assets/screenshots/11-joystick-lab.png); the walkthrough video is
re-recorded after the 0.3.0 tag. It is simulation evidence without physical hardware acceptance; Kinova follows the
same flow with its own frame allowlist, and `npm run e2e:sim` checks both robots' command paths on the ROS graph.

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

> [!WARNING]
> **Do not run Bloom's gamepad and `joystick_mapper` against the same stick.** That table assumes a standard
> twin-stick pad. The Extender bench uses a three-axis stick, whose `joystick_3d.yaml` `b1` mode reads axis 2 as
> `linear_z` where the table above reads it as `angular.x`, so the same push means different things to the two
> readers.
>
> They also share one channel. `joystick_mapper` publishes to `/joystick_cartesian_command`, the topic Bloom
> teleop uses, and `cartesian_manager` keeps one command per input source and *replaces* it rather than summing,
> so whichever published last wins — a centred physical stick still streams zeros over Bloom's twist at `/joy`
> rate. Summing happens between different sources, not within one.
>
> Before a session, either close Bloom's browser on the machine the stick is plugged into, or stop
> `joystick_mapper`. `ros2 topic info /joystick_cartesian_command --verbose` lists both publishers when both are
> running, and the kiosk bar shows a gamepad chip whenever Bloom can see a pad.

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
| `step` | Joysticks/sliders expose discrete tap targets instead of requiring sustained dragging; held teleop values expire after 15 seconds. |
| `latch` | Compatible controls hold their value until explicit zero/release or the 15-second attention timeout. |
| `scan` | Joysticks and sliders render step targets, and a highlight advances through STOP and then every button on the screen in order; Space, Enter, a tap outside a control, or a tap on the full-width switch bar fires the lit target; a tap outside a control never fires Resume. |
| `dwell` | Legacy combined step-and-dwell preset; existing profiles remain supported. |

Profile bounds are enforced by the model: dead zone `0..0.5`, repeat guard `0..600 ms`, scan period `600..3000 ms`,
and dwell duration `400..4000 ms`. `dwell_enabled` enables pointer dwell alongside any motor preset, including `scan`;
the old `dwell` preset also enables it for compatibility. Dwell asks for a rest: moving more than a few pixels inside a
control starts its timer again, so a pointer crossing a control on the way somewhere else never fires it.
`dwell_ms` controls only the duration and cannot enable the
feature by itself because it has a nonzero default. Dwell never shortens the one-second resume hold. Dwell covers the
whole view, the kiosk bar included, so resting on **⋯** opens maintenance: a dwell cannot satisfy the 1.5 second hold
any more than a switch press can, and resting on it is already deliberate. The maintenance sheet then becomes the
dwell root, as it already does for scanning, so Close, Settings, a screen, a role and the way out all stay reachable
by rest alone.

Latched and stepped return-to-center controls automatically publish zero after 15 seconds without renewed input; the
visible zero control releases them sooner. For the last 5 seconds the control shows **Releases in N s** and a
**Keep going** button that restarts the 15 seconds without moving anything; scanning lights that button next. Once it
lets go, a screen reader hears that the control released. This **Keep going** button is not the Settings push mode of
the same name below, which chooses latching in the first place.

### Runtime Settings

Hold **Maintenance**, then open **Settings** to adjust the current profile without entering Builder. Settings replaces
the robot controls rather than covering them, the bar reads **HELD FOR MAINTENANCE**, and composed teleop stays
suspended.

Settings has three columns:

- **Display**: text size (Normal, Large, Larger), **Colours**, language (EN, ES, FR), and sound on every press.
  Colours offers the six vetted palettes (Bloom Garden, Extender, High visibility, Dark, Colour-blind safe, Pastel) and
  **Same as app** (or **Same as role** when the role has its own). A choice previews on the whole screen, STOP
  included, and is saved for this tablet and role only. Every palette keeps STOP the most prominent control.
- **How you reach the controls**: the input method (Touch, Dwell, Scan) and, as a separate card, **How a push moves**
  (Drag, Tap by tap, Keep going), which maps to the direct, step, and latch presets.
- **Timing**: hold to activate, scan step, ignore repeats, and joystick dead zone. A setting that does not apply to the
  chosen input method is drawn dashed and reads, for example, **only for Scan**. A dead zone of zero reads **each
  control's own**, because each widget then keeps its authored dead zone.

Each card shows the stored profile key (`font_scale`, `dwell_ms`, `deadzone`) for whoever edits a profile; it is
hidden from screen readers, which read the card's label instead.

**Try it** runs a press target with the draft settings and a readout of target size, font scale, and timing. Nothing is
sent. Changes stay a draft until **Save and resume**, which stores them in the browser preference payload under
`profileOverrides[configId:appId:profileId]` and returns to operation. **Discard changes**, or Escape on a keyboard,
leaves without saving. Malformed stored values are ignored.

The command frame is no longer a setting: it changes what the app publishes, so it is chosen on the Joystick Lab frame
row and shown read-only in the bar and the maintenance sheet. A stored per-profile frame override is ignored and
removed.

Settings uses the active scan period and dwell duration itself, so its controls and **Save and resume** stay reachable
under scanning and dwell. **Practice offer** decides whether the bar offers practice when the app opens; the offer
itself, and **Practice** in the maintenance menu, open the guided local-only path without returning through the live
controls first.

The scan set is read from the DOM, so it contains exactly the buttons a screen renders; a pad is never a scan target
because a click on it moves nothing. STOP opens every cycle, ahead of the screen's own controls, on every surface that
draws it: the canvas, Settings, and the maintenance sheet. Under scan, dwelling on the full-width SWITCH bar activates
the highlighted target without a firm press.

Whenever the saved preset is scan, the scanner alone owns Enter and Space: a press goes to the active scanner (a
dialog's first), never to the focused button, and the scanner does not move focus. A camera view never takes focus,
and focus that lands in an embedded frame returns to the workspace, so it cannot swallow the switch. Single-switch and combined scan-plus-dwell teleop are covered by tests but not yet validated with
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

Bloom composes one twist per teleop target: the virtual controls and a physical gamepad that drive the same manager
input add up, and a pad on another input sends its own. A twist carries the session's command frame, except that a
widget which names its own frame is honoured while it is the only one turning; two widgets turning under different
frames fall back to the session frame. The session frame's initial value is:

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
to the served robot's end-effector frame, `effector_frame` on both arms since cartesian_manager d9a1fa5 moved
Explorer off `ft_frame`, to offer it too.
Before that change, an Explorer backend that advertised `effector_frame` had its commands discarded without a word. One
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

The Builder's app cards carry the same status as a badge, with **Update** (take the shipped version) and **Share**
(write the file to commit) next to it; the API serves it at `GET /api/v1/configurations/share-status`, and the
actions are `POST .../{id}/take-shipped` and `POST .../{id}/publish`. A server whose seed directory is read-only
answers 409 to publish and names the CLI command to run on a clone instead. `BLOOM_SEED_DIR` moves the directory.

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

**The 3D robot view** draws the robot the manager runs with: the API serves the `robot_description` parameter of
`robot_state_publisher` (`BLOOM_ROS_ROBOT_DESCRIPTION_NODE`) and the meshes it names, by `package://` or by the absolute
share path xacro writes, resolved through the ament index of the environment the API runs in. `/joint_states` drives the
joints. Without a description the view asks again every three seconds, so Bloom can be open before the simulation
launches; with one it checks every ten seconds and redraws when the description changes, so relaunching with the other
robot needs no reload. It is meant to stand in for rviz while a simulation runs: a `visualization_msgs/msg/MarkerArray`
topic named in the widget draws every marker kind rviz does (arrow, cube, sphere, cylinder, line strip and list, cube and
sphere lists, points, text, a mesh by `package://` through the same API route, triangle list), with per-point colours,
lifetimes, and the delete actions. A marker whose frame names a link or joint of the robot moves with it; any other
frame is drawn at the base, and the status counts it as unplaced. An axes triad sits on the tool link, and `Show every
link frame` adds one on each link the way rviz's TF display does. A `Joint target topic` (`/joint_target_command` by
default, the manager's) draws the target as a translucent blue copy of the robot for as long as the target stands;
the empty joint state the manager sends to cancel takes it away. A `Pose topic` draws a `PoseStamped` as a triad in
the frame it names: `/ee_pose` beside the model's own tool triad shows at a glance whether the manager's frames and
the description agree. The line under the view says how many of the model's joints the joint state drives, so an
arm that publishes fewer joints than its description declares is not drawn silently. Orbit with a drag, zoom with
a pinch or the wheel, double-click or press Frame to frame the robot again. When no joint state has arrived for three
seconds the stage dims and a note says for how long: the robot is drawn where it last was, never as live. While the runtime drives, a blue arrow from the tool shows the commanded linear
motion, full scale at 35 cm, and a blue arc around the tool shows the angular part in the frame the twist names, half a
turn at full scale; both disappear with the last zero twist. It belongs on desktop screens only: the palette refuses it
on a tablet screen, the review checklist says so, and a tablet-class screen that carries one anyway shows the note
instead of a scene, so a tablet or phone never pays for WebGL. It renders on demand, so a still robot costs nothing.
What it does not do: TF frames outside the URDF, interactive markers, and line width, which WebGL draws one pixel wide.

**Bloom Debug** is a desktop app authored at 1920×1080. Its three header cards — Robot preflight, Topic catalog,
Runtime audit — are runtime chrome drawn inside the screen's `debug-status` reserved region, not widgets, so no author
can place or resize them. Below them sit the plot board and picker, a joint table, a Jacobian with its manipulability
row, and the raw topic echo. The joint table and the Jacobian read **not reported** when joint limits or `/ee_jac` are
missing, manipulability is compared against this session's best rather than a guessed threshold, and a value under 0.01
is shown in exponent form rather than rounding to `0.000`. Every list scrolls inside its own card. A second screen, Robot view, carries the 3D robot view with `/ee_pose` as a triad, `/joint_target_command` as a translucent twin and `/goal_markers` as its marker topic, beside an echo of `/ee_pose` and a log of mode requests: the rviz of a simulation run, on the laptop.

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
