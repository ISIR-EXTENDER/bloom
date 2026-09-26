# Operate Safely

This page is for whoever is driving. It covers opening an app as a role, reading the kiosk bar, what to check before
touching a control, STOP and resume, maintenance, and settings.

It is short on purpose. The full behavioral contract, including ownership handover, telemetry, frames and the
supervisor mirror, is in [the operator runtime guide](../operator-runtime.md).

> [!CAUTION]
> Bloom's STOP latches the software command path. It does not replace the robot's hardware emergency stop, the
> controller limits, or your lab's safety procedure. Know where the hardware stop is before you open an app.

## Open the app as a role

**Runtime** opens a library, not the last thing someone was editing. The left column, **Apps on this robot**, lists
what this backend serves; each row shows its screens, the device classes it was authored for, and an **Archived**
badge when it is no longer maintained.

Select an app. The **Open as** rail on the right shows one card per role. The role used last on this device is marked
**last used** and preselected, so **Open as <role>** gets you back to work in one press.

The shipped Manager apps offer three roles:

| Role | Opens | For |
| --- | --- | --- |
| **Operator** | Drive · Operator | Plain words, Slow / Medium / Fast speeds, larger targets. |
| **Bench** | Drive · Bench | Continuous speed limits in a status rail, shaping modes in a context row. |
| **One switch** | Drive · Operator | The same layout under switch scanning. |

Operator and Bench publish byte-identical messages for the same gesture. The difference is what the person in front of
the screen has to read and reach.

To change role mid-session, open Maintenance and hold **Switch role**, which needs its own 1.5 second hold.

## Read the bar before you touch anything

The 44 px bar reads, left to right: app name, screen title, status chip, command frame, publish rate, role, and the
**⋯** maintenance hold.

| Chip | Meaning |
| --- | --- |
| `READY` | Linked, and this session controls the robot. |
| `HELD FOR MAINTENANCE` | Maintenance, Settings or the practice tour is open. Teleop is suspended at zeros. |
| `STOPPED` | The backend STOP latch is engaged. |
| `NOT IN CONTROL` | Another session owns the robot. This screen is inert until you **Take control**. |
| `LINK DOWN` / `CONNECTING` | No backend link, or it was lost. |
| `DEBUG` | Bloom Debug. Every other chip still outranks it. |

The rate reads `N Hz` at rest, `publishing · N Hz` while a control moves, and `zeros held` while held or stopped.

**Before moving a control, confirm four things:** the bar names the app and screen you meant to open, the chip reads
`READY`, the command frame is the one this task needs, and the role is yours.

`READY` describes the link between the browser and the backend. It is not proof that the robot is listening. When that
matters, check the ROS side: Maintenance lists the publish rate and command frame, and Bloom Debug shows the topic
catalog and live telemetry.

Two more things the bar tells you, and they matter:

- **Command failed** means the backend refused, blocked or could not complete the action.
- **Not sent** means the configured gateway simulated it.

In both cases the control keeps its previous state. A toggle that flips is never on its own proof that the robot moved;
Bloom changes a control only after the backend acknowledges it.

A latched or stepped control lets go by itself after 15 seconds without input. For the last 5 seconds it reads
**Releases in N s** and shows a **Keep going** button: press it to keep holding without moving anything.

## STOP and resume

STOP is always live. It sits in the screen's reserved region, which no widget can occupy, and it stays above the
maintenance scrim, Settings and the practice tour — over those last two it becomes a full-height rail on the right.

- A press releases every control on this screen at once and engages the backend latch. Keyboard activation works
  too. If the backend cannot be told, the controls stay held here, the screen shows the error, and **HOLD TO RESUME**
  is the way back.
- The latch is shared by every runtime client, not a local button.
- While stopped, the widgets go muted and inert and the control becomes **HOLD TO RESUME**.
- Resume needs a continuous one-second hold. Leaving or releasing the target cancels it.
- Resume needs control of the robot. STOP does not, so a blocked session can still stop the arm.

Find the cause before you resume. If STOP does not assert, treat that as a failure of the software path and use the
hardware emergency stop.

Releasing a control is also a command. A release sends a zero, and `cartesian_manager` expires any input after 0.2
seconds, so an abandoned control does not keep the arm moving. If the browser disconnects mid-motion the backend
publishes zero for every teleop target it was tracking before it releases the lease.

## Maintenance

Hold **⋯** for 1.5 seconds; on the **Bench** and **Lab** roles a tap is enough, and on those the screen name opens the
same sheet. Motion is held while the sheet is open, under a **Robot held at zeros** badge: a joystick
still held under the sheet does not resume motion when the zero goes out.

The sheet opens on the app's **Screens** (**Drive**, **Positions**, **Robot feedback**, and so on), then six read-only
facts — link, publish rate, command frame, profile and its layout, device class, and the application — and four
actions: **Settings**, **Switch role**, **Reload this app**, **Exit to library**. A **More** group holds the practice
tour, the supervisor mirror, the Builder shortcuts, Help, Home, and the EN/ES/FR selector. Only that group
scrolls, so **Close** and **Resume operating** stay reachable.

Nothing in the sheet changes what the app sends. Resuming closes it and publishing restarts at once.

Screen switching lives in here on purpose: an accidental tap must not be able to replace the controls under a hand.

## Settings

Hold Maintenance, then **Settings**. It replaces the controls rather than covering them, and the bar reads
`HELD FOR MAINTENANCE`.

- **Display** — text size (Normal, Large, Larger), language (EN, ES, FR), sound on every press.
- **How you reach the controls** — input method (Touch, Dwell, Scan), and **How a push moves** (Drag, Tap by tap,
  Keep going). Keep going latches a push: the control holds until you release it.
- **Timing** — hold to activate, scan step, ignore repeats, joystick dead zone. A setting that does not apply to the
  chosen input method is drawn dashed and says so.

**Try it** runs a practice target with the draft settings and sends nothing. Changes stay a draft until **Save and
resume**; **Discard changes** or Escape leaves without saving.

The command frame is not a setting, because it changes what the app publishes. It is chosen on the Joystick Lab frame
row, and only while every motion control is back at zero, so a frame change cannot reinterpret motion already in
progress.

## Practice first

Open Maintenance and choose **Practice tour** under **More**, or accept the **Practice first** offer in the bar on a
first visit. It replaces the live artboard and suspends
teleop; its controls change local state only and reach no robot. Five checks introduce the screen, use the app's own
movement label, rehearse STOP and the held resume, rehearse the Maintenance hold, and return to operation.

Use it with a new operator before the arm is powered.

## When someone else is watching

Open **Supervisor mirror** beside an app in the library, or from Maintenance in a running app, to put the app's status
on a second screen. It shows the application, robot, shared STOP latch, who owns control, and topic readiness, and it
refreshes every two seconds.

It is read-only twice over: its client has no command methods, and a deployment can give that machine an observer key
the server refuses teleop from. A supervisor cannot take the arm. Deliberate handover is a future decision, not a
missing button.

## Before a session

- The bar names the expected app, screen, frame, role and link state, and the sheet the expected profile, device class
  and publish rate.
- `/joystick_cartesian_command` has the publisher and subscriber you expect.
- `/cartesian_command` returns to zero when you release a control.
- STOP latches across a reload and across a second runtime client.
- The tablet, any gamepad, and the accessibility profile the operator will use have been tested together, on the
  device, not only in a browser.

The full command sequence is in
[Extender and Petanque end-to-end validation](../extender-petanque-validation.md).

## Known limits

- Single-switch directional teleoperation and combined scan-plus-dwell pass their tests but have not been validated
  with the intended devices.
- Spanish and French wording, STOP and the resume hold above all, still needs a native speaker's review before
  participant use.
- Saved poses live in the API process and are lost when it restarts. Export them before stopping it.
- A saved pose cannot be replayed from Bloom until the manager restarts with it, because the manager only moves to
  targets it loaded at start.
