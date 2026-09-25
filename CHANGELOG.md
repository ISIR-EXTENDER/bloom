# Changelog

All notable changes to Bloom are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
Bloom aims at [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While
the version stays `0.x`, breaking changes may land in a minor release, and each
one is called out under **Changed** with its migration note.

Detailed rationale for architectural choices lives in [docs/decisions](docs/decisions).

## [Unreleased]

### Breaking

- **The `reduced-motion` motor preset is gone.** It was accepted and changed nothing; a profile that still carries it
  is refused at import. Nothing on the operating surface animates and the browser's `prefers-reduced-motion` covers
  the chrome that does.

### Added

- **The launcher starts the gripper camera.** `scripts/extender-workspace-dev.sh` now brings up the robot's camera
  through `camera_interface` (input_interfaces#35) on `/camera/color/image_raw/compressed`, picked from
  `BLOOM_ROBOT_NAME`: the Explorer's USB camera or the first webcam, or the Kinova's integrated camera. Nothing to run
  in another terminal, and Ctrl-C stops it with the rest. `BLOOM_CAMERA` overrides the choice.

- **The Builder says whether an app is shared.** Each app card carries **Shared**, **Update available**, **Edited
  here** or **Not shared**, with **Update** to take the shipped version and **Share** to write the file to commit,
  the way `config status`, `config seed` and `config publish` do on the CLI. Three API routes back it:
  `GET /configurations/share-status`, `POST /configurations/{id}/take-shipped` and
  `POST /configurations/{id}/publish`. `BLOOM_SEED_DIR` names the shared applications directory.

- **A screen can be made for a tablet or a desktop, and switched later.** Creating a screen asks what it is made
  for, the screen builder has **Switch to desktop** / **Switch to tablet** next to the device reading, and the
  palette offers the switch when a widget is Desktop only. Widgets scale together so the layout holds; STOP never
  ends smaller than the new canvas's own and a switch that would put it over a control is refused.

- **The widget palette has a search box.** It matches a widget's name, kind, description and category, ignoring
  case and accents; "3d" finds the robot view and "stop" finds STOP.
- **Keyboard and gamepad are no longer a secret.** Settings has a "Keyboard and gamepad" card that says how to drive
  without touch and whether a pad is connected, and the kiosk bar shows a **Gamepad** chip while one is.

- **Bench and Lab open the menu with a tap.** A role option, `menu_on_tap` ("A tap opens the menu" in the Builder),
  lets a role that does not drive open maintenance from a tap on "⋯" or on the screen title, which then reads as a
  button to the screen list. Opening it still holds the robot at zeros and switching role keeps its hold. The
  shipped Bench and Lab roles use it; Operator and One switch keep the 1.5 s hold.

- **The runtime teaches its own hidden gestures.** A tap on "⋯" that is too short now says to keep holding, the
  maintenance sheet lists the app's screens first under a **Screens** heading, and the 3D view says "Drag to turn ·
  wheel to zoom" until the first drag on that device.

- **A new six-minute walkthrough video**, recorded against the Explorer simulation: a screen built and a control
  configured with no code, the three roles, driving, STOP, the live plots, and the arm moving in the 3D view.

- **The 3D robot view stands in for rviz while a simulation runs.** It draws every marker kind rviz does:
  arrow, cube, sphere, cylinder, line strip and list, cube and sphere lists, points, text, a mesh by
  `package://` through the API, and triangle lists, with per-point colours, lifetimes, and the delete
  actions. A marker frame that names a link or joint of the robot attaches there; any other frame draws at
  the base and the view counts it as unplaced. A `Show every link frame` setting puts a triad on each link,
  the way rviz's TF display does. Double-click refits the camera.
- **The view keeps asking for the robot.** Without a description it retries every three seconds, so Bloom
  can be open before the simulation launches; with one, it follows a new description within ten seconds,
  so relaunching with the other robot redraws it. A lost WebGL context comes back on its own.
- **The 3D robot view draws the commanded motion**: a blue arrow from the tool along the linear part of the
  twist the runtime is sending, and an arc around the axis of the angular part in the frame the twist
  names, gone with the last zero. The simulation run watches the arrow appear while Height is held.
- **The 3D robot view shows targets and poses.** A `Joint target topic` (the manager's
  `/joint_target_command` by default) draws the target as a translucent copy of the robot until the empty
  joint state cancels it; a `Pose topic` draws a `PoseStamped` as a triad in its frame, so `/ee_pose` beside
  the model's tool shows whether the manager's frames agree with the description. A Frame button and the
  line under the view, which says how many of the model's joints the joint state drives.
- **The runtime socket forwards at most 30 samples a second per topic** (`BLOOM_RUNTIME_TOPIC_MAX_RATE_HZ`,
  0 for every sample): the newest each interval, and a stream that stops still ends on its last value. The
  Kinova simulation publishes `/joint_states` at 200 Hz, which was 200 JSON frames a second to every viewer.
- **A sample reaches only the widgets that read its topic.** Every sample used to walk every widget on the
  screen and re-resolve each one's topic from its settings; the screen now carries an index built once.
- **One shared, memoized renderer registry.** Rendering a widget built a fresh registry of every widget kind,
  so a twenty-widget screen built twenty registries per frame. There is one now, its renderers are memoized,
  and the descriptors, the conditioning and the action handler are stable, so a sample re-renders the widget
  it feeds instead of the whole screen.
- **The runtime applies a frame's samples in one state update.** Every sample used to re-render the whole
  runtime; now what arrived within about 16 ms lands together, newest last, and a hidden tab keeps only the
  newest six hundred. Measured on the Widget Lab Robot screen: 28% to 23% of a core.
- The Frame button of the 3D view sits beside the stage rather than inside its image role, where assistive
  technology could not reach it.
- **The 3D view says when joint states stop.** After three seconds without one the stage dims and a note says
  for how long; the robot is drawn where it last was, never as live. The camera fit now frames the robot from its
  projected extents instead of its bounding sphere, so the arm fills the view.
- **The robot description answers 304** to an unchanged robot, and meshes carry a five-minute cache header, so
  the view's ten-second poll costs a hash and a reload does not fetch every mesh again.
- **Bloom Debug has a Robot view screen**: the 3D robot view with `/ee_pose`, `/joint_target_command` and
  `/goal_markers`, an echo of `/ee_pose` and a log of mode requests, so the laptop needs no rviz beside Bloom.
- The Widget Lab probe publishes one marker of each kind, and a joint target four seconds on and four off; the
  simulation checks require the tool label on the robot's last link, the mesh marker to arrive, draw and
  expire, `/ee_pose` drawn, and the target drawn then gone.

### Fixed

- **The launcher maps the tablet's touch whenever it is plugged in.** The mapping used to run once at login, so a
  tablet plugged in later, or remapped by GNOME, had to be fixed by hand. `BLOOM_APPLY_TABLET_TOUCH_MAP` now defaults
  to `auto`, a failed mapping never stops Bloom, and the documented default keeps the tablet's own display mode
  rather than forcing the 1820x720 logical scale. `--install-autostart` works with the tablet unplugged.
- **The tablet touch helper survives Ubuntu 24.04.** `scripts/extender-tablet-touch-map.sh` finds the touchscreen by
  its USB id and maps every direct-touch device it exposes by id, instead of one name xinput may share between two
  devices. `--diagnose` prints what the session, screens and touch devices look like, read-only, and `--gnome` tells
  GNOME which monitor the touchscreen belongs to so a display change does not undo the mapping.

- **The Explorer camera test app drives the Explorer's way.** Its Translation pad carried the identity mapping, so
  Forward moved the hand along +y; it now uses the Explorer's axes, as Explorer Manager does. A horizontal Height
  slider read "Left" and "Right"; a slider on the height axis now reads Down and Up however it is laid out.

- **A widget placed from the palette arrives working.** Placement read the contract's defaults and ignored the
  catalog's, so the gripper toggle and every other preset never reached a screen. Each palette widget now
  arrives wired to the manager contract both arms share, as the shipped apps use it: the joystick is this arm's
  Translation pad (Forward, Back, Left, Right, with the Explorer's swapped axes), the toggle its gripper, the
  slider qontrol's speed limit, the command button the Neutral mode, and the gauge, plots, echo, event log,
  plot board and value strip read the hand's pose or the mode requests. A series picker placed beside a plot
  board drives it. Only the gesture pad, a game's input, still asks for its topic.
- **The gripper toggle closed on "Open gripper".** Off, the button reads "Close gripper" and the press turns it
  on; the placed toggle sent the open value for that press. It now closes, as the Manager apps do.
- **The starters work on the robot.** "Operator controls" drove a slider on `/cmd/max_velocity`, which nothing
  reads, and "Debug monitor" echoed `/teleop_cmd`, the retired stack's topic. They now use the speed limit and
  the hand's pose, and the operator starter adds this arm's pad and gripper.
- **A crowded screen no longer hides a control silently.** A widget that finds no free space tries its kind's
  minimum size first; placed on top of another anyway, the Builder says which, and the review checklist gains
  "No widget sits on another".

- **A joystick may drive any input the manager declares, with nothing to configure.** The API reads the input
  topics from cartesian_manager's own parameters, live, instead of a fixed list, so the visual servoing input or a
  renamed joystick input works as soon as the manager has it. `BLOOM_ALLOWED_TELEOP_TARGETS` now only adds topics
  beyond the manager's. STOP zeroes every input the manager declares. A topic nothing listens on is still refused,
  and the Builder and runtime now say so by naming the manager's inputs instead of pointing at a variable.
- **A joystick on a topic the server refuses now says so before it is pressed.** An app could list a teleop topic
  that the server's `BLOOM_ALLOWED_TELEOP_TARGETS` did not, the Builder offered it, and the first press answered
  "Command failed". The capabilities response now carries the server's list; the Builder warns in the joystick's
  inspector and under the app's teleop targets; and the runtime marks such a joystick unavailable, with the reason
  and what to change, from the list the server acknowledged for the app.
- **STOP can be dragged on the Builder canvas.** Every reserved region let the pointer through, the movable STOP
  one included, so the palette's "drag it on the canvas" could only be done with arrow keys. It now follows the
  pointer and saves the move once, on release, as a single undo step.

- **The one-switch pads printed their readout as `x 0.00y 0.00`**, and a screen reader heard it run together too.
  The two values now read, and are spoken, apart.
- The runtime library still said "Choosing is deliberate" after roles gained a default; it now says the app opens in
  the role last used on the device, in all three languages.

- **A robot that is not running reads as unavailable, not as a server error.** With the ROS adapters attached
  and no robot launched, the robot-model route raised because `/robot_state_publisher` offers no parameter
  services, so the 3D view's poll filled the API log with 500s every three seconds. It reports the state the
  view is waiting for instead.
- **The launcher finds the ROS workspace whether Bloom sits beside it or inside its `src/`.** It assumed a
  sibling, which is only one of the two layouts in use, and failed on the other before it started anything.

- **A pull that adds a dependency no longer breaks the launcher.** `scripts/extender-workspace-dev.sh` installs
  when `package-lock.json` is newer than the last install, so a stale `node_modules` cannot surface as Vite
  failing to resolve an import. Robin lost a bench morning to exactly that, with `three`.

- **A widget that watches a command could swallow it.** The dispatcher called its listeners inside the send
  path without a guard, so a listener that threw would have stopped the twist reaching the arm. The arm comes
  first: a broken observer now loses its drawing, never the command.
- A cylinder marker stood along y instead of z: the marker's pose overwrote the rotation that stood it up.
- Arrow markers were sized by invented proportions; they now follow rviz (shaft and head diameters from
  `scale`, a 23% head unless `scale.z` says otherwise).
- Every twist and every marker array rebuilt three.js objects without freeing the old ones: twenty twists
  a second leaked a material each. The arrow is now one object moved on each twist, markers whose shape did
  not change are moved rather than rebuilt, and what is removed is disposed.
- A marker with alpha zero drew opaque; as in rviz, it is now invisible. A marker that gives a colour per
  point is drawn whatever its own colour says, because per-point colours override it, alpha included: a
  coloured trajectory published without a marker colour used to be invisible twice over, hidden and then
  fully transparent.
- The 3D view's inspector no longer offers a model source or a model URL. Both were inert, since the view
  draws the robot the API serves; a screen that still carries them is accepted and they are ignored.
- The mesh cache fetches a file the URDF names several times once, and an absolute mesh path under a
  workspace that itself lives in a directory called `share` resolves to the right package.

### Changed

- **The runtime library always offers a role**, so an app is one press from opening: the role this device
  opened last, then Operator, then whatever the app lists first. Pressing another role opens as that one and
  is what the device remembers next time. The disabled "Choose a role to open" state is gone.

- **The 3D robot view is desktop-only.** A widget kind can name the device classes it runs on; the palette
  refuses the view on a tablet screen, the review checklist reports one that slipped in, and a tablet-class
  screen shows a note instead of a scene. The view renders on demand rather than every frame.

## [0.3.0] - 2026-09-24

Validation status, stated plainly: every behaviour below is proven against the Explorer Gazebo simulation
and the Kinova mock hardware (`npm run e2e:sim`, 26 and 25 checks), and the Builder harness proves what Bloom
accepts and stores without ROS. The only hardware evidence is still Robin's bench session of 2026-09-21 on the
Explorer. The Pivot sign and the six Drive directions are verified from the slider to the simulated arm, not on
an arm; the Explorer's mapping is the one that was driven on the arm with `extender_ui`, the Kinova's has never
been; the Kinova has no Go home while `cartesian_manager#10` is open.

### Added

- **The 3D robot view draws the running robot.** The API serves the manager's `robot_description` and the
  meshes it names (`GET /api/v1/ros/robot-model`, `/assets/<package>/<path>`), the widget renders it with
  three.js, drives it from `/joint_states`, and draws a `MarkerArray` topic the way rviz does: targets,
  directions and paths without leaving Bloom. `BLOOM_ROS_ROBOT_DESCRIPTION_NODE` names the node that holds
  the description.
- **Widget Lab**, a shipped app that places every kind the palette offers, bound to the simulation's topics;
  `npm run e2e:sim` presses or reads each one on both robots.
- **Any card can hide its title**, and the Builder's axis editor names the topic a pad or slider publishes to.
- **The simulation run holds every Drive word** (Forward, Right, Up, Tilt up, Roll right, Turn left) and checks
  the simulated hand moves along that base axis, names the Explorer's two known deviations, and proves that a
  toggle and a hold button configured entirely from the Builder's inspector put their payloads on the manager's
  topic. `qa:review` and the Builder harness run in CI.
- **`GET /api/v1/ros/robot-model`** and its `/assets` route, observer-readable, refused outside the package share
  and past the mesh suffixes.

### Changed

- **The Explorer's joysticks drive the axes the arm was driven on.** Forward is base −x, Right base +y, Tilt up
  `angular.x`, Roll right `angular.y`, the profile saved from `extender_ui`'s Sandbox teleop config and driven on
  the arm. Breaking for an operator used to the 0.2.0 seed, where Forward moved base +y. A shipped copy that was
  never edited is replaced on the next API start; an edited copy keeps its mapping, and the Builder's axis editor
  shows what each stick moves.
- Widgets, settings, the runtime dispatcher, the runtime routes and the dashboard's App are split into modules
  with the same names and behaviour; the shared helpers (`clamp`, layout snapping, error wording, the WebSocket
  URL, unique ids) each exist once.

### Fixed

Found by an audit of the seams the test suites do not reach: concurrency and
lifecycle in the backend, malformed input in the widget layer, and the state
machines behind assistive input. Each fix carries the test that reproduces it.

**Motion and safety**

- **The Explorer's joysticks drive the axes the arm was driven on.** The seed carried
  `extender_ui`'s unconfigured mapping; the profile validated on the Explorer swaps X and
  Y and inverts linear X, so Forward now commands base −x and Right base +y, Tilt up
  `angular.x` and Roll right `angular.y`. The simulation run holds each word of every Drive
  control and checks the hand moves along that base axis.
- **A refused teleop command no longer rides on the ones that follow.** The
  composed twist was built before the command was judged, so a stick bound to a
  target the deployment forbids left its last push in the sum. The operator let
  go of a control that appeared inert, and the next command from an allowed
  stick carried an axis nobody was touching.
- **The dead zone is measured against what the pad can express.** The pointer
  area is square, so a corner press reaches magnitude 1.41 while the pad means
  1. A pad authored at the contract's own maximum drew a dead zone over the
  whole ring and still published full scale from any corner.
- **A disconnect zeros a moving target whether or not the session held the
  control lease.** Neutralization was gated on the ownership feature rather than
  on whether the session was commanding.
- **A non-finite axis clamps to zero.** `max(-1.0, min(1.0, nan))` is 1.0, so
  the clamp that bounds an axis would have turned a NaN into full scale.

**Assistive input**

- **The scan highlight leaves a control that leaves the scan set.** A command
  button disables itself while its command is in flight, and kept the highlight:
  two controls lit at once, and the switch fired the one the operator was not
  looking at.
- **A scanned control is re-checked at the press**, as the dwell path already
  does, rather than trusting what the last cycle admitted.
- **A gamepad resting at a suspend drives on its very next push.** Every
  external source was asked for a neutral it did not owe, so the push after any
  STOP, settings close or screen switch was discarded whole.

**What the screen claims**

- **An authored value is no longer drawn as a reading.** Gauges and plots fall
  back to authored numbers, and three gauges with no topic at all read as the
  robot's battery, task progress and confidence to a participant. The
  placeholder stays for the builder, dimmed and under "no source".
- **A pose cannot be captured from a stream that stopped.** Capture promises the
  robot's current pose and was enabled on a snapshot of any age. The joint table
  marks a stale stream rather than passing a frozen pose off as the arm's
  present one.
- **An out-of-range sample is railed at the edge of the plot** instead of drawn
  outside the viewBox and clipped away, which hid exactly the excursion an
  operator needs to see.
- **The echo shows its age once the sample is old enough to mislead.** Every
  TwistStamped carries a frame, so the frame alone had the row and a command
  sent ten minutes ago read like the one just sent.
- **An armed button with no timeout says it stays armed**, rather than promising
  a countdown it does not run.
- **The builder's settings editor measures the target it claims to check**,
  instead of the card around it, which could never fail for a widget that met
  its minimum size.

**Holding together under load and error**

- **A socket's ROS subscriptions are closed even when the lease moved on.** The
  handover raises `ValueError` when another operator has already claimed, which
  aborted the rest of the teardown and leaked every subscription for the life of
  the process.
- **A bulk topic cannot stall the telemetry executor.** Converting one 480p
  image costs about three quarters of a second on the single thread every
  subscription shares, so a camera topic on the telemetry path stopped
  `/ee_pose` and `/joint_states` updating while the arm was still moving.
- **A malformed frame is answered rather than ending the session**, using the
  reply already written for it.
- **One widget's failure stays inside that widget.** The only boundary was the
  view, so a renderer that threw replaced the whole operating surface, STOP
  included.
- **A plot survives its own sample count**, folding rather than spreading the
  array into `Math.min`.
- **A slider keeps a usable span** when authored with equal or reversed bounds.

**The perimeter, and the role that is meant to be powerless**

- **A request body is capped before anything reads it.** Starlette buffers the body and FastAPI checks
  the API key afterwards, so an unauthenticated caller chose how much this backend allocated: one
  300 MB request took resident memory from 47 MB to 345 MB and was then answered 401.
- **A read-only key cannot crowd the operator off the robot.** Sessions were handed out against one
  cap, so enough mirrors took every slot and the operator was refused the socket they need to claim
  control or to resume after a STOP. The arm could still be stopped and no longer recovered.
- **A read-only key cannot erase the audit trail.** Every refused command was recorded before any
  rate limiter, and the log keeps 500 entries, so alternating two sockets pushed the operator's own
  records out in about a second. A refusal the perimeter already guarantees is no longer recorded.
- **A non-ASCII API key is refused rather than raising**, which was a 500 on every guarded route and,
  on the websocket, an exception the close-with-a-reason path never sees.
- **A refused publish remembers a bounded summary.** One request with twenty thousand keys left a
  record carrying most of a megabyte of client text, kept for the process lifetime.
- **A camera frame has to be the format it claims**, rather than passing the sender's MIME label on to
  ROS consumers as a fact about the bytes.

**Authoring**

- **An edit made while a save is in flight survives it.** The draft reset whenever the configuration
  store replaced its object, which is what a resolved save looks like, so the work was overwritten by
  the server's echo of the screen before it -- and the history went too, so it could not be undone.
- **A cancelled drag stops following the pointer.** Only pointerup tore the listeners down, so the
  pointercancel a tablet sends when it claims the gesture for a scroll left the widget moving under a
  pointer nobody was holding.
- **A half-typed object no longer overwrites the object it replaces.** Committed per keystroke, a
  fragment like `{"a": ` became the value, which the backend accepts and the runtime then publishes.
- **A profile keeps pointing at a screen the app has.** Deleting a screen left profiles naming it, and
  a profile that names nothing falls back to the first screen -- on the Manager apps, the bench
  layout. An operator silently opened another role's screen.
- **A resize is refused past the artboard on the canvas**, which the inspector already refused.

**Storage and configuration**

- **A failed `config publish` no longer discards the operator's work.** The
  store copy was stamped as matching the shipped file before that file was
  written, so a publish that could not write left the copy claiming to be
  unedited, and the next API start replaced it.
- **Every rosbag recording gets its own id.** Two starts in the same second
  under one label collided, and the first `ros2 bag record` process became
  untrackable and could never be stopped.
- **An already-migrated store is confirmed with a read.** Theme-asset requests
  re-ran the migration routine, which takes an exclusive write transaction, so
  an upload blocked behind any other writer for the full busy timeout.
- **A theme asset is tracked per configuration**, not per image, so the same
  picture in two apps no longer leaves one file unaccounted for.
- **An id the store refuses reads as missing** rather than as a server fault, and a bundle this build
  cannot reconstruct says which configuration and why instead of answering 500.

**From Robin's bench session, 2026-09-21** (recorded in
[the validation record](docs/validation/2026-09-21-robin-bench.md))

- **An app authored in the Builder can drive the robot.** A new app declared no teleop target, and an
  app that declares none drives nothing -- right for Bloom Debug, wrong for a screen someone has just
  built. Everything on the publish path worked and everything on the teleop path was refused. The
  default is now the manager's own command topic, and an explicitly empty list still means none.
- **Both ends agree on what an empty teleop list means.** The frontend read it as "no restriction" and
  the backend as "none", so a screen dispatched a command the server refused and the operator met
  "Command failed" from a control that should never have been live.
- **A screen is judged at the panel its own class runs on.** The glass check fitted every screen to
  1024x600 and held it to the touch floor whatever its class, so a desktop screen was scaled to a panel
  it will never run on and reported every control below the floor with nothing an author could do.
- **The Builder says the runtime draws STOP.** There is none to place and nothing said so.
- **A toggle's payloads follow its message type.** They are ROS text and each type wants a different
  shape; the helper that returns the right pair had existed unused since the widget was written.
- **Command sources no longer calls the command topic "This tablet".** It carries every publisher on
  it, and ROS gives a subscriber no way to tell them apart.

### Changed

- Reduced motion is honored where Bloom actually animates. The runtime switched
  off transitions on two controls that declare none, while the skip link and two
  builder surfaces ignored the preference entirely.
- Six words the Robot feedback and Command sources screens show are translated;
  they reached a Spanish or French operator in English. A test now walks every
  display string the operator apps ship.
- One table defines what a target promises the hand, beside the function that
  says what a widget delivers. The preset table and the touch floor each had
  several copies.
- The builder reports a screen's device class instead of drawing two buttons
  that never did anything.

## [0.2.0] - 2026-09-18

### Added

- **`npm run visual:sweep`** opens every screen of every shipped app, as every role, at the maintained viewports of
  its device class, and checks the artboard bounds, overlapping cards, clipped text, the STOP region and the target
  each control leaves on the glass. `npm run visual:smoke` runs it after the screenshot pass.
- **`npm run e2e:sim -- --robot explorer|kinova`** drives Bloom against the Explorer Gazebo simulation or Kinova fake
  hardware, with no mocks, and checks each effect on the ROS graph: motion, release to zero, Bench and Operator parity,
  gripper values, speed limits, STOP, the maintenance hold, the frame stamp, Go home and Release, and live samples in
  Robot feedback and Bloom Debug. See [the simulation run](docs/validation/ros-sim-e2e.md).
- **A five-minute walkthrough** (`docs/assets/demo/bloom-demo.mp4`) recorded against the Explorer simulation with a
  visible cursor, reproducible with `npm run record:demo`.
- **`unsubscribe_topic`** on the runtime socket (decision 0134): a screen change releases the topics the new screen does
  not show, and one subscription per topic serves every screen.
- A **NOT IN CONTROL** status chip while another session owns the robot, and a **Discard changes** action in Settings.
- The plot board's y range widens to fit its data (`y_fit_data`, on by default), and value strip and picker readings
  dim as stale after 3 s without a sample.

- **The 2026-09-17 design handoff** (tracked in `docs/design/`, plan in `docs/design/implementation-plan.md`):
  - Widget cards follow the design anatomy: control surfaces, info cards, bare grouped buttons, and action cards.
    Pads share one geometry recipe, speed limits can render as **Slow / Medium / Fast** segments, and command buttons
    take an optional `hint`.
  - A widget minimum-size contract (decision 0132). An undersized card grows rather than clips, and streams (echo,
    event log, position library) scroll inside their authored height.
  - **Reserved regions** on screens: rectangles the runtime owns, such as `stop` and `debug-status`, which no widget
    may overlap.
  - Widget kinds `plot-board`, `plot-picker`, and `value-strip` for multi-series telemetry, with one subscription per
    topic, per-profile picker selections, and a Command sources verdict of who is driving.
  - Widget kinds `joint-table` and `jacobian`. They read "not reported" when joint limits or the Jacobian are missing,
    and manipulability compares against this session's best rather than a guessed threshold.
  - Profiles name the screen a role opens on with `preferred_control_layout_id` (decision 0133). Roles switch through
    the maintenance sheet with their own 1.5 second hold.
  - A kiosk bar with screen title, status chip, frame, publish rate, and role pill, and a maintenance sheet with
    read-only facts and grouped actions.
  - A list runtime library with a role rail, derived device badges, and the supervisor mirror as a secondary action.
  - Bloom Debug on a 1920×1080 desktop panel with status cards, a plot board and picker, the joint table, the Jacobian,
    the raw echo, and the Kinova fault state.
  - Builder: panel-true canvas, drawn reserved regions, **Too small** tags, a `W×H · N px glass` chip measured at the
    class's smallest panel, a one-tap **Resize to W×H**, and review checks for minimum size, sibling symmetry, pad
    pairs, and profile coverage.
  - A new landing page, and operator widget words (speeds, shaping modes, turns, gripper verbs, directions) shown in
    Spanish and French from a glossary. ES STOP reads **PARADA**. Both still need a native speaker's review.

- **Bloom as the active Extender IHM.** `extender_ui` is now documented as legacy reference/rollback software; open
  design and live-acceptance work is tracked in the UX handoff rather than an indefinite migration percentage.
- **Kiosk runtime shell** with a 44 px operating bar, truthful app/robot/link/frame/profile context, a 1.5 second hold
  before maintenance actions, and screen switching outside the primary operating surface.
- **Backend-latched runtime STOP** with immediate stop activation, cross-client state, and a one-second hold to resume.
- **Accessible input paths** for keyboard joysticks, step controls, latch, switch-scanning focus, dwell activation,
  browser gamepads, profile-level dead zone/repeat guard, large targets, and optional audio state cues. Browser
  `prefers-reduced-motion` is honored; the profile enum is not yet an independent motion switch.
- **Operator-owned runtime settings and language** with persistent per-profile overrides, local-only movement preview,
  scanning/dwell support, and complete English, Spanish, and French runtime-shell catalogs.
- **Action-based guided review** with a structurally local-only five-step runtime practice path and a six-check Builder
  review derived from saved app geometry, touch bounds, frame, topic policy, profile preview, and JSON export.
- **Read-only supervisor mirror** with stable per-app routes, live robot/frame/STOP/topic status, explicit operator
  ownership, and a runtime client projection that exposes no movement, STOP, resume, publish, or action methods.
- **Same-Wi-Fi development access** with a wildcard frontend bind, a printed LAN URL, an API-port-aware Vite proxy, and
  documented shared-SQLite, firewall, concurrency, and trusted-network constraints.
- **Explorer tutorial media** with a live Joystick Lab screenshot and a reproducible 1:55 ROS-bench walkthrough through
  Drive, Joystick Lab, feedback, command sources, and Bloom Debug.
- **One Cartesian command frame per application**, selected from backend capabilities, shown in the kiosk bar, applied
  to virtual controls and gamepads, persisted through JSON/SQLite, and checked against the deployment allowlist.
- **Kinova Manager app** alongside Explorer Manager, including manager drive, saved positions, feedback, command-source
  visibility, gripper controls, and Trigger-style fault reset.
- **Application lifecycle** (`active` / `archived`). Petanque is archived: kept
  and runnable, but not maintained against the current architecture and not a
  release gate. See decision 0121.
- **`npm run qa:review`**, a sweep for gaps the test suites cannot see: dead
  exports, ungated fixtures, duplicated storage keys, misplaced shebangs, and
  committed build caches.
- **Saved position library** with export of the `joint_targets` block for
  `cartesian_manager`, since Bloom cannot register a target on the manager at
  runtime.
- **Camera frames published to ROS** as `sensor_msgs/msg/CompressedImage`, with
  size, format and allowlist checks, rate limiting, and audit.
- **Gripper and digital-output semantics** matching `tablet_interface`, so a
  calibration lives in one place instead of in every screen.
- **Manipulability** from `/ee_jac`, which was published and entirely unused.
- **Per-axis teleop composition**: a full 6-DoF twist assembled from several
  widgets, matching `joystick_mapper` including its per-axis scaled dead zone,
  and local B1/B2 axis map swapping.
- **Plot freeze**, so a transient can be read instead of scrolling away.
- **`npm run check:version`**, because three files carried the version
  independently with nothing enforcing that they agree.
- **Explorer Manager app**, with screens following the manager's own branches:
  Drive, Positions, Robot feedback, and Command sources.
- `confirm_press` on command buttons: armed first press, dispatching second
  press, and a timeout that disarms. Defaults to off.
- `scripts/capture_joint_target.py` in `extender_workspace`, which captures a
  named pose from the live robot and emits a valid `joint_targets` block.
- `RclpyCartesianManagerGateway`, publishing `geometry_msgs/TwistStamped`
  Cartesian commands for the `cartesian_manager` control stack.
- `BLOOM_ROS_COMMAND_BACKEND` (`cartesian_manager` by default, `teleop_command`
  for the legacy path) and `BLOOM_ROS_COMMAND_FRAME_ID`.
- Mode-request validation against the `cartesian_manager` grammar, applied at the
  single publish choke point and reported as HTTP 422 with a readable message.
- This changelog, and a release checklist in
  [docs/release-checklist.md](docs/release-checklist.md).
- **Observer role.** `BLOOM_OBSERVER_API_KEY` authenticates a supervisor that may read apps, runtime state, the STOP
  latch, the audit log, saved positions and the topic catalog, and watch the runtime socket, but never claim control
  or send teleop.
- **Dashboard API key.** `VITE_BLOOM_API_KEY` is sent as `X-Bloom-API-Key` on HTTP calls and offered to the runtime
  socket as a `bloom.api-key.<key>` subprotocol, so the dashboard reaches an authenticated backend.
- **`npm run verify`** runs what CI runs, in CI's order. **`npm run check:contracts`** runs the version check and every
  app contract validation, in CI and in `verify`.
- `bloom config status` reports `outdated` for an unedited copy behind the shipped version and `deleted` for a shipped
  app removed on purpose.

### Changed

- A control lease now holds only while its session is still talking (decision 0135). An owner silent for 10 s can be
  displaced by another operator's **Take control**, so a tablet that lost Wi-Fi with its socket still open no longer
  blocks every other operator and every resume. Runtime tabs ping every 3 s, so an idle operator is never displaced.
- **Breaking for API clients.** The runtime socket keys topic subscriptions by widget id and topic, and a frontend with
  this release sends `unsubscribe_topic`, which an older API refuses. Deploy the API and dashboard together.
- STOP stays live over Settings and the practice tour, drawn as a full-height rail those views keep clear.
- Reloading a runtime app returns to the same app and screen instead of the first app of the first configuration.
- Plot samples are timed by the browser that received them, so a tablet clock ahead of the robot PC no longer empties
  the plot or the Command sources verdict, which now reads the whole twist rather than one field.
- The builder snaps a refused drag or resize back to where it started, refuses a resize, duplicate or new widget that
  would reach a reserved region, adds palette widgets at their kind's minimum, starts new tablet screens on the
  1280×720 panel, and floors glass sizes so a target under 44 px fails.
- The remaining shipped operator vocabulary, screen titles and role names follow the profile's language, frames a robot
  never offers are drawn as unsupported, and speed readouts drop a trailing zero.

- **Breaking for app authors.** The Manager apps' `manager_drive` screen is split into `manager_drive_bench` and
  `manager_drive_operator`. Both send identical messages for the same gesture; the profile picks which one opens.
- **Breaking for app authors.** Toggle `onLabel`/`offLabel` are verbs for what the button will do (**Close gripper**),
  and the commanded state moved to `onStateLabel`/`offStateLabel` in the card header.
- **Breaking for API clients.** Widget kinds `plot-board`, `plot-picker`, `value-strip`, `joint-table`, and `jacobian`
  exist, and screens carry `reserved_regions`. The backend refuses a widget overlapping a region. The SQLite store
  migrates to schema version 7 and backfills regions from each stored bundle.
- **Breaking for operators.** The runtime library has no **Auto** profile. A remembered role is preselected but never
  opens by itself, and a stored `Auto` reads as no role remembered.
- **Breaking for operators.** The command frame left Runtime Settings and per-profile overrides; a stored frame
  override is ignored and removed. Choose the frame on the Joystick Lab frame row.
- Runtime Settings keeps a draft until **Save and resume**; Escape discards it. Text size is editable, and step and
  latch appear as **How a push moves** beside the input method.
- The horizontal Pivot slider publishes with `scale: -1`, so its left end turns the hand left (`+angular.z`). This is
  verified on the ROS wire, not yet on hardware.
- Kinova speed segments are 0.025 / 0.05 / 0.10 m/s, inside the gen3's 0.1 m/s; Explorer keeps 0.08 / 0.15 / 0.30.
- STOP draws in the screen's `stop` region and stays above the maintenance scrim; the sheet is inset clear of it.
- A full-panel screen scales its 1280×676 body with the bar, so widgets render at 1.0 on a 1280×720 panel.
- The kiosk bar no longer shows the robot name; the supervisor mirror still does.

- **Breaking for ROS deployments.** The default teleop target moved from
  `/teleop_cmd` to `/joystick_cartesian_command`. `/teleop_cmd` remains
  allowlisted, so an existing deployment can pin the old behaviour with
  `BLOOM_ROS_COMMAND_BACKEND=teleop_command`.
- Mode requests are published in canonical form. `GEOMETRIC/Snake` now reaches
  ROS as `geometric/snake`.
- Runtime operation no longer exposes product navigation or editing shortcuts directly. Those actions now require the
  maintenance hold.
- Sandbox V0.0 and Explorer user-test configurations target the manager
  contract. Petanque deliberately stays on `/teleop_cmd`.
- Robot feedback topics moved from `/sandbox_controller/*` to `/ee_pose`,
  `/ee_velocity` and `/joint_states`.
- Documentation now describes the Ubuntu 24.04 and ROS 2 Jazzy baseline.
- **Breaking for development machines.** Node.js 24.15.0 or later is required, pinned in `.nvmrc`. `npm run verify`
  refuses an older Node; the Extender launcher only warns. The README gives the upgrade commands.
- **Breaking for ROS deployments.** The command frame allowlist defaults to `base_link` and `hybrid_frame`, the frames
  every `cartesian_manager` config has. Set `BLOOM_ROS_EE_FRAME_ID` to the robot's tool frame (`ft_frame` on Explorer,
  `effector_frame` on the Kinova gen3) to offer it again, or set `BLOOM_ALLOWED_COMMAND_FRAME_IDS` explicitly.
- **Breaking for API clients.** Runtime control ownership is on by default (`BLOOM_RUNTIME_CONTROL_REQUIRED=true`). One
  runtime socket claims control at a time, and robot-facing HTTP routes need its session id in
  `X-Bloom-Runtime-Session`. STOP stays open to any operator.
- **Breaking for API clients.** Saved positions belong to one application, selected with `config_id` and `app_id`.
  Saving needs that application to exist; unscoped calls keep their own library.
- **Breaking for lab launchers.** The runtime socket refuses a browser page whose `Origin` is not in
  `BLOOM_CORS_ALLOWED_ORIGINS`. The Extender launcher adds its own frontend and same-Wi-Fi origins; any other launcher
  must list them.
- Seeded apps now follow the shipped version. An unedited copy is upgraded at startup, including copies seeded before
  this release; an edited copy is kept. A shipped app deleted on purpose stays deleted until
  `bloom config seed --force <id>`.
- The Kinova gripper toggles send the Robotiq 85 range (`0.0` open, `0.8` closed) instead of Explorer's values.
- Moving teleop is capped at 60 commands per second per target (`BLOOM_RUNTIME_COMMAND_RATE_LIMIT_PER_SECOND`).
- The SQLite store migrates to schema version 6, which records deleted configurations.
- The audit log counts identical records back to back in a `repeats` field instead of storing each one.

### Security

- An application's `allowed_teleop_targets` is enforced on the runtime socket. A tab names its app with a new
  `app_context` message, and teleop, publishes and service calls are then limited to the deployment allowlists
  intersected with that app's `runtime_policy`, as `POST /runtime/actions` already did. A session on Bloom Debug or the
  webcam visualizer, which declare no teleop target, can no longer stream teleop. A client that sends no app context
  keeps today's deployment-wide behaviour.
- The runtime socket serves at most 32 sessions. A connection past that is refused with `session_limit` and closed
  instead of adding another session, each of which could hold 64 ROS subscriptions.
- Rate-limit state is bounded. A camera frame is checked against the publish allowlist before it is counted, so an
  arbitrary topic no longer leaves a counter behind, and idle runtime keys, client-address buckets, and
  per-configuration save locks are released instead of kept for the life of the process.
- Production refuses API keys shorter than 32 characters, a key shared by two roles, and a `*` CORS origin.
- The runtime socket checks `Origin`, so a web page in a browser that can reach the API can no longer claim control.
- The audit log lists sessions by alias. A session id proves ownership, and any reader could previously replay the
  owner's.
- The runtime socket key no longer travels in the query string by default, and Bloom redacts `api_key` values from
  Uvicorn's log lines.
- STOP is exempt from the HTTP rate limit, so it cannot be refused with 429.

### Fixed

- **STOP comes first, for the switch and for the keyboard.** Scanning walked the screen in DOM order, which put STOP
  last: 23 targets on the Explorer Manager drive screen, about 28 s away at the one-switch profile's 1400 ms period.
  It is now lit first in every cycle, on the canvas, in Settings and over the maintenance sheet, and it takes the
  runtime's only positive tab index, so it heads the tab order on every screen that draws it rather than sitting
  second to last.
- **Scanning stays on while stopped**, with the resume control as its only target, and a switch press on it resumes.
  Scanning used to be turned off with the latch, which took the switch bar with it, so a scan profile without dwell
  could stop the arm and never clear its own STOP.
- **An assistive resume asks twice.** A switch press or a dwell cannot hold, and one of them used to clear the STOP
  latch outright, against what the control, the guide and the checklist all promise. The first activation arms the
  resume and the control reads **PRESS AGAIN TO RESUME**, the second within eight seconds performs it, and the arming
  lapses by itself. A pointer hold is unchanged.
- **Maintenance is reachable without a pointer.** The **⋯** button sat outside the scan root and opens on a 1.5 s
  hold, which neither a switch press nor a dwell can give, so Settings, screen changes, the role switch and the way
  out were all unreachable under a scan or dwell profile. Both now cover the whole view, and a scan or dwell
  activation dispatches a cancelable event a control may accept in place of its hold; the **⋯** button and the resume
  control take it. While the sheet is open it becomes the scan root itself, with STOP first and its own switch bar.
  The button stays in the set while stopped, so an operator who stopped is not left with resume as the only thing
  they can reach.
- **Dwell requires a rest, not a passage.** The timer started when the pointer entered a control and never restarted
  while it moved inside, so crossing a control counted as resting on it: a pointer swept over **▲ Forward** published
  motion on the way past, and one parked at the edge of the screen could resume a STOP. Movement beyond six pixels
  inside the target now starts the rest over. Tremor and head-pointer jitter stay well under that; a traversal does
  not.
- **A visible keyboard focus ring.** The shipped ring was a 28% primary tint on a 4 px outline: 1.59:1 on the cream
  surface, under the 3:1 of WCAG 2.2 SC 1.4.11, and invisible on the forest bar. It is now a two-tone theme token, a
  dark line inside a light halo, so one half always carries the contrast whatever it lands on, and STOP fills its own
  rect and draws the ring inside the control. A theme test checks both halves against the surfaces, the forest chrome
  and the STOP red.
- **Focus follows the view that opens.** Opening an app focused an unnamed wrapper, and opening Settings, changing
  screen from maintenance or pressing Escape dropped focus on `<body>`: a screen reader announced nothing and the next
  Tab restarted at the top of the page. The runtime workspace, Settings and the practice tour each take focus on their
  own labelled region, and the route-level reset leaves focus alone once a view has claimed it.
- **The maintenance sheet traps focus.** The sheet claims `aria-modal="true"`, which hides the artboard behind the
  scrim from screen readers, but Tab walked straight into it, onto controls the reader could not see. Focus now moves
  into the dialog when it opens and stays inside it, Tab and Shift+Tab wrap at its ends, and closing it — by Close,
  Resume operating or Escape — gives focus back to the **⋯** button that opened it.
- **Stopped controls say so.** While the latch was on, the screen was inert by CSS alone: every control kept its tab
  stop, announced nothing and answered nothing, so a keyboard or screen-reader operator walked a screen of
  live-looking controls. The canvas controls now carry `aria-disabled` and leave the tab order while the latch is on,
  including a widget that re-renders under new telemetry, and get their tab stops back on resume. STOP and resume are
  never touched.
- **Runtime targets at their floor.** The **⋯** maintenance button drew 56×34 in a 44 px bar, the smallest target in
  the runtime, on the control every operator needs to leave the session; it now fills the bar's height. Settings held
  56 px for every profile, including the ones whose whole point is a larger target, and now takes its target from the
  profile: 56 px for touch, 64 px for scan, dwell or high visibility.
- **Pads and axes announce where they came to rest.** Four `aria-live` readouts on the drive screen streamed joystick
  coordinates at up to 30 Hz, so a screen reader talked over itself for as long as a hand was on the glass and the
  number it finally read was stale. The sr-only readouts announce the value the control settled at; the visible
  readouts are unchanged.
- **`Max speed m/s`** keeps the space between a control's title and its unit. A step slider's header put the unit
  straight after the title, and a screen reader and the scan announcement read "Max speedm/s" and "Max turnrad/s".
- **Settings reads its labels, not its keys.** Every Settings card showed its stored profile key beside the label and
  a screen reader read it: "Hold to activate dwell_ms", "Joystick dead zone deadzone". `font_scale`, `dwell_ms`,
  `deadzone` and the rest stay on screen for whoever edits a profile and are hidden from assistive technology.
- A joystick's target is measured on the pad the renderer draws, not on the whole card. The title row and the x/y
  readouts come off the card before the pad does, so a 216×216 card with its title above passed the 56 px comfort
  floor and drew a 47 px knob. Design system §04b states the three chrome cases separately. No shipped screen loses
  its floor; every shipped pad overlays its title, so its target moves by the 2 px surface border alone.
- A service call the robot refused is audited as `rejected`, not `accepted`, and every service audit row carries the
  receipt's own `call_status` and `success`, so a simulated call is visible as one.
- A camera frame published with no ROS attached is reported as `simulated`, like every other Noop seam, instead of
  `published`. `GET /api/v1/capabilities` now also reports the `camera-frames` seam, so a screen can tell whether
  frames reach ROS.
- A configuration read no longer takes a write lock. The store is migrated once, when its repository is built, and
  connections run in WAL with a 15 s busy timeout, so a CLI `config seed` holding a write no longer makes the API
  answer 500 with `database is locked`.
- The visual checks answer `GET /api/v1/capabilities` and the saved-position routes. Neither was stubbed, so the
  screenshots and the sweep were taken with capabilities unresolved and the position library in its failure state.
- Drive · Bench's continuous speed limits had a 40 px thumb, 32 px on the tablet glass, so the shipped apps failed the
  builder's own touch floor. The thumb is 56 px and the two cards are authored 132 tall to keep the rail's spacing.

- Bloom Debug's joint table waited forever on the Explorer simulation: NaN velocity and effort on the passive gripper
  joints made every `/joint_states` sample invalid JSON. Non-finite values are sent as `null`.
- Moving between screens stacked subscriptions, so plots received each message twice; a 100 Hz topic kept only 9 s of a
  30 s window; the newest sample drew past the plot's right edge; and manipulability near 8e-5 read `0.000`.
- Plot pickers and the joint table grew past their slot, under STOP on Kinova's Robot feedback and off a 1080 px screen
  in Bloom Debug; they now scroll. Bloom Debug's raw echo is raised to its minimum, and a test keeps every Manager and
  Bloom Debug widget at or above its kind's minimum.
- Spanish and French labels no longer clip or run under a knob: speed segments, group labels, pad and pivot words wrap.
- The maintenance sheet keeps **Resume operating** on screen, the **⋯** hold button stays inside the bar, Settings fits
  1280×720 beside STOP, speed-limit thumbs meet the 48 px bench floor, and the reserved STOP rect follows the canvas
  after Settings closes.
- Keyboard holds cancel when focus leaves; a toggle whose label is a verb no longer announces itself as pressed.
- The publish-rate fact no longer claims zeros are sent at rest, the Settings try-it heading says nothing is sent, and
  a zero dead zone reads as each control's own rather than `0.00`.
- Builder: an empty screen invites widgets instead of promising a migration, the inspector keeps the selected widget's
  size in view, labels lose the kind badge that covered them, stray TOO SMALL tags stay in their row, and counts say
  "1 screen".
- The landing page no longer draws a focus ring around the page on load, and the library remembers the last app once
  its configuration loads, keeps its device note in step with the window, and closes its menu on Escape.

- A joystick held under the maintenance sheet, Settings, or the practice tour no longer resumes motion after the
  zero. Only releases pass while motion is held.
- Builder home previews place widgets against the screen's own canvas rather than a desktop one.
- A busy stream card no longer grows under STOP, and the Height slider's direction words are centred over the pad.

- Fresh API environments now install a WebSocket implementation for Uvicorn, so runtime sessions still connect after
  `uv sync` or a clean deployment.
- Bloom Debug keeps preflight, topic, and audit status in one row at the maintained video viewport, leaving its live
  echo and plot widgets readable at `1280x720`.
- Bloom Debug subscribes to the default `cartesian_manager` command topic as `geometry_msgs/msg/TwistStamped`, matching
  the publisher instead of leaving the command echo empty with an incompatible legacy message type; its command plot
  also retains the full 30-second window at 100 Hz.
- Three high severity advisories in transitive frontend dependencies (`nanoid`,
  `postcss`, `undici`).
- The backend audit gate reported `pip`'s own advisory through `pip-audit`;
  `pip` is now constrained to a patched release rather than the finding being
  suppressed.
- Operator seed layouts are checked for canvas bounds and overlapping interactive controls; the Explorer/Kinova
  gripper payloads and speed topics now match their live client contracts.
- Explorer and Kinova command-source event logs now read `/mode_request` instead of rendering permanently empty, and
  local `teleop-frame` controls are no longer misreported as missing ROS topic destinations.
- Held values on stepped, latched and non-releasing controls expire after 15 s even while the screen re-renders, and
  return to rest after STOP, a lost connection or a screen change. A latched momentary button publishes its release
  when it unmounts or is disabled.
- Losing control ownership suspends teleop, so a reclaimed session no longer streams a joystick already released.
- A dwell that started on STOP can no longer complete as Resume, and switch scanning and dwell stay off the controls
  behind the Maintenance dialog.
- A ROS service call no longer holds the STOP lock, so STOP answers during a slow call.
- Camera frames are refused while STOP is engaged, and on the legacy `teleop_command` backend STOP zeros `/teleop_cmd`.
- Keyboard nudges on return-to-center sliders last only while the key is down; Home and End no longer jump to full
  scale.
- The supervisor mirror shows STOP, mode requests from the shipped buttons and an idle operator's frame correctly.
- The dashboard's runtime client matches each reply to its own request, and a late close from a replaced socket no
  longer tears down the new one.
- Configuration store: concurrent saves to one configuration no longer lose an edit, CLI commands adopt the old file
  store before writing SQLite, `config status` reports every app, and publishing an unedited app leaves its seed file
  untouched.
- Builder: JSON settings keep half-typed text, an emptied optional number is unset, and a slider step of 0 is refused.
- The Extender launcher no longer leaves Vite running when it exits, and Vite no longer drifts to another port.
- **A dwell that began before STOP no longer fires after it.** The rest only checked its target when the pointer
  arrived, so a rest started on **Forward, one step** still clicked it half a second after the latch engaged; the
  programmatic click went straight past the canvas' `pointer-events: none`. The rest is now abandoned instead.
- **A canvas that comes back while STOP is latched comes back stopped.** Engaging STOP with Settings or the practice
  tour open left the remounted canvas untouched — every control kept its tab stop and said nothing to a screen
  reader — because the latch still watched the unmounted nodes.
- **The stopped latch survives a re-render, and resume puts back what it found.** A widget that re-set its own
  `tabindex` got its tab stop back while the latch was still on, and releasing the latch cleared `aria-disabled` from
  controls that had declared it themselves, so an unavailable control came back looking operable.
- **The stop latch refuses motion in the frontend too.** The runtime intent gate now knows the latch, so a widget
  value-change is refused before it reaches the socket instead of relying on the backend to throw and on a CSS
  `pointer-events: none` that arrow keys on an already-focused pad never meet. A release (a zero) still passes, so a
  held control can return to rest.
- The status chip and the kiosk bar's held badge now read the practice tour the same way the intent gate does. All
  three take one reading of which view holds motion, so they cannot drift apart if the tour ever stops replacing the
  canvas.
- **A dwell operator is no longer trapped in the maintenance sheet.** The sheet ran switch scanning but not dwell,
  and the workspace's dwell is off while the sheet is open, so resting on **⋯** opened a sheet with no dwellable
  Close, Settings, screen or role. The sheet now runs dwell the same way it runs scanning.
- **The lease keepalive can no longer desynchronise the runtime socket's replies.** Replies are matched to requests by
  position, and a ping used to occupy a slot that only a pong could settle, so one unanswered ping offset every later
  reply by one: a teleop ack would be read off the wrong command and a stop-latch refusal would never reach the stream
  pump. Pings are now sent outside the queue and pongs dropped before it. The keepalive timer is also cleared on
  `error`, not only on `close`.
- The gap the maintenance sheet leaves for STOP is measured after layout instead of read out of the DOM during
  render, so it no longer depends on which render happens to see the mounted canvas shell.
- **Resetting the command frame to the robot's default now reaches the stream.** A gamepad or other non-widget source
  that reset to the default sent an empty frame, which was dropped on the way to the pump, so the stream kept stamping
  the frame the operator had just left and the arm went on rotating in it.

### Known limitations

- Live validation on Extender hardware is still pending. Everything recorded so
  far is fixture, contract, or bench validation against a running
  `cartesian_manager` without a robot attached.
- Bloom applies no scaling to commands, by design. See decision 0118.
- Kinova Manager has no **Go home** button. `cartesian_manager`'s Kinova parameters define `home` over six joints with Explorer's angles, and joint 4 at 2.97 rad is outside the gen3 limit of 2.57 rad. The button returns once that target is corrected upstream.
- `cartesian_manager` still does not publish authoritative active-mode feedback; Bloom labels the mode as last requested.
- Directional switch scanning and combined scan-plus-dwell are covered by component, app, and bench-browser evidence,
  but still require validation with the intended physical switch and operators before participant use.

## [0.1.0]

Initial foundation: builder, runtime, widget contracts, configuration storage
with JSON and SQLite, runtime sessions with audit and rate limiting, ROS
adapters, design system, and the CI baseline. See
[the documentation map](docs/README.md) and dated decision/validation records for how this was assembled.
