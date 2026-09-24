/**
 * Drive a Manager app on a live simulated robot and verify each gesture on the ROS graph, not only in the page.
 *
 *   BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-sim-e2e-checks.mjs --robot explorer|kinova [--out dir]
 *
 * Needs a sourced ROS environment on the simulation's ROS_DOMAIN_ID. scripts/ros-sim-e2e.sh sets all of this up.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import {
  addPaletteWidgets,
  configureHoldButton,
  configureRosToggle,
  createGuidedApp,
  HOLD_BUTTON,
  openScreenBuilder,
  ROS_TOGGLE,
  saveScreenDraft,
} from "./lib/builder-authoring.mjs";
import {
  assert,
  createChecks,
  fmtVector,
  hold,
  isZeroTwist,
  newPage as newBrowserPage,
  openRuntimeApp,
  readArg as readArgument,
  skip,
  waitReady,
} from "./lib/e2e-checks.mjs";
import { rosParameter, startRosProbe } from "./lib/ros-probe.mjs";
import { STACK } from "./lib/stack-topics.mjs";

const args = process.argv.slice(2);
const readArg = (flag) => readArgument(args, flag);
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5173";
const robotKey = readArg("--robot");
const outputDir = resolve(readArg("--out") ?? `/tmp/bloom-ros-sim-e2e-${robotKey}`);
const screenDir = resolve(outputDir, "screens");

const ROBOTS = {
  explorer: {
    app: "Explorer Manager",
    joints: 6,
    // command_max_linear_velocity is 0.15 m/s, and a Fast segment left from a demo doubles it.
    driveHoldMs: 800,
    gripper: { close: [1.1], open: [0.2] },
    speed: { slow: 0.08, medium: 0.15 },
    goHome: true,
    // Named rather than tuned around: from the home pose a +angular.y command turns the hand about
    // (-x, +y) at ~72%, and +linear.y lands anywhere from 80% to 98% along y, run after run. The wire
    // is right each time; the compromise is qontrol's at that pose.
    offAxis: ["Right", "Roll right"],
  },
  kinova: {
    app: "Kinova Manager",
    joints: 7,
    // command_max_linear_velocity is 0.05 m/s on the gen3.
    driveHoldMs: 2500,
    gripper: { close: [0.8], open: [0.0] },
    speed: { slow: 0.025, medium: 0.05 },
    goHome: false,
    // Mock hardware starts the gen3 fully upright, where Up has nowhere to go.
    settle: { control: "Height", end: "negative" },
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
  gripper: GRIPPER,
  maxLinearSpeed: MAX_LINEAR,
  mode: MODE,
  jointTarget: JOINT_TARGET,
  cameraImage: CAMERA,
} = STACK;
const GESTURE = "/ui/widget_lab/gesture";
const MARKERS = "/widget_lab/markers";
const TARGET = "/widget_lab/target";
const MIN_DISPLACEMENT_M = 0.03;
const MIN_ROTATION_RAD = 0.05;
/**
 * One end of each Drive control, as the operator reads it. The wire must carry one unit component and the
 * simulated hand must move along that component in the base frame; which base axis a word drives is the
 * seed's axis_mapping, reported here so it can be tuned against the arm.
 */
const DRIVE_GESTURES = [
  { word: "Forward", control: "Translation", pad: { x: 0, y: 2 } },
  { word: "Right", control: "Translation", pad: { x: 2, y: 0 } },
  { word: "Up", control: "Height", end: "positive" },
  { word: "Tilt up", control: "Rotation", pad: { x: 0, y: 2 } },
  { word: "Roll right", control: "Rotation", pad: { x: 2, y: 0 } },
];

await mkdir(screenDir, { recursive: true });
const ros = await startRosProbe({ source: probeSource(), readyTopic: POSE });
const gestures = {};

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const { check, results, shot } = createChecks({ screenDir, prefix: `${robotKey}-`, recover });
const newPage = (viewport) => newBrowserPage(browser, viewport);
const openApp = (page, appName, roleName, layoutId) =>
  openRuntimeApp(page, dashboardUrl, { appName, roleName, layoutId });
try {
  await operatorSession();
  await benchSession();
  await debugSession();
  await authoredSession();
  await labSession();
} finally {
  await browser.close();
  ros.stop();
}

await writeFile(resolve(outputDir, "results.json"), `${JSON.stringify({ robot: robotKey, results }, null, 2)}\n`);
const failed = results.filter((result) => result.status === "fail");
console.log(`\n${robotKey}: ${results.length - failed.length}/${results.length} checks passed (${outputDir})`);
process.exit(failed.length > 0 ? 1 : 0);

// ---- Sessions ----

async function operatorSession() {
  const { context, page } = await newPage({ width: 1280, height: 720 });
  try {
    const opened = await check(page, "library-opens-operator", async () => {
      await openApp(page, robot.app, "Operator", "manager_drive_operator");
      await shot(page, "drive-operator");
      return "manager_drive_operator, READY";
    });
    if (!opened) {
      return;
    }

    await check(page, "translation-moves-ee-pose", async () => {
      const gesture = await driveAndMeasure(page, "operator");
      gestures.operator = gesture.twist;
      return gesture.summary;
    });

    await check(page, "pivot-left-turns-hand-left", async () => pivotAndMeasure(page));

    await check(page, "drive-controls-move-the-hand-as-labelled", async () => {
      if (robot.settle) {
        const release = await pressSliderEnd(page, robot.settle.control, robot.settle.end);
        await page.waitForTimeout(robot.driveHoldMs);
        await release();
        await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
        await page.waitForTimeout(800);
      }
      const rows = [];
      for (const gesture of DRIVE_GESTURES) {
        rows.push(await driveGestureAndMeasure(page, gesture));
      }
      const table = rows.map((row) => row.summary).join("; ");
      // A named word may be off or may follow: the Explorer's Right does either from one run to the next.
      const known = new Set(robot.offAxis ?? []);
      const unexpected = rows.filter((row) => !row.ok && !known.has(row.word)).map((row) => row.word);
      assert(unexpected.length === 0, `${unexpected.join(", ")} did not follow the wire: ${table}`);
      return table;
    });

    await check(page, "gripper-toggle-publishes", async () => {
      const close = page.getByRole("button", { name: /^Gripper: Close gripper/ });
      let since = Date.now();
      await close.click();
      const closed = await ros.waitFor(GRIPPER, (data) => sameArray(data.data, robot.gripper.close), { since });
      since = Date.now();
      await page.getByRole("button", { name: /^Gripper: Open gripper/ }).click();
      const opened = await ros.waitFor(GRIPPER, (data) => sameArray(data.data, robot.gripper.open), { since });
      return `close ${JSON.stringify(closed.data)}, open ${JSON.stringify(opened.data)}`;
    });

    await check(page, "snake-hold-publishes-pressed-and-released", async () => {
      // The momentary command button end to end: one payload while held, the other on release.
      const since = Date.now();
      await hold(page, page.getByRole("button", { name: "Hold snake" }), 600);
      await ros.waitFor(MODE, (data) => data.data === "geometric/both", { since });
      const modes = ros.since(MODE, since).map((message) => message.data.data);
      assert(
        modes.indexOf("geometric/snake") >= 0 && modes.lastIndexOf("geometric/both") > modes.indexOf("geometric/snake"),
        `mode requests ${modes.join(" -> ")}`,
      );
      return `held: geometric/snake, released: geometric/both (${modes.join(" -> ")})`;
    });

    await check(page, "speed-segment-publishes", async () => {
      const subscribers = ros.subscribers(MAX_LINEAR);
      if (subscribers.length === 0) {
        return skip(`no subscriber on ${MAX_LINEAR}`);
      }
      const group = page.getByRole("group", { name: "Max speed" });
      let since = Date.now();
      await group.getByRole("button", { exact: true, name: "Slow" }).click();
      const slow = await ros.waitFor(MAX_LINEAR, (data) => near(data.data, robot.speed.slow), { since });
      since = Date.now();
      await group.getByRole("button", { exact: true, name: "Medium" }).click();
      await ros.waitFor(MAX_LINEAR, (data) => near(data.data, robot.speed.medium), { since });
      return `Slow ${slow.data} m/s, subscribed by ${subscribers.join(", ")}`;
    });

    await check(page, "stop-latches-and-hold-resumes", async () => {
      const since = Date.now();
      await page.getByRole("button", { name: "Stop the robot" }).click();
      const resume = page.getByRole("button", { name: "Hold for one second to resume" });
      await resume.waitFor();
      const latched = await readStop(page);
      assert(latched.stopped && latched.asserted, `backend latch reads ${JSON.stringify(latched)}`);
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since });
      await ros.waitFor(MODE, (data) => data.data === "behaviour/passthrough", { since });
      const push = await pressJoystick(page, page.getByRole("application", { name: "Translation" }), { x: 0, y: 2 });
      await page.waitForTimeout(800);
      await shot(page, "stopped");
      await push();
      const moving = ros.since(TWIST, since).filter((message) => !isZeroTwist(message.data));
      assert(moving.length === 0, `${moving.length} non-zero twists reached ROS while stopped`);
      await hold(page, resume, 1300);
      await page.getByRole("button", { name: "Stop the robot" }).waitFor();
      const released = await readStop(page);
      assert(!released.stopped, "backend latch still engaged after the hold");
      return "latched with zero twist and passthrough, Translation inert while stopped, resumed after a 1.3 s hold";
    });

    await check(page, "maintenance-holds-zeros", async () => {
      // Drive from the keyboard so the pointer stays free for the maintenance hold.
      await page.getByRole("application", { name: "Translation" }).focus();
      const since = Date.now();
      for (let step = 0; step < 4; step += 1) {
        await page.keyboard.down("ArrowUp");
      }
      await ros.waitFor(TWIST, (data) => !isZeroTwist(data), { since });
      await openMaintenance(page);
      const heldAt = Date.now();
      await page.getByRole("status").filter({ hasText: "HELD FOR MAINTENANCE" }).first().waitFor();
      await page.waitForTimeout(1500);
      await shot(page, "maintenance");
      await page.keyboard.up("ArrowUp");
      const moving = ros.since(TWIST, heldAt + 100).filter((message) => !isZeroTwist(message.data));
      assert(moving.length === 0, `${moving.length} non-zero twists while maintenance was open`);
      const last = ros.since(TWIST, since).at(-1);
      assert(last && isZeroTwist(last.data), "the last twist before maintenance was not zero");
      await page
        .getByRole("dialog", { name: "Maintenance" })
        .getByRole("button", { name: /^Resume operating/ })
        .click();
      await page.getByRole("dialog", { name: "Maintenance" }).waitFor({ state: "hidden" });
      await waitReady(page);
      return "keyboard drive zeroed by the hold, no motion while held, READY after resume";
    });

    await check(page, "joystick-lab-stamps-hybrid-frame", async () => {
      await openScreen(page, "Joystick lab", "manager_joystick_lab");
      await page.getByRole("button", { name: /^Hybrid:/ }).click();
      await page.getByRole("button", { name: /^Hybrid: requested/ }).waitFor();
      const since = Date.now();
      const translation = page.getByRole("application", { name: "Translation" });
      const release = await pressJoystick(page, translation, { x: 0, y: 0.5 });
      try {
        const stamped = await ros.waitFor(TWIST, (data) => !isZeroTwist(data) && data.frame_id === "hybrid_frame", {
          since,
        });
        await shot(page, "joystick-lab");
        await release();
        await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now() });
        return `frame_id ${stamped.frame_id}, linear ${fmtVector(stamped.linear)}`;
      } finally {
        await release();
        await page.getByRole("button", { name: /^Base:/ }).click();
      }
    });

    await check(page, "positions-go-home-and-release", async () => {
      await openScreen(page, "Positions", "manager_positions");
      const home = page.getByRole("button", { name: /Send Home/ });
      let homeDetail = "no Go home on this robot";
      if (!robot.goHome) {
        assert((await home.count()) === 0, "this robot's Positions screen must not offer Go home");
      } else {
        const since = Date.now();
        await home.click();
        await page.getByRole("button", { name: /Press again to move/ }).waitFor();
        const firstPress = ros.since(MODE, since).filter((message) => message.data.data.includes("joint_target"));
        assert(firstPress.length === 0, "the first press already dispatched the home target");
        await page.getByRole("button", { name: /Press again to move/ }).click();
        await ros.waitFor(MODE, (data) => data.data === "behaviour/joint_target/home", { since });
        const target = await ros.waitFor(JOINT_TARGET, () => true, { since, timeoutMs: 8000 });
        await page.waitForTimeout(800);
        await shot(page, "positions-home");
        homeDetail = `home dispatched, ${JOINT_TARGET} ${fmtArray(target.position)}`;
      }
      const since = Date.now();
      await page.getByRole("button", { name: /^Cancel the pose/ }).click();
      await ros.waitFor(MODE, (data) => data.data === "behaviour/passthrough", { since });
      if (!robot.goHome) {
        await shot(page, "positions");
      }
      return `${homeDetail}; release sent behaviour/passthrough`;
    });

    await check(page, "robot-feedback-plots", async () => {
      await openScreen(page, "Robot feedback", "manager_feedback");
      await page.locator(".bloom-plot-board-line").first().waitFor({ state: "attached", timeout: 10000 });
      const values = await page.locator(".bloom-value-strip-number").allTextContents();
      const numeric = values.filter((value) => /\d/.test(value));
      assert(numeric.length > 0, `value strip shows no numbers: ${JSON.stringify(values)}`);
      await page.waitForTimeout(1500);
      await shot(page, "robot-feedback");
      return `${await page.locator(".bloom-plot-board-line").count()} plotted series, values ${numeric.join(" ")}`;
    });
  } finally {
    await context.close();
  }
}

async function benchSession() {
  const { context, page } = await newPage({ width: 1280, height: 720 });
  try {
    const opened = await check(page, "library-opens-bench", async () => {
      await openApp(page, robot.app, "Bench", "manager_drive_bench");
      await shot(page, "drive-bench");
      return "manager_drive_bench, READY";
    });
    if (!opened) {
      return;
    }
    await check(page, "snake-gain-parameter-sets", async () => {
      // The live-tuning seam end to end: a slider press reaches the manager's own parameter service.
      const before = await rosParameter("/cartesian_manager", "shapers.snake.gain");
      const slider = page.getByRole("slider", { name: "Snake gain" });
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      const deadline = Date.now() + 8000;
      let after = before;
      while (Date.now() < deadline) {
        after = await rosParameter("/cartesian_manager", "shapers.snake.gain");
        if (after !== before) {
          break;
        }
        await page.waitForTimeout(250);
      }
      assert(after !== before, `shapers.snake.gain stayed at ${before}`);
      return `shapers.snake.gain ${before} -> ${after}`;
    });
    await check(page, "bench-and-operator-publish-same-twist", async () => {
      const gesture = await driveAndMeasure(page, "bench");
      assert(gestures.operator, "no operator gesture to compare with");
      const difference = twistDifference(gestures.operator, gesture.twist);
      assert(
        difference < 1e-3 && gestures.operator.frame_id === gesture.twist.frame_id,
        `operator ${fmtTwist(gestures.operator)} vs bench ${fmtTwist(gesture.twist)}`,
      );
      return `both ${fmtTwist(gesture.twist)}; bench ${gesture.summary}`;
    });
  } finally {
    await context.close();
  }
}

async function debugSession() {
  const { context, page } = await newPage({ width: 1920, height: 1080 });
  try {
    await check(page, "bloom-debug-receives-samples", async () => {
      await openApp(page, "Bloom Debug", undefined, "runtime-topic-monitor");
      const rows = page.locator(".bloom-joint-table tbody tr");
      await rows.nth(robot.joints - 1).waitFor({ timeout: 10000 });
      const positions = await page.locator(".bloom-joint-table tbody tr td:first-of-type").allTextContents();
      const numeric = positions.filter((value) => /^[+-−]?\d/.test(value.trim()));
      assert(numeric.length >= robot.joints, `joint positions not numeric: ${JSON.stringify(positions)}`);
      const jacobian = page.locator("table.bloom-jacobian-grid");
      await jacobian.waitFor({ timeout: 10000 });
      const label = (await jacobian.getAttribute("aria-label")) ?? "";
      const match = /(\d+) by (\d+)$/.exec(label);
      assert(
        match && Number(match[1]) === 6 && Number(match[2]) === robot.joints,
        `Jacobian reads "${label}", expected 6 by ${robot.joints}`,
      );
      await page.locator(".bloom-plot-board-line").first().waitFor({ state: "attached", timeout: 10000 });
      await page.waitForTimeout(1500);
      await shot(page, "bloom-debug");
      return `${await rows.count()} joint rows, Jacobian ${match[1]}x${match[2]}`;
    });
  } finally {
    await context.close();
  }
}

/** What an author builds reaches the graph: the Builder harness stops at the API, this presses the result. */
async function authoredSession() {
  const { context, page } = await newPage({ width: 1600, height: 1000 });
  const appName = `Authored ${Date.now()}`;
  try {
    const authored = await check(page, "builder-authors-a-ros-toggle-and-a-hold-button", async () => {
      await createGuidedApp(page, dashboardUrl, appName);
      await openScreenBuilder(page);
      const added = await addPaletteWidgets(page, ["Toggle", "Command button"]);
      assert(added.length === 2, `only added ${added.join(", ")}`);
      await configureRosToggle(page, ROS_TOGGLE);
      await configureHoldButton(page, HOLD_BUTTON);
      await saveScreenDraft(page);
      await shot(page, "authored-screen");
      return `${appName}: a toggle and a hold button on ${MODE}, saved through the API`;
    });
    if (!authored) {
      return;
    }

    await check(page, "authored-buttons-reach-the-manager", async () => {
      await openRuntimeApp(page, dashboardUrl, { appName });
      let since = Date.now();
      await page.getByRole("button", { name: /Jaco off/ }).click();
      const on = await ros.waitFor(MODE, (data) => data.data === "geometric/jaco", { since });
      await page.getByRole("button", { name: /Jaco on/ }).waitFor({ timeout: 10000 });
      since = Date.now();
      await hold(page, page.getByRole("button", { name: /^Hold snake e2e/ }), 600);
      await ros.waitFor(MODE, (data) => data.data === "geometric/both", { since });
      const modes = ros.since(MODE, since).map((message) => message.data.data);
      assert(
        modes.indexOf("geometric/snake") >= 0 && modes.lastIndexOf("geometric/both") > modes.indexOf("geometric/snake"),
        `mode requests ${modes.join(" -> ")}`,
      );
      await shot(page, "authored-runtime");
      return `toggle -> ${on.data}; hold -> ${modes.join(" -> ")}`;
    });
  } finally {
    await context.close();
  }
}

/** Widget Lab: every kind the palette offers, each bound to the simulation, each pressed or read once. */
async function labSession() {
  // Desktop size: the Robot screen is desktop-class, and the 3D view refuses a tablet screen.
  const { context, page } = await newPage({ width: 1920, height: 1080 });
  try {
    const opened = await check(page, "lab-opens", async () => {
      await openRuntimeApp(page, dashboardUrl, { appName: "Widget Lab", layoutId: "lab-controls" });
      await shot(page, "lab-controls");
      return "Widget Lab, lab-controls, READY";
    });
    if (!opened) {
      return;
    }

    await check(page, "lab-label-joystick-and-height", async () => {
      await page.getByText("Every control on the palette, driven in simulation").waitFor();
      const start = await ros.waitFor(POSE, () => true, { since: Date.now() });
      let since = Date.now();
      const release = await pressJoystick(page, page.getByRole("application", { name: "Translation" }), { x: 0, y: 2 });
      await page.waitForTimeout(robot.driveHoldMs);
      await release();
      const held = ros.since(TWIST, since).filter((message) => !isZeroTwist(message.data));
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      await page.waitForTimeout(800);
      const moved = distance(start.position, ros.latest(POSE).data.position);
      const back = await pressJoystick(page, page.getByRole("application", { name: "Translation" }), { x: 0, y: -2 });
      await page.waitForTimeout(robot.driveHoldMs);
      await back();
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      since = Date.now();
      const up = await pressSliderEnd(page, "Height", "positive");
      await page.waitForTimeout(400);
      await up();
      const lifted = ros.since(TWIST, since).some((message) => message.data.linear.z > 0.5);
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      assert(
        held.length > 0 && moved > MIN_DISPLACEMENT_M,
        `joystick: ${held.length} twists, moved ${(moved * 100).toFixed(1)} cm`,
      );
      assert(lifted, "Height's top end put no +linear.z on the wire");
      return `label shown; joystick moved the hand ${(moved * 100).toFixed(1)} cm; Height sent +linear.z`;
    });

    await check(page, "lab-gesture-pad-publishes", async () => {
      const pad = page.getByRole("button", { name: /^Gesture: choose trajectory gesture/ });
      const box = await pad.boundingBox();
      const since = Date.now();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3, { steps: 6 });
      await page.mouse.up();
      const gesture = await ros.waitFor(GESTURE, (data) => data.data.includes("angleDegrees"), { since });
      const parsed = JSON.parse(gesture.data);
      assert(Number.isFinite(parsed.angleDegrees) && Number.isFinite(parsed.power), `gesture ${gesture.data}`);
      return `${GESTURE} <- ${gesture.data}`;
    });

    await check(page, "lab-gripper-jaco-and-hold", async () => {
      let since = Date.now();
      await page.getByRole("button", { name: /^Gripper: Close gripper/ }).click();
      // The lab ships the Explorer's values on both robots; the shipped app's check holds each robot to its own.
      const closed = await ros.waitFor(GRIPPER, (data) => data.data.length > 0, { since });
      since = Date.now();
      await page.getByRole("button", { name: "Jaco" }).click();
      await ros.waitFor(MODE, (data) => data.data === "geometric/jaco", { since });
      since = Date.now();
      await hold(page, page.getByRole("button", { name: "Hold snake" }), 600);
      await ros.waitFor(MODE, (data) => data.data === "geometric/both", { since });
      const modes = ros.since(MODE, since).map((message) => message.data.data);
      assert(modes.includes("geometric/snake"), `mode requests ${modes.join(" -> ")}`);
      return `gripper ${JSON.stringify(closed.data)}; Jaco -> geometric/jaco; hold -> ${modes.join(" -> ")}`;
    });

    await check(page, "lab-speed-and-pivot", async () => {
      const subscribers = ros.subscribers(MAX_LINEAR);
      let speed = "no subscriber, Slow not asserted";
      if (subscribers.length > 0) {
        const since = Date.now();
        await page.getByRole("group", { name: "Max speed" }).getByRole("button", { exact: true, name: "Slow" }).click();
        const slow = await ros.waitFor(MAX_LINEAR, (data) => near(data.data, 0.08), { since });
        speed = `Slow ${slow.data} m/s`;
      }
      const since = Date.now();
      const release = await pressSliderEnd(page, "Pivot", "negative");
      await page.waitForTimeout(400);
      await release();
      const turned = ros.since(TWIST, since).some((message) => message.data.angular.z > 0.5);
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      assert(turned, "Pivot's left end put no +angular.z on the wire");
      return `${speed}; Pivot left -> +angular.z`;
    });

    await check(page, "lab-readers-show-live-values", async () => {
      await openScreen(page, "Readers", "lab-readers");
      const meter = page.locator('.bloom-gauge-widget[data-live="true"] meter');
      await meter.waitFor({ timeout: 10000 });
      const height = Number(await meter.getAttribute("value"));
      await page.locator(".bloom-topic-plot[data-sample-count]").waitFor({ timeout: 10000 });
      await page.waitForTimeout(1500);
      const samples = Number(await page.locator(".bloom-topic-plot").getAttribute("data-sample-count"));
      await page.locator('.bloom-plot-widget[data-live="true"]').waitFor({ timeout: 10000 });
      const strip = page.getByRole("list", { name: "Hand position" });
      await strip.waitFor({ timeout: 10000 });
      const numbers = (await strip.allTextContents()).join(" ").match(/[+-−]?\d+\.\d+/g) ?? [];
      const since = Date.now();
      await page.getByRole("button", { name: "Ping passthrough" }).click();
      await ros.waitFor(MODE, (data) => data.data === "behaviour/passthrough", { since });
      await page.locator(".bloom-topic-echo", { hasText: "behaviour/passthrough" }).waitFor({ timeout: 10000 });
      await page.locator("li.bloom-event-log-entry", { hasText: "behaviour/passthrough" }).waitFor({ timeout: 10000 });
      await shot(page, "lab-readers");
      assert(height > 0, `gauge reads ${height}`);
      assert(samples > 0, `topic plot has ${samples} samples`);
      assert(numbers.length >= 3, `value strip shows ${numbers.join(" ")}`);
      return `gauge ${height.toFixed(3)} m, topic plot ${samples} samples, plot live, strip ${numbers.slice(0, 3).join(" ")}, echo and log show behaviour/passthrough`;
    });

    await check(page, "lab-positions-and-camera", async () => {
      await openScreen(page, "Robot", "lab-robot");
      const capture = page.getByRole("button", { name: "Capture the robot's current pose" });
      await capture.waitFor({ timeout: 10000 });
      await expect(capture).toBeEnabled({ timeout: 10000 });
      await capture.click();
      const saved = page.getByRole("list", { name: "Saved poses" }).locator("li");
      await saved.first().waitFor({ timeout: 10000 });
      await page.locator("img.bloom-camera-image").waitFor({ timeout: 15000 });
      await shot(page, "lab-robot");
      return `${await saved.count()} pose captured; camera shows a frame from ${CAMERA}`;
    });

    await check(page, "lab-robot-3d-draws-the-running-model", async () => {
      const stage = page.getByRole("img", { name: "Robot 3D view" });
      await page.locator('[aria-label="Robot 3D view"][data-model="ready"]').waitFor({ timeout: 30000 });
      const attribute = async (name) => Number(await stage.getAttribute(name));
      const until = async (name, predicate, timeoutMs) => {
        const deadline = Date.now() + timeoutMs;
        while (!predicate(await attribute(name))) {
          assert(Date.now() < deadline, `${name} stayed at ${await attribute(name)}`);
          await page.waitForTimeout(200);
        }
      };
      // The five markers the probe keeps: arrow, sphere, coloured line strip, a label on the tool link, a cube list.
      await until("data-markers", (count) => count >= 5, 10000);
      const links = await attribute("data-links");
      const meshes = await attribute("data-meshes");
      const meshError = await stage.getAttribute("data-mesh-error");
      assert(links > robot.joints, `${links} links drawn for ${robot.joints} joints`);
      assert(meshes > 0, `no mesh drawn for ${links} links${meshError ? `: ${meshError}` : ""}`);
      assert((await attribute("data-markers-unplaced")) === 0, "a marker's frame was not found on the robot");
      // The sixth is the robot's own mesh, alive three seconds every six: it must arrive, draw, and go.
      const seen = ros.latest("/robot_description")?.data;
      assert(seen?.mesh, "the probe saw no mesh in /robot_description");
      await until("data-markers", (count) => count === 6, 8000);
      await until("data-markers-loading", (count) => count === 0, 5000);
      await page.waitForTimeout(500);
      await shot(page, "lab-robot-3d");
      await until("data-markers", (count) => count === 5, 5000);
      return `URDF from the API with ${links} links and ${meshes} meshes; 5 markers on ${MARKERS}, the tool label on ${seen.tool}, plus ${seen.mesh} drawn and expired`;
    });

    await check(page, "lab-robot-3d-shows-the-target-and-the-pose", async () => {
      const stage = page.locator('[aria-label="Robot 3D view"]');
      await page.locator('[aria-label="Robot 3D view"][data-pose="shown"]').waitFor({ timeout: 10000 });
      await page.locator('[aria-label="Robot 3D view"][data-target="shown"]').waitFor({ timeout: 10000 });
      await shot(page, "lab-robot-3d-target");
      await page.locator('[aria-label="Robot 3D view"][data-target="none"]').waitFor({ timeout: 10000 });
      const joints = await stage.getAttribute("data-joints");
      return `/ee_pose drawn as a triad; the target on ${TARGET} drawn while it lasts and gone on the empty one; ${joints}`;
    });

    await check(page, "lab-robot-3d-draws-the-commanded-motion", async () => {
      const stage = page.locator('[aria-label="Robot 3D view"]');
      const release = await pressSliderEnd(page, "Height", "positive");
      await page.locator('[aria-label="Robot 3D view"][data-command="moving"]').waitFor({ timeout: 5000 });
      await shot(page, "lab-robot-3d-command");
      await release();
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      await page.locator('[aria-label="Robot 3D view"][data-command="still"]').waitFor({ timeout: 5000 });
      // Reported about once a second; the count itself proves joint states moved the model.
      await page.waitForTimeout(1500);
      const updates = Number(await stage.getAttribute("data-joint-updates"));
      assert(updates > 1, `${updates} joint state(s) moved the model while Height was held`);
      return `arrow while Height was held (${await stage.getAttribute("data-links")} links), gone on release; ${updates} joint states moved the model`;
    });
  } finally {
    await context.close();
  }
}

// ---- Gestures ----

/** Full forward deflection, so both layouts clamp to the same twist, then the same stroke back. */
async function driveAndMeasure(page, label) {
  const translation = page.getByRole("application", { name: "Translation" });
  const start = await ros.waitFor(POSE, () => true, { since: Date.now() });
  const since = Date.now();
  const release = await pressJoystick(page, translation, { x: 0, y: 2 });
  await page.waitForTimeout(robot.driveHoldMs);
  const held = ros.since(TWIST, since).filter((message) => !isZeroTwist(message.data));
  await shot(page, `drive-${label}-moving`);
  const releasedAt = Date.now();
  await release();
  assert(held.length > 0, `no non-zero ${TWIST} while Translation was held`);
  await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: releasedAt, timeoutMs: 2000 });
  await page.waitForTimeout(800);
  const end = ros.latest(POSE);
  const displacement = distance(start.position, end.data.position);
  const back = await pressJoystick(page, translation, { x: 0, y: -2 });
  await page.waitForTimeout(robot.driveHoldMs);
  await back();
  await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
  assert(
    displacement > MIN_DISPLACEMENT_M,
    `${POSE} moved ${(displacement * 100).toFixed(1)} cm, expected > ${MIN_DISPLACEMENT_M * 100} cm`,
  );
  return {
    summary: `${held.length} twists over ${robot.driveHoldMs} ms, ${POSE} moved ${(displacement * 100).toFixed(1)} cm, zero on release`,
    twist: held.at(-1).data,
  };
}

async function driveGestureAndMeasure(page, gesture) {
  const start = await ros.waitFor(POSE, () => true, { since: Date.now() });
  const since = Date.now();
  const release = gesture.pad
    ? await pressJoystick(page, page.getByRole("application", { name: gesture.control }), gesture.pad)
    : await pressSliderEnd(page, gesture.control, gesture.end);
  await page.waitForTimeout(robot.driveHoldMs);
  const held = ros.since(TWIST, since).filter((message) => !isZeroTwist(message.data));
  const releasedAt = Date.now();
  await release();
  assert(held.length > 0, `${gesture.word}: no non-zero ${TWIST} while ${gesture.control} was held`);
  const wire = held.at(-1).data;
  await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: releasedAt, timeoutMs: 2000 });
  await page.waitForTimeout(800);
  const end = ros.latest(POSE).data;
  const components = [...axes(wire.linear, "linear"), ...axes(wire.angular, "angular")].filter(
    (c) => Math.abs(c.value) > 1e-6,
  );
  assert(components.length === 1 && Math.abs(components[0].value) > 0.5, `${gesture.word}: wire ${fmtTwist(wire)}`);
  const [component] = components;
  const moved =
    component.part === "linear"
      ? subtract(end.position, start.position)
      : rotationVector(start.orientation, end.orientation);
  const floor = component.part === "linear" ? MIN_DISPLACEMENT_M : MIN_ROTATION_RAD;
  const magnitude = Math.hypot(moved.x, moved.y, moved.z);
  const along = (moved[component.axis] * Math.sign(component.value)) / magnitude;
  // The Explorer's Right lands 89-98% along its axis from the home pose, the QP's compromise, not the wire.
  const ok = magnitude > floor && along > 0.85;
  // the stroke back, so the next gesture starts near the same pose
  const back = gesture.pad
    ? await pressJoystick(page, page.getByRole("application", { name: gesture.control }), {
        x: -gesture.pad.x,
        y: -gesture.pad.y,
      })
    : await pressSliderEnd(page, gesture.control, gesture.end === "positive" ? "negative" : "positive");
  await page.waitForTimeout(robot.driveHoldMs);
  await back();
  await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
  const unit = component.part === "linear" ? "m" : "rad";
  const sign = component.value > 0 ? "+" : "-";
  return {
    ok,
    summary: `${gesture.word} -> ${component.part}.${component.axis} ${sign}1 -> hand ${fmtVector(moved)} ${unit} in base from ${fmtVector(start.position)}, ${(along * 100).toFixed(0)}% along${ok ? "" : " (off)"}`,
    word: gesture.word,
  };
}

async function pressSliderEnd(page, name, end) {
  const root = page.getByRole("slider", { name }).locator('xpath=ancestor::*[contains(@class, "bloom-axis-slider")]');
  const track = root.locator(".bloom-axis-track");
  const vertical = (await root.getAttribute("data-orientation")) === "vertical";
  const box = await track.boundingBox();
  const point = vertical
    ? { x: box.x + box.width / 2, y: end === "positive" ? box.y + 2 : box.y + box.height - 2 }
    : { x: end === "positive" ? box.x + box.width - 2 : box.x + 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  let released = false;
  return async () => {
    if (!released) {
      released = true;
      await page.mouse.up();
    }
  };
}

function axes(vector, part) {
  return ["x", "y", "z"].map((axis) => ({ axis, part, value: vector[axis] }));
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Pivot's left end is +angular.z on the wire, and the hand must yaw the same way about the base z axis. */
async function pivotAndMeasure(page) {
  const track = page
    .getByRole("slider", { name: "Pivot" })
    .locator('xpath=ancestor::*[contains(@class, "bloom-axis-slider")]')
    .locator(".bloom-axis-track");
  const box = await track.boundingBox();
  const start = await ros.waitFor(POSE, () => true, { since: Date.now() });
  const since = Date.now();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(robot.driveHoldMs);
  const held = ros.since(TWIST, since).filter((message) => !isZeroTwist(message.data));
  await shot(page, "drive-pivot-left");
  const releasedAt = Date.now();
  await page.mouse.up();
  assert(held.length > 0, `no non-zero ${TWIST} while Pivot was held`);
  const wire = held.at(-1).data;
  assert(
    wire.angular.z > 0.5 && Math.hypot(wire.linear.x, wire.linear.y, wire.linear.z) < 1e-6,
    `wire ${fmtTwist(wire)}`,
  );
  await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: releasedAt, timeoutMs: 2000 });
  await page.waitForTimeout(800);
  const end = ros.latest(POSE).data;
  const turned = rotationVector(start.orientation, end.orientation);
  assert(
    turned.z > MIN_ROTATION_RAD && Math.abs(turned.z) > 0.7 * Math.hypot(turned.x, turned.y, turned.z),
    `hand turned ${fmtVector(turned)} rad about base axes, expected +z > ${MIN_ROTATION_RAD}`,
  );
  return `wire ${fmtTwist(wire)}; hand yawed ${turned.z.toFixed(3)} rad about base z (${fmtVector(turned)})`;
}

/** The rotation that takes orientation `from` to `to`, as an axis-angle vector in the base frame. */
function rotationVector(from, to) {
  const c = { x: -from.x, y: -from.y, z: -from.z, w: from.w };
  const a = to;
  const q = {
    w: a.w * c.w - a.x * c.x - a.y * c.y - a.z * c.z,
    x: a.w * c.x + a.x * c.w + a.y * c.z - a.z * c.y,
    y: a.w * c.y - a.x * c.z + a.y * c.w + a.z * c.x,
    z: a.w * c.z + a.x * c.y - a.y * c.x + a.z * c.w,
  };
  const sine = Math.hypot(q.x, q.y, q.z);
  const angle = 2 * Math.atan2(sine, q.w);
  const scale = sine > 1e-9 ? angle / sine : 0;
  return { x: q.x * scale, y: q.y * scale, z: q.z * scale };
}

async function pressJoystick(page, locator, deflection) {
  const box = await locator.boundingBox();
  const radius = Math.min(box.width, box.height) / 2;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(center.x + (deflection.x * radius * step) / 8, center.y - (deflection.y * radius * step) / 8);
    await page.waitForTimeout(16);
  }
  let released = false;
  return async () => {
    if (!released) {
      released = true;
      await page.mouse.up();
    }
  };
}

// ---- Runtime helpers ----

async function openMaintenance(page) {
  const dialog = page.getByRole("dialog", { name: "Maintenance" });
  if (!(await dialog.isVisible())) {
    await hold(page, page.locator(".runtime-kiosk-maintenance"), 1700);
  }
  await dialog.waitFor();
}

async function openScreen(page, title, layoutId) {
  await openMaintenance(page);
  await page
    .getByRole("dialog", { name: "Maintenance" })
    .getByRole("navigation", { name: "Switch runtime screen" })
    .getByRole("button", { exact: true, name: title })
    .click();
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor({ state: "hidden" });
  await page.locator(`[data-testid="runtime-artboard"][data-screen-id="${layoutId}"]`).waitFor();
  await waitReady(page);
}

async function readStop(page) {
  const response = await page.request.get(`${dashboardUrl}/api/v1/runtime/stop`);
  assert(response.ok(), `GET /runtime/stop returned ${response.status()}`);
  return response.json();
}

// ---- Check bookkeeping ----

// ---- ROS side ----

/** Leave the runtime usable for the next check: release the pointer, resume STOP, close maintenance. */
async function recover(page) {
  await page.mouse.up().catch(() => undefined);
  const resume = page.getByRole("button", { name: "Hold for one second to resume" });
  if (await resume.isVisible().catch(() => false)) {
    await hold(page, resume, 1300).catch(() => undefined);
  }
  const dialog = page.getByRole("dialog", { name: "Maintenance" });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog
      .getByRole("button", { name: /^Resume operating/ })
      .click()
      .catch(() => undefined);
  }
}

function probeSource() {
  return `
import json, sys, time, rclpy
from rclpy.node import Node
from geometry_msgs.msg import Point, PoseStamped, TwistStamped
from std_msgs.msg import ColorRGBA
from sensor_msgs.msg import CompressedImage, JointState
from visualization_msgs.msg import Marker, MarkerArray
from std_msgs.msg import Float64, Float64MultiArray, String

rclpy.init()
node = Node("bloom_sim_e2e_probe")
last = {}

def emit(topic, data, period=0.0):
    now = time.monotonic()
    if period and now - last.get(topic, 0.0) < period:
        return
    last[topic] = now
    print(json.dumps({"topic": topic, "data": data}), flush=True)

def vector(v):
    return {"x": v.x, "y": v.y, "z": v.z}

def quaternion(q):
    return {"x": q.x, "y": q.y, "z": q.z, "w": q.w}

node.create_subscription(PoseStamped, "${POSE}", lambda m: emit("${POSE}", {"position": vector(m.pose.position), "orientation": quaternion(m.pose.orientation)}, 0.05), 10)
node.create_subscription(TwistStamped, "${TWIST}", lambda m: emit("${TWIST}", {"frame_id": m.header.frame_id, "linear": vector(m.twist.linear), "angular": vector(m.twist.angular)}), 50)
node.create_subscription(Float64MultiArray, "${GRIPPER}", lambda m: emit("${GRIPPER}", {"data": list(m.data)}), 10)
node.create_subscription(Float64, "${MAX_LINEAR}", lambda m: emit("${MAX_LINEAR}", {"data": m.data}), 10)
node.create_subscription(String, "${MODE}", lambda m: emit("${MODE}", {"data": m.data}), 10)
node.create_subscription(JointState, "${JOINT_TARGET}", lambda m: emit("${JOINT_TARGET}", {"name": list(m.name), "position": list(m.position)}, 0.1), 10)
node.create_subscription(String, "${GESTURE}", lambda m: emit("${GESTURE}", {"data": m.data}), 10)

# A 1x1 PNG at 2 Hz, so a camera widget bound to the topic has a frame to show.
frame = CompressedImage()
frame.format = "png"
frame.data = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f0005000301b7a72a220000000049454e44ae426082")
camera = node.create_publisher(CompressedImage, "${CAMERA}", 10)
def publish_frame():
    frame.header.stamp = node.get_clock().now().to_msg()
    camera.publish(frame)
node.create_timer(0.5, publish_frame)

# What robot_state_publisher latched: the first mesh the URDF names, its scale, and its last link.
from rclpy.qos import DurabilityPolicy, QoSProfile
import re
description = {"mesh": None, "scale": 1.0, "tool": None}
def on_description(m):
    tag = re.search(r'<mesh\\b[^>]*>', m.data)
    if tag:
        filename = re.search(r'filename="([^"]+)"', tag.group(0))
        scale = re.search(r'scale="([^"]+)"', tag.group(0))
        description["mesh"] = filename.group(1) if filename else None
        description["scale"] = float(scale.group(1).split()[0]) if scale else 1.0
    links = re.findall(r'<link\\s+name="([^"]+)"', m.data)
    description["tool"] = links[-1] if links else None
    emit("/robot_description", dict(description))
node.create_subscription(String, "/robot_description", on_description, QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL))

# Markers of every kind the view draws: the shared-control rviz shapes, a coloured trajectory, a label on
# the tool link, a cube list, and every six seconds the robot's own first mesh for three seconds.
markers = node.create_publisher(MarkerArray, "${MARKERS}", 10)
def make(kind, index, frame="base_link"):
    marker = Marker()
    marker.header.frame_id = frame
    marker.header.stamp = node.get_clock().now().to_msg()
    marker.ns = "lab"
    marker.id = index
    marker.type = kind
    marker.action = Marker.ADD
    marker.pose.orientation.w = 1.0
    marker.color.r, marker.color.g, marker.color.b, marker.color.a = 0.85, 0.55, 0.2, 1.0
    return marker
def publish_markers():
    array = MarkerArray()
    for index, kind in enumerate((Marker.ARROW, Marker.SPHERE)):
        marker = make(kind, index)
        marker.pose.position.x, marker.pose.position.y, marker.pose.position.z = 0.3, 0.1 * index, 0.4
        marker.scale.x, marker.scale.y, marker.scale.z = 0.15, 0.03, 0.03
        array.markers.append(marker)
    path = make(Marker.LINE_STRIP, 2)
    path.scale.x = 0.01
    for step in range(8):
        point = Point(x=0.2 + 0.04 * step, y=-0.2, z=0.5 + 0.02 * (step % 2))
        path.points.append(point)
        path.colors.append(ColorRGBA(r=0.2, g=0.3 + 0.1 * step, b=0.9, a=1.0))
    array.markers.append(path)
    label = make(Marker.TEXT_VIEW_FACING, 3, description["tool"] or "base_link")
    label.text = "tool"
    label.scale.z = 0.05
    label.pose.position.z = 0.08
    array.markers.append(label)
    cubes = make(Marker.CUBE_LIST, 4)
    cubes.scale.x = cubes.scale.y = cubes.scale.z = 0.03
    cubes.points.extend(Point(x=0.4, y=0.25, z=0.1 + 0.06 * step) for step in range(3))
    array.markers.append(cubes)
    markers.publish(array)
node.create_timer(1.0, publish_markers)
def publish_mesh_marker():
    if not description["mesh"]:
        return
    mesh = make(Marker.MESH_RESOURCE, 5)
    mesh.mesh_resource = description["mesh"]
    mesh.pose.position.x, mesh.pose.position.y, mesh.pose.position.z = 0.45, -0.3, 0.2
    mesh.scale.x = mesh.scale.y = mesh.scale.z = description["scale"]
    mesh.color.r, mesh.color.g, mesh.color.b, mesh.color.a = 0.25, 0.45, 0.85, 0.7
    mesh.lifetime.sec = 3
    markers.publish(MarkerArray(markers=[mesh]))
node.create_timer(6.0, publish_mesh_marker)

# A joint target on the lab's own topic, every joint 0.3 rad from where it is, four seconds on and four off:
# the view draws it as a translucent robot and drops it on the empty JointState the manager sends to cancel.
joint_names = []
def on_joint_states(m):
    joint_names[:] = list(m.name)
    joint_positions[:] = list(m.position)
joint_positions = []
node.create_subscription(JointState, "/joint_states", on_joint_states, 10)
target = node.create_publisher(JointState, "${TARGET}", 10)
target_phase = {"on": False}
def publish_target():
    target_phase["on"] = not target_phase["on"]
    message = JointState()
    message.header.stamp = node.get_clock().now().to_msg()
    if target_phase["on"] and joint_names:
        message.name = list(joint_names)
        message.position = [p + 0.3 for p in joint_positions]
    target.publish(message)
node.create_timer(4.0, publish_target)

def graph():
    names = sorted({info.node_name for info in node.get_subscriptions_info_by_topic("${MAX_LINEAR}") if info.node_name != node.get_name()})
    print(json.dumps({"subscribers": {"${MAX_LINEAR}": names}}), flush=True)

node.create_timer(1.0, graph)
try:
    rclpy.spin(node)
except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
    pass
`;
}

/** `ros2 param get` in the harness environment; the value line reads "Double value is: 3.0". */
function twistDifference(a, b) {
  return Math.max(
    ...["linear", "angular"].flatMap((part) => ["x", "y", "z"].map((axis) => Math.abs(a[part][axis] - b[part][axis]))),
  );
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function near(a, b) {
  return Math.abs(a - b) < 1e-6;
}

function sameArray(a, b) {
  return a.length === b.length && a.every((value, index) => near(value, b[index]));
}

function fmtTwist(twist) {
  return `${twist.frame_id} linear ${fmtVector(twist.linear)} angular ${fmtVector(twist.angular)}`;
}

function fmtArray(values) {
  return `[${values.map((value) => value.toFixed(2)).join(", ")}]`;
}
