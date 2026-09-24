# Build Your First App

Make your own application, put a joystick and a command button on a screen, tell them where to publish, pass the review
checklist, and open the result in Runtime. About thirty minutes.

Have Bloom running first: [Getting started](getting-started.md) part one is enough, and you do not need a robot for
most of this. The last step is more interesting with one.

## 1. Create the app

Open **Builder** from the top navigation, then the **Apps** section. The right-hand card is headed **Create guided
app**:

- **App name** — anything; the app id is slugified from it and cannot be edited afterwards.
- **Starter screen** — **Blank canvas**, **Operator controls**, or **Debug monitor**. Choose **Blank canvas** so you
  place everything yourself.
- **Design preset** — **Extender light**, **Bloom garden**, or **High visibility**.
- **Include onboarding spots** — leave it off.

Press **Create guided app**. It appears in **Available apps** on the left.

There is no description or device-class field. The description is generated from the starter, and a new screen is
authored on the tablet canvas, `native-1280x720`.

## 2. Add a screen

Press **Open app** on your app's card. This is the app configuration page: identity, theme, adapter guardrails, the
command preset library, and the screens the app is made of.

In the **Screens** panel, the **Create a screen** card has one field, **New screen name**. Name it `Drive`, press
**Create screen**, then press **Save app** in the header.

Save before you go further. **Open builder** on a screen is disabled while the app has unsaved changes, and so is
**Review checklist**.

Artboard size and reserved regions are not editable here. A screen inherits the canvas of the app's device class, and
reserved regions — the area STOP owns — appear on the canvas as **STOP · drawn by the runtime, placed here**.

There is no STOP in the widget palette, and there is not meant to be. Every runtime app gets one, drawn by the
runtime itself above everything on the screen, and no widget may be placed in the region it reserves. You choose
*where* it sits: select the box and move it with the arrow keys, holding shift for a bigger step. A move that
would put it over a control is refused, because a control underneath STOP can be pressed nowhere. You cannot
remove it, and every screen you create starts with one.

## 3. Place a joystick and a command button

Press **Open builder** on your screen. The canvas shows the artboard at true proportion under a mock kiosk strip
reading `kiosk bar · 44 px · chrome`. On the right is the **Inspector**, and at its top the **Widget palette** headed
**Add widgets**.

Click **Joystick**. It is placed on the canvas clear of any reserved region — there is no dragging from the palette.
Click **Command button** as well.

Move a widget by dragging it, resize it with the corner handle. Both are pointer-only; there is no keyboard
alternative yet. If a widget is too small for what its renderer draws, the canvas tags it **Too small** and the
Inspector offers **Below minimum size** with a **Resize to 280×332** button that fixes it exactly. Take that offer
rather than guessing: the minimums are derived from what each renderer actually puts on screen, and they are listed in
[the widget minimum size contract](../design/widget-min-size.md).

## 4. Point them at a topic

Select a widget. The Inspector's **Settings** panel, **Widget configuration**, starts with **Title**. Above the fields,
a banner says **Publishes to** or **Reads from**, which is the fastest way to check you got this right.

The two widgets work differently on purpose.

**The joystick has no topic field.** A joystick contributes one part of a twist that several widgets share, so it
cannot own a topic. Its destination is the **Runtime binding** JSON, which for a new joystick already reads:

```json
{ "adapter": "teleop", "target": "both", "value_mapping": { "mode": 3, "target_topic": "/joystick_cartesian_command" } }
```

That is the Extender teleop target, so leave it alone. The banner confirms **Publishes to /joystick_cartesian_command**
and explains that this widget has no topic of its own. Its other fields — **Mode**, **Deadzone**, **Publish rate**,
**Zero on release**, **Axis labels** — shape the contribution, not its destination.

**The command button owns its message.** Set:

- **Command** — the intent id, for example `gripper_open`. Required.
- **Button label** — what the operator reads, for example `Open gripper`.
- **Output topic** — `/gripper_controller/commands`.
- **ROS message type** — `std_msgs/msg/Float64MultiArray`.
- **Payload** — `{"data": [0.2]}`.

A **Runtime binding** on a command button outranks **Output topic**; when both are set the topic field is shown
disabled and says so. Leave the binding empty here.

Press **Save changes**. The meta row's **Mode** flips from **Unsaved draft** to **Saved** and the status line reads
**All changes saved.**

## 5. Allow the topic

A new app's adapter guardrails are empty, and the backend refuses a publish no policy allows. Go **Back to app
config** and open the **Adapter guardrails** panel:

- **Cartesian command frame** — leave it on the backend default unless you know the robot's frames.
- **Allowed publish topics** — add `/gripper_controller/commands`, one value per line.
- **Allowed message types** — add `std_msgs/msg/Float64MultiArray`.
- **Allowed teleop targets** — add `/joystick_cartesian_command`.

**Sync publish guardrails from presets** fills these from the app's command presets when you use the preset library
instead of typing a topic by hand. Press **Save app**.

The app policy is a convenience and a statement of intent. The backend policy is the boundary that actually holds, so
a topic has to be allowed in both. The deployment variables are in
[the deployment guide](../deployment.md#runtime-ros-policy-variables).

## 6. Run the review checklist

Press **Review checklist** in the app configuration header. It is greyed out until the app is saved.

The checklist is derived from the saved application, not from a form you fill in. It walks twelve steps and each one
either passes or tells you what to do:

1. Start from the panel, not the desktop.
2. Place controls, watch the bounds.
3. Every widget meets its minimum size.
4. Siblings in a row share a size.
5. Pads in a row share one card, one square and one centre line.
6. Every profile opens a screen that exists.
7. Paired apps publish the same way.
8. Say which way is forward — the command frame.
9. Bind to allowed topics.
10. Test as the person, not as you — profile preview.
11. Ship it to the tablet — exports the application JSON.

Each step's button jumps to the place that fixes it, and the aside explains why the check exists. Step 10 will report
that your app has no operator profile to preview; that is expected, and step 7 is the next section.

## 7. Open it in Runtime

Press **Open runtime** on the app card in **Builder > Apps**, or open **Runtime** and pick the app from **Apps on this
robot**.

Your app has no profiles, so the rail says **This app declares no profiles, so it opens with runtime defaults** and
the button reads **Open** rather than **Open as Operator**. Press it. You get the same kiosk as any shipped app: the
44 px bar, STOP in its reserved region, and Maintenance behind a 1.5 second hold on **⋯**.

To give it real roles, look at how a shipped app does it. Explorer Manager declares three profiles — **Operator**,
**Bench** and **One switch** — and each names the screen it opens through `preferred_control_layout_id`. There is no
profile editor in the Builder yet, so roles are authored in the app's JSON:

```bash
cd backend
uv run python -m apps.bloom_cli.main config publish <your-app-id>
# edit backend/seed/applications/<your-app-id>.json and add a profiles array
uv run python -m apps.bloom_cli.main config seed --force <your-app-id>
```

`config publish` writes the JSON the team shares, and `config seed --force` discards the local copy and reloads the
tracked one. `config status` tells you which of your apps are `shared`, `edited`, `outdated`, `local`, `missing` or
`deleted`.

## Where to go next

- [Operate safely](operate-safely.md) — hand the result to an operator.
- [The design system](../design-system.md) — tokens, density, and when a pattern belongs in `@bloom/ui`.
- [`docs/design/`](../design/README.md) — the geometry contract, the screen specs, and the pad recipe.
- [The operator runtime guide](../operator-runtime.md) — what every runtime surface does.
