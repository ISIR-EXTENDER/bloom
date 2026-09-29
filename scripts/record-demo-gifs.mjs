/**
 * Record Bloom's main steps as GIFs against a live simulation: the operator screen on the left, the robot model
 * (Bloom Debug's Robot view, or the Widget Lab's Robot screen for the goals) on the right, captured in sync.
 *
 *   BLOOM_DASHBOARD_URL=http://127.0.0.1:5180 BLOOM_VIEW_DASHBOARD_URL=http://127.0.0.1:5181 \
 *     node scripts/record-demo-gifs.mjs --robot explorer|kinova [--scenes open,forward,...] [--out docs/assets/demo/gifs]
 *
 * Needs a sourced ROS environment on the simulation's domain (the probe reads /ee_pose and publishes the goals) and
 * the two dashboards scripts/demo-gifs-stack.sh starts. Frames come from the Chrome screencast of each page; each
 * scene is cut by its markers, both sides resampled to 12 fps, composed with ffmpeg (hstack, caption bar) into an
 * MP4 and a palette-based GIF, and three PNG frames are kept next to them for a look.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { openRuntimeApp, waitReady } from "./lib/e2e-checks.mjs";
import { rosPublishOnce, startRosProbe } from "./lib/ros-probe.mjs";
import { STACK } from "./lib/stack-topics.mjs";

const args = process.argv.slice(2);
const readArgument = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5180";
const viewUrl = process.env.BLOOM_VIEW_DASHBOARD_URL ?? "http://127.0.0.1:5181";
const robotKey = readArgument("--robot");
const outputDir = resolve(readArgument("--out") ?? "docs/assets/demo/gifs");
const workDir = resolve(readArgument("--work") ?? `${process.env.TMPDIR ?? "/tmp"}/bloom-demo-gifs-${robotKey}`);
const only = readArgument("--scenes")?.split(",").filter(Boolean);
const FPS = 12;
const OUT_WIDTH = 1600;
const SIDE_HEIGHT = 720;
const CAPTION_HEIGHT = 44;
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const ROBOTS = {
  explorer: {
    app: "Explorer Manager",
    label: "Explorer",
    // command_max_linear_velocity 0.15 m/s: 2 s of Forward is 30 cm, a stroke the 3D view shows plainly.
    pushMs: 2000,
    axisMs: 1500,
    speedPushMs: 1000,
    gripperMs: 2500,
    homeMs: 9000,
    // Closer than the fit, the target panned up so the arm sits mid-frame, seen from above and ahead; "hand"
    // pans on to the gripper and comes closer still, for the finger scenes.
    view: {
      standard: { zoom: -1200, pan: { dx: 0, dy: -230 }, orbit: { dx: 0, dy: 0 } },
      hand: { zoom: -1200, pan: { dx: -185, dy: -245 }, orbit: { dx: 0, dy: 0 }, zoomMore: -900 },
    },
  },
  kinova: {
    app: "Kinova Manager",
    label: "Kinova",
    // 0.05 m/s on the gen3, and the model is bigger, so the same stroke takes longer.
    pushMs: 3000,
    axisMs: 2500,
    speedPushMs: 1600,
    gripperMs: 3500,
    homeMs: 9000,
    view: {
      standard: { zoom: -600, pan: { dx: 0, dy: 0 }, orbit: { dx: 0, dy: 0 } },
      // Framed for the gen3 at its home pose: mock hardware starts it upright with the hand out of view, so the
      // Kinova set is recorded after go-home (run go-home first).
      hand: { zoom: -600, pan: { dx: -110, dy: -60 }, orbit: { dx: 0, dy: 0 }, zoomMore: -900 },
    },
  },
};
const robot = ROBOTS[robotKey];
if (!robot) {
  console.error("--robot must be explorer or kinova");
  process.exit(2);
}

const {
  twist: TWIST,
  eePose: POSE,
  mode: MODE,
  sharedControlGoals: GOALS,
  sharedControlConfidences: CONFIDENCES,
  jointTarget: JOINT_TARGET,
  jointStates: JOINT_STATES,
} = STACK;
const composeOnly = args.includes("--compose-only");

await mkdir(outputDir, { recursive: true });
if (!composeOnly) {
  await rm(workDir, { force: true, recursive: true });
  await mkdir(resolve(workDir, "frames"), { recursive: true });
}

const ros = composeOnly ? null : await startRosProbe({ source: probeSource(), readyTopic: POSE });
const browser = composeOnly ? null : await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const frames = composeOnly
  ? JSON.parse(await readFile(resolve(workDir, "frames.json"), "utf8"))
  : { left: [], right: [] };
const pendingWrites = [];
const scenes = composeOnly ? JSON.parse(await readFile(resolve(workDir, "scenes.json"), "utf8")) : [];
const failures = [];
let frameCount = 0;
let cursor = { x: 640, y: 360 };
/** The operator page and the robot-view page of the moment; scenes swap them. */
let left = null;
let right = null;
let rightCrop = null;

const SCENES = [
  ["open", "Open the app from the library: READY", openScene],
  ["forward", "Translation pad: push Forward, release", forwardScene],
  ["height-pivot", "Height Up / Down and Pivot", heightPivotScene],
  ["gripper", "Gripper: Close, then Open", gripperScene],
  ["speed", "Speed: Slow, Medium, Fast — the same push", speedScene],
  ["stop", "STOP: controls inert, hold one second to resume", stopScene],
  ["go-home", "Positions: Go home (twin = target)", goHomeScene],
  ["speed-up-intent", "Behaviours: Speed up with intent", intentScene],
  ["assist-to-goals", "Behaviours: Assist to goals", assistScene],
  ["settings-palette", "Settings: the Dark palette, and back", paletteScene],
  ["settings-scan", "Settings: switch scanning", scanScene],
  ["builder-create", "Builder: a new app from a starter", builderCreateScene],
  ["builder-place", "Builder: a widget from the palette, placed and saved", builderPlaceScene],
  ["new-app-drives", "The new app drives the arm", newAppScene],
];

if (!composeOnly) {
  try {
    for (const [name, title, run] of SCENES) {
      if (only && !only.includes(name)) {
        continue;
      }
      console.log(`\n== ${name}: ${title}`);
      try {
        await run(name, title);
      } catch (error) {
        // One scene's failure keeps the others: note it, keep its last frames, and go on with fresh pages.
        failures.push(name);
        console.error(`FAILED ${name}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
        await left?.screenshot({ path: resolve(workDir, `${name}.failed-left.png`) }).catch(() => undefined);
        await right?.screenshot({ path: resolve(workDir, `${name}.failed-right.png`) }).catch(() => undefined);
        await left?.mouse.up().catch(() => undefined);
        await left
          ?.context()
          .close()
          .catch(() => undefined);
        left = null;
        await right
          ?.context()
          .close()
          .catch(() => undefined);
        right = null;
      }
      await Promise.all(pendingWrites.splice(0));
      await writeFile(resolve(workDir, "frames.json"), JSON.stringify(frames));
      await writeFile(resolve(workDir, "scenes.json"), `${JSON.stringify(scenes, null, 2)}\n`);
    }
  } finally {
    await Promise.all(pendingWrites);
    await browser.close();
    ros.stop();
  }
}

for (const scene of scenes) {
  if (only && !only.includes(scene.name)) {
    continue;
  }
  await compose(scene);
}
console.log(
  `\n${scenes.length} scene(s) written to ${outputDir}${failures.length ? `; FAILED: ${failures.join(", ")}` : ""}`,
);
process.exit(failures.length ? 1 : 0);

// ---- Scenes ----

async function openScene(name, title) {
  await newOperator();
  await left.goto(dashboardUrl, { waitUntil: "networkidle" });
  await click(left.getByRole("button", { name: "Runtime: Operate and inspect" }));
  await left.getByRole("button", { exact: true, name: robot.app }).waitFor();
  // The viewer runs on its own API, so it never takes the operator's control lease.
  await openRobotView("debug");
  await record(name, title, async () => {
    await caption("Library", `Open ${robot.app} as the Operator`);
    await pause(900);
    await click(left.getByRole("button", { exact: true, name: robot.app }));
    await pause(700);
    await click(left.locator(".runtime-library-roles").getByRole("button", { exact: true, name: "Operator" }));
    await pause(500);
    await click(left.locator(".runtime-library-open"));
    await left.locator('[data-testid="runtime-artboard"][data-screen-id="manager_drive_operator"]').waitFor();
    await waitReady(left);
    await caption("READY", "The kiosk reads READY once the runtime socket is open");
    await moveTo(640, 400, 700);
    await pause(2500);
  });
}

async function forwardScene(name, title) {
  await ensureDrive();
  await record(name, title, async () => {
    await caption("Translation", "Push Forward and hold: the hand moves forward in the 3D view");
    await pause(600);
    const release = await pushPad("Translation", { x: 0, y: 2 });
    await pause(robot.pushMs);
    await caption("Release", "The pad springs back and the hand stops");
    await release();
    await pause(1800);
  });
  await strokeBack("Translation", { x: 0, y: -2 }, robot.pushMs);
}

async function heightPivotScene(name, title) {
  await ensureDrive();
  await record(name, title, async () => {
    await caption("Height", "Up, then Down");
    const up = await pressSliderEnd("Height", "positive");
    await pause(robot.axisMs);
    await up();
    await pause(500);
    const down = await pressSliderEnd("Height", "negative");
    await pause(robot.axisMs);
    await down();
    await pause(500);
    await caption("Pivot", "Turn the hand left, then right");
    const leftEnd = await pressSliderEnd("Pivot", "negative");
    await pause(robot.axisMs);
    await leftEnd();
    await pause(500);
    const rightEnd = await pressSliderEnd("Pivot", "positive");
    await pause(robot.axisMs);
    await rightEnd();
    await pause(900);
  });
}

async function gripperScene(name, title) {
  await ensureDrive("debug", "hand");
  const close = await offerGripper("Close");
  await record(name, title, async () => {
    await caption("Gripper", "Close gripper: the fingers close on the model");
    await pause(500);
    await click(close);
    await pause(robot.gripperMs);
    const open = await offerGripper("Open");
    await caption("Gripper", "Open gripper");
    await click(open);
    await pause(robot.gripperMs);
  });
}

async function speedScene(name, title) {
  await ensureDrive();
  const segment = (label) =>
    left.getByRole("group", { name: "Max speed" }).getByRole("button", { exact: true, name: label });
  await record(name, title, async () => {
    for (const label of ["Slow", "Medium", "Fast"]) {
      await caption(label, `The same ${(robot.speedPushMs / 1000).toFixed(1)} s push at ${label}, and the stroke back`);
      await click(segment(label), 350);
      const release = await pushPad("Translation", { x: 0, y: 2 }, 350);
      await pause(robot.speedPushMs);
      await release();
      await pause(250);
      const back = await pushPad("Translation", { x: 0, y: -2 }, 250);
      await pause(robot.speedPushMs);
      await back();
      await pause(250);
    }
  });
  await segment("Medium").click();
  await left.waitForTimeout(400);
}

async function stopScene(name, title) {
  await ensureDrive();
  await record(name, title, async () => {
    await caption("STOP", "Always live; the backend latches it");
    await click(left.getByRole("button", { name: "Stop the robot" }));
    await left.getByRole("button", { name: "Hold for one second to resume" }).waitFor();
    await pause(700);
    await caption("Stopped", "The pad is inert: nothing reaches the robot");
    const release = await pushPad("Translation", { x: 0, y: 2 });
    await pause(1600);
    await release();
    await pause(400);
    await caption("Resume", "Hold for one second");
    await holdButton(left.getByRole("button", { name: "Hold for one second to resume" }), 1400);
    await left.getByRole("button", { name: "Stop the robot" }).waitFor();
    await pause(500);
    await caption("Resumed", "The same push moves the hand again");
    const again = await pushPad("Translation", { x: 0, y: 2 });
    await pause(1400);
    await again();
    await pause(1000);
  });
  await strokeBack("Translation", { x: 0, y: -2 }, 1400);
}

/** The wrapped joint distance between the arm and a joint target, in radians. */
function jointError(target, state) {
  if (!target || !state) {
    return Number.NaN;
  }
  const errors = target.name.map((joint, index) => {
    const current = state.position[state.name.indexOf(joint)];
    const delta = current - target.position[index];
    return Math.abs(((((delta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI);
  });
  return Math.max(...errors);
}

async function sendHome() {
  const since = Date.now();
  await click(left.getByRole("button", { name: /Send Home/ }));
  await left.getByRole("button", { name: /Press again to move/ }).waitFor();
  await pause(900);
  await click(left.getByRole("button", { name: /Press again to move/ }));
  return ros.waitFor(JOINT_TARGET, () => true, { since, timeoutMs: 8000 }).catch(() => null);
}

async function goHomeScene(name, title) {
  await ensureDrive();
  // The joint target moves at a slow, fixed joint speed and the simulation does not start at home: go home
  // once off camera (up to 40 s), then leave home by a short stroke, so the recorded Go home converges in a few seconds.
  await openScreen("Positions", "manager_positions");
  const first = await sendHome();
  for (let waited = 0; waited < 40 && jointError(first, ros.latest(JOINT_STATES)?.data) > 0.05; waited += 1) {
    await left.waitForTimeout(1000);
  }
  console.log(`  at home within ${jointError(first, ros.latest(JOINT_STATES)?.data).toFixed(2)} rad`);
  await left.getByRole("button", { name: /^Cancel the pose/ }).click();
  await left.waitForTimeout(600);
  await openScreen("Drive · Operator", "manager_drive_operator");
  await strokeBack("Translation", { x: 0, y: 2 }, robot.pushMs * 0.6);
  const up = await pressSliderEnd("Height", "positive");
  await left.waitForTimeout(robot.axisMs * 0.6);
  await up();
  await left.waitForTimeout(600);
  await openScreen("Positions", "manager_positions");
  await record(name, title, async () => {
    await caption("Positions", "Go home: one press arms it, a second press sends it");
    await pause(500);
    const target = await sendHome();
    await caption("Joint target", "The translucent twin is the target; the arm reaches it");
    const deadline = Date.now() + robot.homeMs;
    while (Date.now() < deadline) {
      await pause(1000);
      console.log(
        `  ${((deadline - Date.now()) / 1000).toFixed(0)} s left, max joint error ${jointError(target, ros.latest(JOINT_STATES)?.data).toFixed(2)} rad`,
      );
    }
  });
  await left.getByRole("button", { name: /^Cancel the pose/ }).click();
  await left.waitForTimeout(600);
}

async function intentScene(name, title) {
  await ensureDrive("lab");
  await left.getByRole("group", { name: "Max speed" }).getByRole("button", { exact: true, name: "Slow" }).click();
  await openScreen("Behaviours", "manager_behaviours");
  await record(name, title, async () => {
    await caption("Speed up with intent", "Switch it on: the manager reports behaviour/intent_scaling");
    await switchBehaviour("Speed up with intent", "on");
    await left.locator(".runtime-kiosk-behaviour[data-behaviour='intent_scaling']").waitFor({ timeout: 8000 });
    await pause(800);
    await caption("Steady push", "The intent gauge climbs 0.4 → 1.0 and the header chip says Speed up on");
    const release = await pushPad("Translation", { x: 0, y: 2 });
    await pause(3200);
    await release();
    await pause(900);
    await caption("Off", "Back to plain speed");
    await switchBehaviour("Speed up with intent", "off");
    await pause(1200);
  });
  await strokeBack("Translation", { x: 0, y: -2 }, 3200);
}

async function assistScene(name, title) {
  await ensureDrive("lab");
  await left.getByRole("group", { name: "Max speed" }).getByRole("button", { exact: true, name: "Slow" }).click();
  await openScreen("Behaviours", "manager_behaviours");
  // Two goals a quarter metre either side of the hand along the axis Forward drives.
  const direction = await forwardDirection();
  const hand = ros.latest(POSE).data.position;
  const goal = (sign) => ({
    position: { x: hand.x + sign * 0.25 * direction.x, y: hand.y + sign * 0.25 * direction.y, z: hand.z },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
  });
  const publishGoals = (poses) =>
    rosPublishOnce(GOALS, "geometry_msgs/msg/PoseArray", JSON.stringify({ header: { frame_id: "base_link" }, poses }));
  await publishGoals([goal(1), goal(-1)]);
  await record(name, title, async () => {
    await caption("Goals", "Two goals published on /shared_control/goals (PoseArray, base_link)");
    await pause(1200);
    await caption("Assist to goals", "Switch it on: confidence bars appear and the goals are drawn in 3D");
    let since = Date.now();
    await switchBehaviour("Assist to goals", "on");
    const modeSeen = await ros
      .waitFor(MODE, (data) => data.data === "behaviour/shared_control", { since, timeoutMs: 4000 })
      .catch(() => null);
    if (!modeSeen) {
      console.log("  (no behaviour/shared_control on the wire yet; pressing again)");
      since = Date.now();
      await click(left.getByRole("button", { name: /^Assist to goals:/ }).first());
      await ros.waitFor(MODE, (data) => data.data === "behaviour/shared_control", { since, timeoutMs: 4000 });
    }
    const idle = await ros.waitFor(CONFIDENCES, (data) => data.ids.length === 3, { since, timeoutMs: 10000 });
    console.log(`  confidences ${idle.ids.join(",")} ${idle.data.map((v) => v.toFixed(2)).join(" ")}`);
    await left
      .locator(".bloom-confidence-bars[data-live='true'] .bloom-confidence-row")
      .nth(2)
      .waitFor({ timeout: 10000 });
    await pause(1500);
    console.log(
      `  3D view: goals ${await right.locator(".bloom-robot-3d-stage").getAttribute("data-goals")}, soft goal ${await right.locator(".bloom-robot-3d-stage").getAttribute("data-soft-goal")}`,
    );
    await caption("Push toward a goal", "Its bar fills as the manager grows confident");
    const release = await pushPad("Translation", { x: 0, y: 2 });
    await pause(2600);
    await release();
    await pause(1000);
    await caption("Reset assist", "The goals are forgotten: one bar, agnostic");
    await click(left.getByRole("button", { name: /^Reset assist/ }));
    await left.locator(".bloom-confidence-bars[data-goals='1']").waitFor({ timeout: 8000 });
    await pause(1500);
  });
  await switchBehaviour("Assist to goals", "off");
  await publishGoals([]).catch(() => undefined);
  await strokeBack("Translation", { x: 0, y: -2 }, 2600);
  await left
    .getByRole("group", { name: "Max speed" })
    .getByRole("button", { exact: true, name: "Medium" })
    .click()
    .catch(() => undefined);
}

async function paletteScene(name, title) {
  await ensureDrive();
  await record(name, title, async () => {
    await caption("Settings", "Hold the menu, open Settings");
    await openMaintenance();
    await click(left.getByRole("dialog").getByRole("button", { name: /^Settings/ }));
    // The settings panel is a screen of its own, not the maintenance dialog.
    await left.getByRole("button", { name: /Save and resume/ }).waitFor();
    await pause(500);
    await caption("Colours", "Dark: the whole screen recolours");
    await click(left.getByRole("button", { name: /^Dark$/ }));
    await pause(2200);
    await caption("Colours", "And back to the app's own palette");
    await click(left.getByRole("button", { name: /Same as app|Same as role/ }).first());
    await pause(1200);
    await click(left.getByRole("button", { name: /Save and resume/ }));
    await left.locator('[data-testid="runtime-artboard"][data-screen-id="manager_drive_operator"]').waitFor();
    await pause(1200);
  });
}

async function scanScene(name, title) {
  await ensureDrive();
  await openMaintenance();
  await left
    .getByRole("dialog")
    .getByRole("button", { name: /^Settings/ })
    .click();
  await left.getByRole("button", { name: /Save and resume/ }).waitFor();
  await record(name, title, async () => {
    await caption("Input method", "Scan: one switch steps through the controls");
    await pause(500);
    await click(left.getByRole("button", { exact: true, name: "Scan" }));
    await pause(900);
    await click(left.getByRole("button", { name: /Save and resume/ }));
    await left.locator('[data-testid="runtime-artboard"][data-screen-id="manager_drive_operator"]').waitFor();
    await caption("Scanning", "The highlight moves from control to control; the switch activates the current one");
    await moveTo(1180, 640, 700);
    await pause(8000);
  });
  await left.context().close();
  left = null;
}

async function builderCreateScene(name, title) {
  await newOperator({ width: 1600, height: 1000 });
  await left.goto(dashboardUrl, { waitUntil: "networkidle" });
  if (!right) {
    await openRobotView("debug");
  }
  const appName = `Demo ${new Date().toISOString().slice(11, 16).replace(":", "")}`;
  builderCreateScene.appName = appName;
  await record(name, title, async () => {
    await caption("Builder", "Create an app from the Operator controls starter");
    await click(left.getByRole("button", { name: "Builder: Compose screens" }), 450);
    await click(left.getByRole("button", { exact: true, name: "Apps" }), 450);
    const nameField = left.getByLabel("New app name");
    await nameField.scrollIntoViewIfNeeded();
    await click(nameField, 450);
    await left.keyboard.press("ControlOrMeta+A");
    await left.keyboard.type(appName, { delay: 45 });
    await left.getByLabel("Starter screen").selectOption("operator-control");
    await click(left.getByRole("button", { name: "Create guided app" }), 450);
    await left.getByRole("heading", { name: appName }).waitFor({ timeout: 20000 });
    await caption("App created", "Its starter screen is ready; save the app");
    await pause(800);
    const save = left.getByRole("button", { name: /^Save app$/ });
    if ((await save.count()) > 0 && (await save.first().isEnabled())) {
      await click(save.first(), 450);
    }
    await pause(1200);
  });
}

async function builderPlaceScene(name, title) {
  if (!builderCreateScene.appName) {
    console.log("skipping builder-place: the builder-create scene did not run");
    return;
  }
  const open = left.getByRole("button", { name: /screen builder$/ }).first();
  await open.waitFor({ timeout: 20000 });
  await record(name, title, async () => {
    await caption("Screen builder", "Open the starter screen");
    await click(open, 450);
    await left.locator(".builder-widget-palette").first().waitFor({ timeout: 20000 });
    await pause(500);
    await caption("Palette", "Add a Command button, place it on the panel, save");
    await click(left.getByRole("button", { name: /^Add Command button widget/ }), 450);
    await pause(500);
    await drag(left.getByRole("button", { name: /^Select and move .* widget$/ }).last(), [
      { dx: -260, dy: 230, ms: 900 },
    ]);
    await pause(500);
    await click(left.getByRole("button", { name: /^Save changes$/ }), 450);
    await pause(1500);
  });
  await left.context().close();
  left = null;
}

async function newAppScene(name, title) {
  const appName = builderCreateScene.appName;
  if (!appName) {
    console.log("skipping new-app-drives: the builder-create scene did not run");
    return;
  }
  await newOperator();
  await left.goto(dashboardUrl, { waitUntil: "networkidle" });
  await click(left.getByRole("button", { name: "Runtime: Operate and inspect" }));
  await left.getByRole("button", { exact: true, name: appName }).waitFor();
  if (!right) {
    await openRobotView("debug");
  }
  await record(name, title, async () => {
    await caption("Library", `Open ${appName}, the app just built`);
    await click(left.getByRole("button", { exact: true, name: appName }));
    await pause(500);
    if (await left.locator(".runtime-library-open").isDisabled()) {
      await click(left.locator(".runtime-library-roles").getByRole("button").first());
    }
    await click(left.locator(".runtime-library-open"));
    await left.locator('[data-testid="runtime-artboard"]').waitFor({ timeout: 15000 });
    await waitReady(left);
    await caption("READY", "Its pad drives the same arm");
    await pause(800);
    const release = await pushPad("Translation", { x: 0, y: 2 });
    await pause(robot.pushMs);
    await release();
    await pause(800);
    const close = await offerGripper("Close");
    await caption("Gripper", "And its gripper button closes the fingers");
    await click(close);
    await pause(robot.gripperMs);
  });
  await strokeBack("Translation", { x: 0, y: -2 }, robot.pushMs);
  const open = await offerGripper("Open");
  await open.click();
  await left.waitForTimeout(800);
}

// ---- Pages ----

async function newOperator(viewport = { width: 1280, height: 720 }) {
  if (left) {
    await left
      .context()
      .close()
      .catch(() => undefined);
  }
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  await context.addInitScript(installDemoOverlay);
  left = await context.newPage();
  left.on("pageerror", (error) => console.error(`operator page error: ${error.message}`));
  cursor = { x: viewport.width / 2, y: viewport.height / 2 };
  await startCapture(left, "left", viewport);
}

/** The operator app on its Drive screen, opening it when no operator page exists. */
async function ensureDrive(viewKind = "debug", preset = "standard") {
  if (!left) {
    await newOperator();
    await openRuntimeApp(left, dashboardUrl, {
      appName: robot.app,
      roleName: "Operator",
      layoutId: "manager_drive_operator",
    });
  }
  const drive = left.locator('[data-testid="runtime-artboard"][data-screen-id="manager_drive_operator"]');
  if ((await drive.count()) === 0) {
    await openScreen("Drive · Operator", "manager_drive_operator");
  }
  if (!right || right.kind !== viewKind || right.preset !== preset) {
    await openRobotView(viewKind, preset);
  }
}

/** Bloom Debug's Robot view, or the Widget Lab's Robot screen (it draws the shared-control goals). */
async function openRobotView(kind, preset = "standard") {
  if (right) {
    if (right.kind === kind && right.preset === preset) {
      return;
    }
    await right
      .context()
      .close()
      .catch(() => undefined);
    right = null;
  }
  const viewport = { width: 1920, height: 1080 };
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`view page error: ${error.message}`));
  page.kind = kind;
  page.preset = preset;
  const view = robot.view[preset];
  const app = kind === "lab" ? { appName: "Widget Lab" } : { appName: "Bloom Debug" };
  await openRuntimeApp(page, viewUrl, app);
  const dialog = page.getByRole("dialog", { name: "Maintenance" });
  await holdOn(page, page.locator(".runtime-kiosk-maintenance"), 1700);
  await dialog.waitFor();
  await dialog
    .getByRole("navigation", { name: "Switch runtime screen" })
    .getByRole("button", { exact: true, name: kind === "lab" ? "Robot" : "Robot view" })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const stage = page.locator(".bloom-robot-3d-stage");
  await stage.waitFor();
  await page.waitForFunction(
    () => document.querySelector(".bloom-robot-3d-stage")?.getAttribute("data-model") === "ready",
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(800);
  await page
    .locator(".bloom-robot-3d-fit")
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(400);
  const box = await stage.boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Closer than the fit (wheel), the target panned (right drag) and a touch around (left drag): the fit alone
  // leaves the arm small and low in the wide stage.
  await page.mouse.move(centre.x, centre.y);
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.wheel(0, view.zoom / 12);
    await page.waitForTimeout(60);
  }
  if (view.pan.dx || view.pan.dy) {
    await page.mouse.down({ button: "right" });
    await page.mouse.move(centre.x + view.pan.dx, centre.y + view.pan.dy, { steps: 15 });
    await page.mouse.up({ button: "right" });
  }
  if (view.orbit.dx || view.orbit.dy) {
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + view.orbit.dx, centre.y + view.orbit.dy, { steps: 15 });
    await page.mouse.up();
  }
  if (view.zoomMore) {
    await page.mouse.move(centre.x, centre.y);
    for (let step = 0; step < 9; step += 1) {
      await page.mouse.wheel(0, view.zoomMore / 9);
      await page.waitForTimeout(60);
    }
  }
  await page.waitForTimeout(500);
  const width = Math.min(box.width, Math.round(box.height * 1.15));
  rightCrop = {
    x: Math.round(box.x + (box.width - width) / 2),
    y: Math.round(box.y),
    w: width % 2 ? width - 1 : width,
    h: Math.round(box.height) % 2 ? Math.round(box.height) - 1 : Math.round(box.height),
  };
  right = page;
  await startCapture(page, "right", viewport);
  console.log(`robot view (${kind}, ${preset}) ready, stage ${JSON.stringify(box)}, crop ${JSON.stringify(rightCrop)}`);
}

// ---- Capture ----

async function startCapture(page, side, viewport) {
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frameCount += 1;
    const file = resolve(workDir, "frames", `${side}-${String(frameCount).padStart(7, "0")}.jpg`);
    frames[side].push({ file, time: metadata.timestamp, w: viewport.width, h: viewport.height });
    pendingWrites.push(writeFile(file, Buffer.from(data, "base64")).catch(() => undefined));
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", {
    everyNthFrame: 1,
    format: "jpeg",
    maxHeight: viewport.height,
    maxWidth: viewport.width,
    quality: 78,
  });
  page.once("close", () => cdp.send("Page.stopScreencast").catch(() => undefined));
}

async function record(name, title, run) {
  // A still page emits no screencast frame, so nudge both once so the scene has a first frame.
  await Promise.all(
    [left, right].filter(Boolean).map((page) => page.evaluate(() => document.body.getBoundingClientRect())),
  );
  const start = Date.now() / 1000;
  const leftSize = { w: left.viewportSize().width, h: left.viewportSize().height };
  const crop = { ...rightCrop };
  await run();
  const end = Date.now() / 1000;
  scenes.push({ crop, end, leftSize, name, robot: robotKey, start, title });
  console.log(`recorded ${name}: ${(end - start).toFixed(1)} s`);
}

// ---- Compose ----

async function compose(scene) {
  const dir = resolve(workDir, scene.name);
  await rm(dir, { force: true, recursive: true });
  await mkdir(resolve(dir, "L"), { recursive: true });
  await mkdir(resolve(dir, "R"), { recursive: true });
  const ticks = Math.floor((scene.end - scene.start) * FPS);
  const pick = (list, t) => {
    let chosen = null;
    for (const frame of list) {
      if (frame.time <= t) {
        chosen = frame;
      } else {
        break;
      }
    }
    return chosen ?? list.find((frame) => frame.time > t) ?? null;
  };
  const leftFrames = frames.left.filter((f) => f.w === scene.leftSize.w && f.h === scene.leftSize.h);
  for (let index = 0; index < ticks; index += 1) {
    const t = scene.start + index / FPS;
    const l = pick(leftFrames, t);
    const r = pick(frames.right, t);
    if (!l || !r) {
      throw new Error(`${scene.name}: no frame at ${t}`);
    }
    await symlink(l.file, resolve(dir, "L", `${String(index + 1).padStart(6, "0")}.jpg`));
    await symlink(r.file, resolve(dir, "R", `${String(index + 1).padStart(6, "0")}.jpg`));
  }
  const stem = `${scene.robot}-${scene.name}`;
  const mp4 = resolve(outputDir, `${stem}.mp4`);
  const gif = resolve(outputDir, `${stem}.gif`);
  const captionFile = resolve(dir, "caption.txt");
  await writeFile(captionFile, `${robot.label} · ${scene.title}`);
  const { x, y, w, h } = scene.crop;
  const filter = [
    `[0:v]scale=-2:${SIDE_HEIGHT}:flags=lanczos[l]`,
    `[1:v]crop=${w}:${h}:${x}:${y},scale=-2:${SIDE_HEIGHT}:flags=lanczos[r]`,
    `[l][r]hstack=inputs=2,scale=${OUT_WIDTH}:-2:flags=lanczos,pad=iw:ih+${CAPTION_HEIGHT}:0:${CAPTION_HEIGHT}:color=0x1f2a24`,
    `drawtext=fontfile=${FONT}:textfile=${captionFile}:fontcolor=0xfbf7ef:fontsize=22:x=16:y=(${CAPTION_HEIGHT}-text_h)/2`,
    "format=yuv420p",
  ].join(",");
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(FPS),
    "-i",
    resolve(dir, "L", "%06d.jpg"),
    "-framerate",
    String(FPS),
    "-i",
    resolve(dir, "R", "%06d.jpg"),
    "-filter_complex",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    mp4,
    "-filter_complex",
    `[0:v]fps=${FPS},split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    gif,
  ]);
  const duration = ticks / FPS;
  const checks = resolve(outputDir, "frames");
  await mkdir(checks, { recursive: true });
  for (const [label, at] of [
    ["a", 0.4],
    ["b", duration / 2],
    ["c", Math.max(0, duration - 0.6)],
  ]) {
    await run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      at.toFixed(2),
      "-i",
      mp4,
      "-frames:v",
      "1",
      resolve(checks, `${stem}-${label}.png`),
    ]);
  }
  console.log(`composed ${stem}: ${duration.toFixed(1)} s, ${ticks} frames`);
}

// ---- Gestures with a visible cursor ----

async function moveTo(x, y, milliseconds = 600) {
  const steps = Math.max(6, Math.round(milliseconds / 16));
  const start = cursor;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    await left.mouse.move(start.x + (x - start.x) * eased, start.y + (y - start.y) * eased);
    await left.waitForTimeout(16);
  }
  cursor = { x, y };
}

async function centreOf(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`No bounds for ${locator}`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function click(locator, moveMs = 600) {
  const target = await centreOf(locator);
  await moveTo(target.x, target.y, moveMs);
  await pause(150);
  await left.mouse.down();
  await left.waitForTimeout(90);
  await left.mouse.up();
  await pause(moveMs >= 600 ? 300 : 150);
}

async function holdButton(locator, milliseconds) {
  const target = await centreOf(locator);
  await moveTo(target.x, target.y);
  await pause(150);
  await left.mouse.down();
  await left.waitForTimeout(milliseconds);
  await left.mouse.up();
}

/** A press without the animated cursor, for the viewer page. */
async function holdOn(page, locator, milliseconds) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(milliseconds);
  await page.mouse.up();
}

async function drag(locator, segments) {
  const origin = await centreOf(locator);
  await moveTo(origin.x, origin.y);
  await pause(150);
  await left.mouse.down();
  for (const segment of segments) {
    await moveTo(origin.x + segment.dx, origin.y + segment.dy, segment.ms ?? 700);
  }
  await pause(200);
  await left.mouse.up();
}

/** Press the pad's centre and slide out to the deflection; the returned function releases it. */
async function pushPad(name, deflection, moveMs = 500) {
  const pad = left.getByRole("application", { name });
  const box = await pad.boundingBox();
  const radius = Math.min(box.width, box.height) / 2;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await moveTo(centre.x, centre.y, moveMs);
  await left.mouse.down();
  await moveTo(centre.x + deflection.x * radius, centre.y - deflection.y * radius, 260);
  let released = false;
  return async () => {
    if (!released) {
      released = true;
      await left.mouse.up();
    }
  };
}

async function pressSliderEnd(name, end) {
  const root = left.getByRole("slider", { name }).locator('xpath=ancestor::*[contains(@class, "bloom-axis-slider")]');
  const track = root.locator(".bloom-axis-track");
  const vertical = (await root.getAttribute("data-orientation")) === "vertical";
  const box = await track.boundingBox();
  const point = vertical
    ? { x: box.x + box.width / 2, y: end === "positive" ? box.y + 2 : box.y + box.height - 2 }
    : { x: end === "positive" ? box.x + box.width - 2 : box.x + 2, y: box.y + box.height / 2 };
  await moveTo(point.x, point.y, 500);
  await left.mouse.down();
  let released = false;
  return async () => {
    if (!released) {
      released = true;
      await left.mouse.up();
    }
  };
}

/** An unrecorded stroke, to bring the arm back where the next scene expects it. */
async function strokeBack(name, deflection, milliseconds) {
  const release = await pushPad(name, deflection);
  await left.waitForTimeout(milliseconds);
  await release();
  await ros.waitFor(TWIST, (data) => isZero(data), { since: Date.now(), timeoutMs: 3000 }).catch(() => undefined);
  await left.waitForTimeout(500);
}

async function offerGripper(action) {
  const name = (verb) => new RegExp(`^Gripper: ${verb} gripper`);
  const wanted = left.getByRole("button", { name: name(action) });
  const other = left.getByRole("button", { name: name(action === "Close" ? "Open" : "Close") });
  await wanted.or(other).first().waitFor({ timeout: 15000 });
  if ((await wanted.count()) === 0) {
    await other.click();
    await wanted.waitFor({ timeout: 15000 });
  }
  return wanted;
}

async function switchBehaviour(title, wanted) {
  const labels = {
    "Assist to goals": { off: "Not assisting", on: "Assisting" },
    "Speed up with intent": { off: "Plain speed", on: "Speeding up" },
  }[title];
  const choice = left.getByRole("button", { exact: false, name: new RegExp(`^${title}: ${labels[wanted]}`) });
  const buttons = left.getByRole("button", { name: new RegExp(`^${title}:`) });
  if ((await buttons.count()) > 1) {
    await click(choice);
    return;
  }
  const card = buttons.first().locator("xpath=ancestor::*[@data-command-state][1]");
  if ((await card.getAttribute("data-command-state")) === wanted) {
    return;
  }
  await click(buttons.first());
}

async function forwardDirection() {
  const since = Date.now();
  const release = await pushPad("Translation", { x: 0, y: 2 });
  const wire = await ros.waitFor(TWIST, (data) => !isZero(data), { since });
  await release();
  await ros.waitFor(TWIST, (data) => isZero(data), { since: Date.now(), timeoutMs: 2000 });
  await left.waitForTimeout(500);
  const norm = Math.hypot(wire.linear.x, wire.linear.y, wire.linear.z) || 1;
  return { x: wire.linear.x / norm, y: wire.linear.y / norm, z: wire.linear.z / norm };
}

async function openMaintenance() {
  const dialog = left.getByRole("dialog", { name: "Maintenance" });
  if (!(await dialog.isVisible())) {
    await holdButton(left.locator(".runtime-kiosk-maintenance"), 1700);
  }
  await dialog.waitFor();
  await pause(500);
}

async function openScreen(title, layoutId) {
  await openMaintenance();
  await click(
    left
      .getByRole("dialog", { name: "Maintenance" })
      .getByRole("navigation", { name: "Switch runtime screen" })
      .getByRole("button", { exact: true, name: title }),
  );
  await left.getByRole("dialog", { name: "Maintenance" }).waitFor({ state: "hidden" });
  await left.locator(`[data-testid="runtime-artboard"][data-screen-id="${layoutId}"]`).waitFor();
  await waitReady(left);
  await pause(400);
}

function pause(milliseconds) {
  return left.waitForTimeout(milliseconds);
}

async function caption(heading, text) {
  console.log(`  ${heading}: ${text}`);
  await left.evaluate(([h, t]) => window.__bloomDemoCaption?.(h, t), [heading, text]).catch(() => undefined);
}

function isZero(twist) {
  return [twist.linear, twist.angular].every((v) => Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 1e-9);
}

function run(command, commandArgs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, { stdio: ["ignore", "ignore", "pipe"] });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk;
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise()
        : rejectPromise(new Error(`${command} exited ${code}: ${errorOutput.slice(-2000)}`)),
    );
  });
}

function probeSource() {
  return `
import json, rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped, TwistStamped
from std_msgs.msg import Float64MultiArray, String
from sensor_msgs.msg import JointState
rclpy.init()
node = Node("bloom_demo_gifs_probe")
def emit(topic, data):
    print(json.dumps({"topic": topic, "data": data}), flush=True)
node.create_subscription(PoseStamped, "${POSE}", lambda m: emit("${POSE}", {"position": {"x": m.pose.position.x, "y": m.pose.position.y, "z": m.pose.position.z}}), 10)
node.create_subscription(TwistStamped, "${TWIST}", lambda m: emit("${TWIST}", {"linear": {"x": m.twist.linear.x, "y": m.twist.linear.y, "z": m.twist.linear.z}, "angular": {"x": m.twist.angular.x, "y": m.twist.angular.y, "z": m.twist.angular.z}}), 10)
node.create_subscription(JointState, "${JOINT_TARGET}", lambda m: emit("${JOINT_TARGET}", {"name": list(m.name), "position": list(m.position)}), 10)
node.create_subscription(JointState, "${JOINT_STATES}", lambda m: emit("${JOINT_STATES}", {"name": list(m.name), "position": list(m.position)}), 10)
node.create_subscription(String, "${MODE}", lambda m: emit("${MODE}", {"data": m.data}), 10)
node.create_subscription(Float64MultiArray, "${CONFIDENCES}", lambda m: emit("${CONFIDENCES}", {"data": list(m.data), "ids": [label for d in m.layout.dim for label in d.label.split(",")]}), 10)
try:
    rclpy.spin(node)
except KeyboardInterrupt:
    pass
`;
}

/** Runs in the operator page: a cursor that follows the pointer and a lower-third caption. */
function installDemoOverlay() {
  const install = () => {
    if (document.getElementById("bloom-demo-cursor")) {
      return;
    }
    const style = document.createElement("style");
    style.textContent = `
      #bloom-demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
        transform: translate(-100px, -100px); }
      #bloom-demo-cursor svg { position: absolute; left: -3px; top: -2px; filter: drop-shadow(0 2px 3px rgb(0 0 0 / 35%)); }
      #bloom-demo-cursor .ring { position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 50%;
        background: rgb(233 196 106 / 45%); border: 2px solid rgb(49 73 63 / 70%); transform: scale(0.3); opacity: 0;
        transition: transform 160ms ease-out, opacity 160ms ease-out; }
      #bloom-demo-cursor.is-down .ring { transform: scale(1); opacity: 1; }
      #bloom-demo-caption { position: fixed; left: 24px; bottom: 24px; z-index: 2147483646; pointer-events: none;
        max-width: 640px; padding: 12px 18px; border-radius: 14px; background: rgb(31 42 36 / 88%); color: #fbf7ef;
        font: 500 18px/1.3 system-ui, sans-serif; box-shadow: 0 10px 30px rgb(0 0 0 / 25%);
        opacity: 0; transform: translateY(12px); transition: opacity 240ms ease, transform 240ms ease; }
      #bloom-demo-caption.is-visible { opacity: 1; transform: none; }
      #bloom-demo-caption strong { display: block; margin-bottom: 2px; color: #e9c46a; font-size: 13px;
        letter-spacing: 0.12em; text-transform: uppercase; }
    `;
    const pointer = document.createElement("div");
    pointer.id = "bloom-demo-cursor";
    pointer.innerHTML =
      '<span class="ring"></span><svg width="30" height="30" viewBox="0 0 30 30"><path d="M4 2 L4 24 L10 18.5 L14 27 L18 25.3 L14.2 17 L22 17 Z" fill="#1f2a24" stroke="#fbf7ef" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    const captionBox = document.createElement("div");
    captionBox.id = "bloom-demo-caption";
    document.documentElement.append(style, pointer, captionBox);
    const place = (x, y) => {
      pointer.style.transform = `translate(${x}px, ${y}px)`;
      try {
        sessionStorage.setItem("bloom-demo-cursor", JSON.stringify([x, y]));
      } catch {}
    };
    try {
      const saved = JSON.parse(sessionStorage.getItem("bloom-demo-cursor") ?? "null");
      if (saved) {
        place(saved[0], saved[1]);
      }
    } catch {}
    window.addEventListener("pointermove", (event) => place(event.clientX, event.clientY), true);
    window.addEventListener("pointerdown", () => pointer.classList.add("is-down"), true);
    window.addEventListener("pointerup", () => pointer.classList.remove("is-down"), true);
    window.addEventListener("pointercancel", () => pointer.classList.remove("is-down"), true);
    let hideTimer;
    window.__bloomDemoCaption = (heading, text) => {
      captionBox.innerHTML = "";
      const strong = document.createElement("strong");
      strong.textContent = heading;
      captionBox.append(strong, document.createTextNode(text));
      captionBox.classList.add("is-visible");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => captionBox.classList.remove("is-visible"), 4500);
    };
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
}
