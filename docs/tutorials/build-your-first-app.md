# Build Your First App

Make your own application, drive the robot from it, pass the review checklist, and open the result in Runtime.
About fifteen minutes. Nothing here needs a topic typed by hand: every widget arrives wired to the robot.

Have Bloom running first: [Getting started](getting-started.md) part one is enough. With the Explorer or Kinova
simulation (or the arm) running, the last step moves the robot.

## 1. Create the app

Open **Builder** from the top navigation, then the **Apps** section. The right-hand card is headed **Create guided
app**:

- **App name** — anything; the app id is slugified from it and cannot be edited afterwards.
- **Starter screen** — choose **Operator controls**. It places this arm's **Translation** pad, a **Max linear speed**
  slider on qontrol's speed limit, and the **Gripper** toggle with this arm's open and closed values.
  **Debug monitor** reads the hand's pose and the mode requests instead; **Blank canvas** places nothing.
- **Design preset** — **Extender light**, **Bloom garden**, or **High visibility**.

Press **Create guided app**. Bloom opens the new app's page; it also appears in **Available apps**, with an
**Operator** role that opens its screen.

## 2. Add widgets

Press **Open app**, then **Open builder** on the screen. The canvas shows the artboard at true proportion under a mock
kiosk strip; on the right, the **Widget palette** has a search box.

Click any widget to place it. It lands clear of the others and of STOP, and it already works:

| Widget | Arrives |
| --- | --- |
| Joystick | This arm's **Translation** pad: Forward, Back, Left, Right, on `/joystick_cartesian_command` |
| Toggle | The **Gripper**, with this arm's values |
| Slider | **Max linear speed**, qontrol's limit |
| Command button | **Neutral**, the `geometric/both` mode request |
| Gauge, plots, topic echo, value strip, plot board | The hand's pose on `/ee_pose` |
| Event log | The mode requests |
| Joint table, Jacobian, 3D robot view, positions | The robot's joint states, Jacobian and model |

Change any of it in the Inspector: its banner says **Publishes to** or **Reads from**, and the joystick's topic field
offers the inputs the robot's manager listens on. Only the gesture pad, a game's input, asks for its topic.

The 3D robot view and a few debug widgets are **Desktop only**. On a tablet screen the palette offers **Switch this
screen to desktop**, and the device reading at the top of the canvas has the same switch.

When the screen is full, a widget first tries its kind's minimum size; if it still lands on another, the Builder says
which, and the review checklist will not pass until you drag it clear. A control under another cannot be pressed.

Press **Save changes**.

## 3. Run the review checklist

Press **Back to app config**, then **Review checklist**. It is derived from the saved app and each step says what to fix,
with a button that jumps there: minimum sizes, no widget on another, device class, pads in a row, profiles, the
command frame, allowed topics, a preview as the person, and the export.

## 4. Open it in Runtime

Press **Open runtime** on the app card, or pick the app in **Runtime**. You get the same kiosk as any shipped app: the
44 px bar, STOP in its reserved region, and Maintenance behind a hold on **⋯**. Push **Forward**: the hand moves
forward. Press **Close gripper**: the state reads **commanded: closed**.

To share the app with the team, press **Share** on its card in **Builder > Apps** and commit the file it names.

## Where to go next

- [Operate safely](operate-safely.md) — hand the result to an operator.
- [The design system](../design-system.md) — tokens, density, and when a pattern belongs in `@bloom/ui`.
- [`docs/design/`](../design/README.md) — the geometry contract, the screen specs, and the pad recipe.
- [The operator runtime guide](../operator-runtime.md) — what every runtime surface does.
