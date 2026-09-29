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
import { BLOCKED_JOINT_RAD, driveVerdict } from "./lib/drive-verdict.mjs";
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
import { rosParameter, rosPublishOnce, startRosProbe } from "./lib/ros-probe.mjs";
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
    // qontrol's tip_frame, and the finger the gripper controller drives (URDF: a larger value is more closed).
    // Each word's own axis and sign on the wire: extender_ui's validated Explorer profile (swap XY, invert linear x).
    words: {
      Forward: "linear.x-",
      Right: "linear.y+",
      Up: "linear.z+",
      "Tilt up": "angular.x+",
      "Roll right": "angular.y+",
    },
    tipFrame: "ft_frame",
    finger: "right_finger_joint",
    // Gazebo's pincette ignores its commands from launch until the arm first moves, and at times while the arm is
    // still: a finger that does not travel is reported; one that travels the wrong way still fails.
    fingerMayStall: "Gazebo's Explorer gripper can ignore commands while the arm is still",
    // From the launch pose link_3 rests on Gazebo's ground plane (base_link at z=0) and qontrol integrates its own
    // command open loop: the joints sag and lag behind /ee_pose. Reported as a WARN; the wrong way still fails.
    jointsMayLag:
      "the Gazebo arm rests on the ground plane and qontrol runs open loop, so its joints sag and lag behind /ee_pose",
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
    // The Kinova Manager seed's identity mapping, pinned so a change to it is a decision, not a drift.
    words: {
      Forward: "linear.y+",
      Right: "linear.x+",
      Up: "linear.z+",
      "Tilt up": "angular.y+",
      "Roll right": "angular.x+",
    },
    tipFrame: "end_effector_link",
    finger: "robotiq_85_left_knuckle_joint",
    speed: { slow: 0.025, medium: 0.05 },
    // cartesian_manager main ships the gen3 its own seven-joint home.
    goHome: true,
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
  poseTarget: POSE_TARGET,
  cameraImage: CAMERA,
  intentScale: INTENT_SCALE,
  sharedControlConfidences: CONFIDENCES,
  sharedControlGoals: GOALS,
  sharedControlSoftGoal: SOFT_GOAL,
} = STACK;
const GESTURE = "/ui/widget_lab/gesture";
/** cartesian_manager#12's latched status: the manager's own report of its shaping, behaviour and target. */
const MANAGER_STATUS = "/cartesian_manager/status";
const NO_STATUS = `no ${MANAGER_STATUS}: this manager predates cartesian_manager#12`;
const MARKERS = "/widget_lab/markers";
const TARGET = "/widget_lab/target";
const MIN_DISPLACEMENT_M = 0.03;
/** Go to is back when inside twice the manager's shipped tolerances (1 cm, 0.05 rad), as the widget reads it. */
const GO_TO_POSITION_M = 0.02;
const GO_TO_ANGLE_RAD = 0.1;
/** The backend's default save band (BLOOM_POSE_SAVE_MAX_OFFSET_M / _RAD): a refusal is right only beyond it. */
const SAVE_BAND_M = 0.02;
const SAVE_BAND_RAD = 0.1;
const MIN_ROTATION_RAD = 0.05;
/**
 * The hand the robot really has: robot_state_publisher's transform from its joint states, the same kinematics the
 * 3D view draws. qontrol's /ee_pose is the pose of its own integrated command, and stays flat while a stalled joint
 * lets the arm sag.
 */
const HAND = `tf:base_link->${robot.tipFrame}`;
const JOINTS = STACK.jointStates;
const QONTROL_COMMANDS = STACK.qontrolCommands;
/** A horizontal push may not lower the hand more than this, nor take it this much further from the command. */
const MAX_SAG_M = 0.01;
const MAX_COMMAND_GAP_M = 0.015;
/** A gripper press must move the finger at least this far, the right way, within the wait. */
const MIN_FINGER_TRAVEL_RAD = 0.3;
const FINGER_WAIT_MS = 4000;
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
  await behavioursSession();
  await benchSession();
  await debugSession();
  await authoredSession();
  await freshAppSession();
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
      // Bloom's direction (the wire and qontrol's command) is strict on both robots; the measured hand is strict
      // on mock hardware and a WARN on a robot naming why its joints may not follow (scripts/lib/drive-verdict.mjs).
      const failed = rows.filter((row) => row.verdict.verdict === "fail").map((row) => row.word);
      assert(failed.length === 0, `${failed.join(", ")} did not follow the wire: ${table}`);
      const warned = rows.filter((row) => row.verdict.verdict === "warn");
      return warned.length
        ? `WARN ${warned.map((row) => `${row.word} (${row.verdict.reasons.join(", ")})`).join(", ")}: ${robot.jointsMayLag ?? "named off-axis"}; ${table}`
        : table;
    });

    await check(page, "gripper-toggle-publishes", async () => {
      // A hand that starts closed (the gen3's mock finger may) is opened first, so Close has somewhere to go.
      const middle = (robot.gripper.close[0] + robot.gripper.open[0]) / 2;
      if ((await settledFinger()) > middle) {
        const since = Date.now();
        await (await offerGripper(page, "Open")).click();
        const opened = (data) => data.position[data.name.indexOf(robot.finger)] < middle;
        await ros.waitFor(JOINTS, opened, { since, timeoutMs: FINGER_WAIT_MS }).catch(() => null);
        await settledFinger();
      }
      const close = await offerGripper(page, "Close");
      let before = await settledFinger();
      let since = Date.now();
      await close.click();
      const closed = await ros.waitFor(GRIPPER, (data) => sameArray(data.data, robot.gripper.close), { since });
      // The words must match the fingers: a larger finger value is a narrower grip on both robots' URDFs.
      const shut = await fingerMoved(before, +1, since, "Close gripper");
      const open = await offerGripper(page, "Open");
      before = await settledFinger();
      since = Date.now();
      await open.click();
      const opened = await ros.waitFor(GRIPPER, (data) => sameArray(data.data, robot.gripper.open), { since });
      const apart = await fingerMoved(before, -1, since, "Open gripper");
      return `close ${JSON.stringify(closed.data)} -> ${robot.finger} ${shut}; open ${JSON.stringify(opened.data)} -> ${robot.finger} ${apart}`;
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

    await check(page, "manager-status-measures-shaping", async () => {
      if (!ros.latest(MANAGER_STATUS)) {
        skip(NO_STATUS);
      }
      const rows = [];
      for (const [label, mode] of [
        ["Jaco", "geometric/jaco"],
        ["Both", "geometric/both"],
      ]) {
        const since = Date.now();
        await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
        await ros.waitFor(MANAGER_STATUS, (data) => data.geometric === mode, { since });
        const reported = page.getByRole("button", { name: `${label}: requested, reported by the robot` });
        await reported.waitFor({ timeout: 5000 });
        const source = await reported.locator("xpath=ancestor::*[@data-source][1]").getAttribute("data-source");
        assert(source === "measured", `${label} reads data-source=${source}`);
        rows.push(`${label}: status ${mode}, measured after ${Date.now() - since} ms`);
      }
      await shot(page, "shaping-reported");
      return rows.join("; ");
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
        // A confirmation within 600 ms of arming is taken for the same press bouncing, and ignored.
        await page.waitForTimeout(700);
        await page.getByRole("button", { name: /Press again to move/ }).click();
        await ros.waitFor(MODE, (data) => data.data === "behaviour/joint_target/home", { since });
        const target = await ros.waitFor(JOINT_TARGET, () => true, { since, timeoutMs: 8000 });
        // The manager sends the arm's own joint set: seven on the gen3, six on the Explorer.
        assert(target.position.length === robot.joints, `home target names ${target.position.length} joints`);
        await page.waitForTimeout(800);
        await shot(page, "positions-home");
        homeDetail = `home dispatched, ${JOINT_TARGET} ${fmtArray(target.position)} (${target.position.length} joints)`;
      }
      const since = Date.now();
      await page.getByRole("button", { name: /^Cancel the pose/ }).click();
      await ros.waitFor(MODE, (data) => data.data === "behaviour/passthrough", { since });
      if (!robot.goHome) {
        await shot(page, "positions");
      }
      return `${homeDetail}; release sent behaviour/passthrough`;
    });

    await check(page, "manager-status-reverts-a-refused-request", async () => {
      if (!ros.latest(MANAGER_STATUS)) {
        skip(NO_STATUS);
      }
      const reported = "Cancel the pose: requested, reported by the robot";
      const release = page.getByRole("button", { name: reported });
      await release.waitFor({ timeout: 5000 });
      await release.evaluate((button) => {
        const labels = [];
        window.__releaseLabels = labels;
        new MutationObserver(() => labels.push({ label: button.getAttribute("aria-label"), t: Date.now() })).observe(
          button,
          { attributeFilter: ["aria-label"], attributes: true },
        );
      });
      const since = Date.now();
      const refused = "behaviour/pose_target/does_not_exist";
      await rosPublishOnce(MODE, "std_msgs/msg/String", `{data: '${refused}'}`);
      await ros.waitFor(MODE, (data) => data.data === refused, { since });
      // Asked for, shown as asked; the manager ignores it, its status never moves, and the store returns to it.
      await page.waitForFunction(
        (wanted) => {
          const labels = window.__releaseLabels ?? [];
          return (
            labels.some((item) => item.label.endsWith("not requested, last asked")) && labels.at(-1)?.label === wanted
          );
        },
        reported,
        { timeout: 8000 },
      );
      const labels = await page.evaluate(() => window.__releaseLabels);
      const asked = labels.find((item) => item.label.endsWith("not requested, last asked"));
      const back = labels.at(-1);
      const moved = ros
        .since(MANAGER_STATUS, since)
        .filter((message) => message.data.behaviour !== "behaviour/passthrough");
      assert(moved.length === 0, `the status moved: ${JSON.stringify(moved.map((message) => message.data))}`);
      await shot(page, "refused-request-reverted");
      return `${refused}: last asked, then reported passthrough ${back.t - asked.t} ms later; status unchanged`;
    });

    await check(page, "positions-save-and-go-to", async () => saveMoveAwayAndGoBack(page));

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

/**
 * The manager's two lasting behaviours (topic/intent_scaling, topic/shared_control) from the Behaviours screen:
 * each request on the wire, each effect on the manager's own feedback topics, and the screen reading it back.
 * On a manager that does not declare them, every check here is skipped with the reason.
 */
async function behavioursSession() {
  const MIN_SCALE = "behaviours.intent_scaling.min_scale";
  const GOAL_MATCH = "behaviours.shared_control.goal_match_distance";
  const declared = { minScale: await rosParameter("/cartesian_manager", MIN_SCALE) };
  declared.goalMatch = await rosParameter("/cartesian_manager", GOAL_MATCH);
  // An undeclared parameter answers "Parameter not set" on stderr, so the value line is empty: only a number counts.
  const missing = Object.entries(declared)
    .filter(([, value]) => !/^-?\d+(\.\d+)?$/.test(String(value).trim()))
    .map(([name, value]) => `${name === "minScale" ? MIN_SCALE : GOAL_MATCH} (${String(value).trim() || "not set"})`);
  const behaviourChecks = [
    "behaviours-screen-offers-both",
    "intent-scaling-speeds-up-a-held-push",
    "intent-scaling-off-stops-the-scale",
    "behaviour-slider-sets-a-manager-parameter",
    "behaviour-chip-shows-on-every-screen",
    "assist-follows-a-push-towards-a-goal",
    "reset-assist-forgets-the-confidences",
    "behaviours-replace-each-other",
    "stop-ends-a-behaviour",
    "leaving-the-app-ends-assist",
  ];
  if (missing.length > 0) {
    const reason = `this manager does not declare ${missing.join(" and ")}: built without the behaviours`;
    const { context, page } = await newPage({ width: 1280, height: 720 });
    try {
      for (const name of behaviourChecks) {
        await check(page, name, async () => skip(reason));
      }
    } finally {
      await context.close();
    }
    return;
  }

  const { context, page } = await newPage({ width: 1280, height: 720 });
  const speedUp = () => toggleButton(page, "Speed up with intent");
  const assist = () => toggleButton(page, "Assist to goals");
  const translation = () => page.getByRole("application", { name: "Translation" });
  const clearGoals = () =>
    rosPublishOnce(
      GOALS,
      "geometry_msgs/msg/PoseArray",
      JSON.stringify({ header: { frame_id: "base_link" }, poses: [] }),
    );
  let closed = false;
  try {
    const opened = await check(page, behaviourChecks[0], async () => {
      // A passthrough on the wire before the page opens: once the toggle reads off from it, the store's snapshot
      // has landed and availability is decided, not still unknown.
      await rosPublishOnce(MODE, "std_msgs/msg/String", "{data: 'behaviour/passthrough'}");
      await openApp(page, robot.app, "Operator", "manager_drive_operator");
      await openScreen(page, "Behaviours", "manager_behaviours");
      await speedUp().locator("xpath=ancestor::*[@data-command-state='off'][1]").waitFor({ timeout: 15000 });
      const unavailable = await page.locator("[data-runtime-unavailable='true']").count();
      assert(
        unavailable === 0,
        `${unavailable} behaviour widget(s) marked unavailable on a manager that declares both`,
      );
      await speedUp().waitFor();
      await assist().waitFor();
      await page.locator(".bloom-gauge-widget[data-live='false']").waitFor({ timeout: 10000 });
      await page.locator(".bloom-confidence-bars[data-live='false']").waitFor({ timeout: 10000 });
      await shot(page, "behaviours");
      return `both offered; gauge and bars idle; ${MIN_SCALE} ${declared.minScale}, ${GOAL_MATCH} ${declared.goalMatch}`;
    });
    if (!opened) {
      return;
    }

    await check(page, behaviourChecks[1], async () => {
      let since = Date.now();
      const switchedAt = since;
      await switchBehaviour(page, "Speed up with intent", "on");
      await ros.waitFor(MODE, (data) => data.data === "behaviour/intent_scaling", { since });
      const idle = await ros.waitFor(INTENT_SCALE, () => true, { since, timeoutMs: 5000 });
      since = Date.now();
      const release = await pressJoystick(page, translation(), { x: 0, y: 2 });
      // The push's first scale is the first sample after the twist reached the wire.
      await ros.waitFor(TWIST, (data) => !isZeroTwist(data), { since });
      const pushedAt = Date.now();
      await ros.waitFor(INTENT_SCALE, (data) => data.data >= 0.9, { since: pushedAt, timeoutMs: 4000 });
      const shown = Number(await page.locator(".bloom-gauge-widget[data-live='true'] meter").getAttribute("value"));
      await shot(page, "intent-scaling-held");
      await release();
      const scales = ros.since(INTENT_SCALE, pushedAt).map((message) => message.data.data);
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      const start = scales[0] ?? Number.NaN;
      const peak = Math.max(...scales);
      assert(scales.length >= 20, `${scales.length} intent scale samples during the push, expected about 40`);
      assert(start <= 0.5, `the push started at scale ${start}, expected min_scale (${declared.minScale})`);
      assert(shown >= 0.85, `the gauge read ${shown} at the end of the push`);
      const toggle = await toggleState(speedUp());
      assert(toggle.state === "on" && toggle.source === "measured", `toggle reads ${JSON.stringify(toggle)}`);
      const status = await reportedBehaviour(speedUp(), "behaviour/intent_scaling", switchedAt);
      // Back where it was, before the next push.
      const back = await pressJoystick(page, translation(), { x: 0, y: -2 });
      await page.waitForTimeout(2200);
      await back();
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      return `idle scale ${idle.data}; held push ${start.toFixed(2)} -> ${peak.toFixed(2)} over ${scales.length} samples; gauge ${shown.toFixed(2)}; toggle on, reported by the robot (${status})`;
    });

    await check(page, behaviourChecks[2], async () => {
      const since = Date.now();
      await switchBehaviour(page, "Speed up with intent", "off");
      await ros.waitFor(MODE, (data) => data.data === "behaviour/passthrough", { since });
      // The store measures the topic silent within its 0.5 s window; the gauge says so at once, greyed.
      const gauge = page.locator(".bloom-gauge-widget[data-live='false'][data-silent='true']");
      await gauge.waitFor({ timeout: 5000 });
      await expect(gauge.locator(".bloom-display-header span")).toHaveText("not publishing");
      const silentAt = Date.now();
      await page.waitForTimeout(800);
      const late = ros.since(INTENT_SCALE, silentAt);
      assert(late.length === 0, `${late.length} intent scale samples after the store marked the topic silent`);
      const toggle = await toggleState(speedUp());
      assert(toggle.state === "off", `toggle reads ${JSON.stringify(toggle)}`);
      return `passthrough sent; ${INTENT_SCALE} silent; gauge greyed and says "not publishing"; toggle off`;
    });

    await check(page, behaviourChecks[3], async () => {
      const before = await rosParameter("/cartesian_manager", MIN_SCALE);
      const pushStart = page.getByRole("slider", { name: "Push start" });
      const changed = async (from) => {
        const deadline = Date.now() + 8000;
        let value = from;
        while (Date.now() < deadline && value === from) {
          await page.waitForTimeout(250);
          value = await rosParameter("/cartesian_manager", MIN_SCALE);
        }
        return value;
      };
      let after = before;
      try {
        await pushStart.focus();
        await page.keyboard.press("ArrowLeft");
        after = await changed(before);
        assert(after !== before, `${MIN_SCALE} stayed at ${before}`);
      } finally {
        // Leave the manager as found: a lab manager keeps its parameters across runs.
        await pushStart.focus();
        await page.keyboard.press("ArrowRight");
        const restored = await changed(after);
        assert(restored === before, `${MIN_SCALE} restored to ${restored}, expected ${before}`);
      }
      return `${MIN_SCALE} ${before} -> ${after} -> ${before}`;
    });

    await check(page, behaviourChecks[4], async () => {
      // A behaviour outlives a screen change: the kiosk bar says so on Drive, from the manager's feedback.
      let since = Date.now();
      await switchBehaviour(page, "Speed up with intent", "on");
      await ros.waitFor(MODE, (data) => data.data === "behaviour/intent_scaling", { since });
      await ros.waitFor(INTENT_SCALE, () => true, { since, timeoutMs: 5000 });
      const chip = page.locator(".runtime-kiosk-behaviour[data-behaviour='intent_scaling']");
      await chip.waitFor({ timeout: 5000 });
      await openScreen(page, "Drive · Operator", "manager_drive_operator");
      await expect(chip).toHaveText("Speed up on", { timeout: 5000 });
      const stillOn = ros.since(INTENT_SCALE, Date.now() - 300);
      assert(stillOn.length > 0, "the intent scale stopped when the screen changed");
      await shot(page, "behaviour-chip-on-drive");
      await openScreen(page, "Behaviours", "manager_behaviours");
      since = Date.now();
      await switchBehaviour(page, "Speed up with intent", "off");
      await ros.waitFor(MODE, (data) => data.data === "behaviour/passthrough", { since });
      await chip.waitFor({ state: "detached", timeout: 5000 });
      return "Drive · Operator showed the Speed up on chip while the scale kept publishing; gone after passthrough";
    });

    await check(page, behaviourChecks[5], async () => {
      // Two goals a quarter metre either side of the hand along the axis Forward drives, so one is aimed at.
      const direction = await forwardDirection(page);
      const hand = ros.latest(POSE).data.position;
      const goal = (sign) => ({
        position: { x: hand.x + sign * 0.25 * direction.x, y: hand.y + sign * 0.25 * direction.y, z: hand.z },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      });
      const poses = [goal(1), goal(-1)];
      await rosPublishOnce(
        GOALS,
        "geometry_msgs/msg/PoseArray",
        JSON.stringify({ header: { frame_id: "base_link" }, poses }),
      );
      let since = Date.now();
      const switchedAt = since;
      await switchBehaviour(page, "Assist to goals", "on");
      await ros.waitFor(MODE, (data) => data.data === "behaviour/shared_control", { since });
      const idle = await ros.waitFor(CONFIDENCES, (data) => data.ids.length === 3, { since, timeoutMs: 8000 });
      assert(idle.ids.join(",") === "agnostic,goal_0,goal_1", `manager names the goals ${idle.ids.join(",")}`);
      await ros.waitFor(SOFT_GOAL, () => true, { since, timeoutMs: 5000 });
      const rows = page.locator(".bloom-confidence-bars[data-live='true'] .bloom-confidence-row");
      await rows.nth(2).waitFor({ timeout: 8000 });
      const names = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-goal")));
      assert(names.join(",") === "agnostic,goal_0,goal_1", `bars named ${names.join(",")}`);
      since = Date.now();
      const release = await pressJoystick(page, translation(), { x: 0, y: 2 });
      const aimedUp = await ros.waitFor(
        CONFIDENCES,
        (data) => data.data[1] >= 0.3 && data.data[1] > data.data[2] + 0.1,
        {
          since,
          timeoutMs: 4000,
        },
      );
      await expect(rows.nth(1)).toHaveAttribute("data-confidence", /^(0\.[2-9]\d|1\.00)$/, { timeout: 3000 });
      const shownAimed = Number(await rows.nth(1).getAttribute("data-confidence"));
      await shot(page, "assist-held");
      await release();
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      const toggle = await toggleState(assist());
      assert(toggle.state === "on" && toggle.source === "measured", `toggle reads ${JSON.stringify(toggle)}`);
      const status = await reportedBehaviour(assist(), "behaviour/shared_control", switchedAt);
      return `goals at ±0.25 m along ${fmtVector(direction)}; idle ${fmtArray(idle.data)}; while pushing ${fmtArray(aimedUp.data)} for ${aimedUp.ids.join(",")}; bar ${shownAimed}; soft goal on ${SOFT_GOAL}; toggle on, reported by the robot (${status})`;
    });

    await check(page, behaviourChecks[6], async () => {
      const since = Date.now();
      await page.getByRole("button", { name: /^Reset assist/ }).click();
      await ros.waitFor(MODE, (data) => data.data === "behaviour/shared_control/reset", { since });
      const cleared = await ros.waitFor(CONFIDENCES, (data) => data.ids.length === 1 && data.data[0] > 0.99, {
        since,
        timeoutMs: 5000,
      });
      await page.locator(".bloom-confidence-bars[data-goals='1']").waitFor({ timeout: 8000 });
      const toggle = await toggleState(assist());
      assert(toggle.state === "on", `Assist reads ${JSON.stringify(toggle)} after its reset`);
      return `reset dropped the goals: ${cleared.ids.join(",")} ${fmtArray(cleared.data)}; Assist still on`;
    });

    await check(page, behaviourChecks[7], async () => {
      let since = Date.now();
      await switchBehaviour(page, "Speed up with intent", "on");
      await ros.waitFor(MODE, (data) => data.data === "behaviour/intent_scaling", { since });
      await ros.waitFor(INTENT_SCALE, () => true, { since, timeoutMs: 5000 });
      await page.locator(".bloom-confidence-bars[data-live='false']").waitFor({ timeout: 8000 });
      const barsOffAt = Date.now();
      await page.waitForTimeout(800);
      const late = ros.since(CONFIDENCES, barsOffAt);
      assert(late.length === 0, `${late.length} confidence samples while intent scaling runs`);
      const speed = await toggleState(speedUp());
      const help = await toggleState(assist());
      assert(speed.state === "on" && help.state === "off", `Speed up ${speed.state}, Assist ${help.state}`);
      await shot(page, "behaviours-exclusive");
      // And back: Assist on ends intent scaling.
      since = Date.now();
      await switchBehaviour(page, "Assist to goals", "on");
      await ros.waitFor(MODE, (data) => data.data === "behaviour/shared_control", { since });
      await ros.waitFor(CONFIDENCES, () => true, { since, timeoutMs: 5000 });
      await page.locator(".bloom-gauge-widget[data-live='false'][data-silent='true']").waitFor({ timeout: 5000 });
      const gaugeOffAt = Date.now();
      await page.waitForTimeout(800);
      const scales = ros.since(INTENT_SCALE, gaugeOffAt);
      assert(scales.length === 0, `${scales.length} intent scale samples while shared control runs`);
      const speedAfter = await toggleState(speedUp());
      assert(speedAfter.state === "off", `Speed up reads ${speedAfter.state} under Assist`);
      return "Speed up on: confidences stop, Assist reads off; Assist on: intent scale stops, Speed up reads off";
    });

    await check(page, behaviourChecks[8], async () => {
      const since = Date.now();
      await page.getByRole("button", { name: "Stop the robot" }).click();
      const resume = page.getByRole("button", { name: "Hold for one second to resume" });
      await resume.waitFor();
      await ros.waitFor(MODE, (data) => data.data === "behaviour/passthrough", { since });
      await page.locator(".bloom-confidence-bars[data-live='false']").waitFor({ timeout: 5000 });
      const barsOffAt = Date.now();
      await page.waitForTimeout(800);
      const late = ros.since(CONFIDENCES, barsOffAt);
      assert(late.length === 0, `${late.length} confidence samples after STOP`);
      const stoppedToggle = await toggleState(assist());
      assert(stoppedToggle.state === "off", `Assist reads ${stoppedToggle.state} while stopped`);
      await shot(page, "behaviours-stopped");
      await hold(page, resume, 1300);
      await page.getByRole("button", { name: "Stop the robot" }).waitFor();
      const help = await toggleState(assist());
      assert(help.state === "off", `Assist reads ${help.state} after STOP and resume`);
      // Back where the assisted push left from, with nothing assisting.
      const back = await pressJoystick(page, translation(), { x: 0, y: -2 });
      await page.waitForTimeout(1500);
      await back();
      await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
      return "STOP sent passthrough, confidences stopped, Assist reads off while stopped and after resume";
    });

    await check(page, behaviourChecks[9], async () => {
      let since = Date.now();
      await switchBehaviour(page, "Assist to goals", "on");
      await ros.waitFor(MODE, (data) => data.data === "behaviour/shared_control", { since });
      await ros.waitFor(CONFIDENCES, () => true, { since, timeoutMs: 5000 });
      since = Date.now();
      closed = true;
      await context.close();
      await ros.waitFor(MODE, (data) => data.data === "behaviour/passthrough", { since, timeoutMs: 10000 });
      // The manager stops the confidences on its next cycle; the probe sees none after a short grace.
      const passthroughAt = Date.now();
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
      const late = ros.since(CONFIDENCES, passthroughAt + 300);
      assert(late.length === 0, `${late.length} confidence samples after the operator left`);
      return "the server sent behaviour/passthrough when the session closed; confidences stopped";
    });
  } finally {
    // The goals were this session's: the next one, and a lab manager, start with none.
    await clearGoals().catch(() => undefined);
    if (!closed) {
      await context.close();
    }
  }
}

/**
 * A behaviour toggle says the robot reported it; with cartesian_manager#12 the manager's status names the behaviour
 * too, and an older manager has only the liveness inference.
 */
async function reportedBehaviour(button, behaviour, since) {
  await expect(button).toHaveAccessibleName(/, reported by the robot$/, { timeout: 5000 });
  if (!ros.latest(MANAGER_STATUS)) {
    return "no status, inferred";
  }
  await ros.waitFor(MANAGER_STATUS, (data) => data.behaviour === behaviour, { since });
  return `status ${behaviour}`;
}

/** The single toggle button, or one of the two offered while its state is unknown or another mode holds. */
function toggleButton(page, title) {
  return page.getByRole("button", { name: new RegExp(`^${title}:`) }).first();
}

/** What a toggle shows: its command state and where it came from, off its card's data attributes. */
async function toggleState(button) {
  const card = button.locator("xpath=ancestor::*[@data-command-state][1]");
  return {
    source: await card.getAttribute("data-source"),
    state: await card.getAttribute("data-command-state"),
  };
}

/**
 * Switch a mode toggle on or off. Knowing its state, one button toggles; not knowing it, or under another
 * behaviour, it offers both sides, and the wanted side is pressed.
 */
async function switchBehaviour(page, title, wanted) {
  const labels = {
    "Assist to goals": { off: "Not assisting", on: "Assisting" },
    "Speed up with intent": { off: "Plain speed", on: "Speeding up" },
  }[title];
  const choice = page.getByRole("button", { exact: false, name: new RegExp(`^${title}: ${labels[wanted]}`) });
  const buttons = page.getByRole("button", { name: new RegExp(`^${title}:`) });
  if ((await buttons.count()) > 1) {
    await choice.click();
    return;
  }
  const state = await toggleState(buttons.first());
  if (state.state === wanted) {
    return;
  }
  await buttons.first().click();
}

/** The base-frame direction the Translation pad's Forward drives, read off the wire from a short push. */
async function forwardDirection(page) {
  const since = Date.now();
  const release = await pressJoystick(page, page.getByRole("application", { name: "Translation" }), { x: 0, y: 2 });
  const wire = await ros.waitFor(TWIST, (data) => !isZeroTwist(data), { since });
  await release();
  await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: Date.now(), timeoutMs: 2000 });
  const norm = Math.hypot(wire.linear.x, wire.linear.y, wire.linear.z) || 1;
  return { x: wire.linear.x / norm, y: wire.linear.y / norm, z: wire.linear.z / norm };
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

/** A new app as Susana asked for it on 2026-09-25: the starter and the palette as placed, nothing typed, the arm moves. */
async function freshAppSession() {
  const { context, page } = await newPage({ width: 1600, height: 1000 });
  const appName = `Fresh ${Date.now()}`;
  try {
    const built = await check(page, "a-new-app-arrives-wired", async () => {
      await createGuidedApp(page, dashboardUrl, appName);
      await openScreenBuilder(page);
      const added = await addPaletteWidgets(page, ["Command button", "Gauge", "Camera"]);
      assert(added.length === 3, `only added ${added.join(", ")}`);
      await saveScreenDraft(page);
      await shot(page, "fresh-screen");
      return `${appName}: the starter's pad, speed and gripper, and ${added.join(" and ")} from the palette, untouched`;
    });
    if (!built) {
      return;
    }

    await check(page, "a-new-app-drives-the-arm", async () => {
      await openRuntimeApp(page, dashboardUrl, { appName });
      const unavailable = await page.locator("[data-runtime-unavailable='true']").count();
      assert(unavailable === 0, `${unavailable} widget(s) marked unavailable`);
      const drive = await driveAndMeasure(page, "fresh");

      const close = await offerGripper(page, "Close");
      let since = Date.now();
      await close.click();
      await ros.waitFor(GRIPPER, (data) => data.data[0] === robot.gripper.close[0], { since });

      since = Date.now();
      await page.getByRole("slider", { name: /Max linear speed/ }).focus();
      await page.keyboard.press("ArrowRight");
      const speed = await ros.waitFor(MAX_LINEAR, () => true, { since });

      since = Date.now();
      await page.locator("[data-widget-kind='command-button'] button").first().click();
      await ros.waitFor(MODE, (data) => data.data === "geometric/both", { since });

      const gauge = await page.locator("[data-widget-kind='gauge']").innerText();
      assert(/\d\.\d/.test(gauge) && !/no source/i.test(gauge), `gauge reads "${gauge.replace(/\s+/g, " ")}"`);
      await page.locator("[data-widget-kind='camera'] img.bloom-camera-image").waitFor({ timeout: 15000 });
      await shot(page, "fresh-runtime");
      return `${drive.summary}; gripper ${robot.gripper.close[0]}; speed ${speed.data.toFixed(3)}; Neutral; gauge live; camera frame`;
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
      const close = await offerGripper(page, "Close");
      let since = Date.now();
      await close.click();
      // The lab is written with the Explorer's values; on the Kinova the runtime sends the Robotiq's own.
      const closed = await ros.waitFor(GRIPPER, (data) => sameArray(data.data, robot.gripper.close), { since });
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
      const capture = page.getByRole("button", { name: "Save the robot's current pose" });
      await capture.waitFor({ timeout: 10000 });
      await expect(capture).toBeEnabled({ timeout: 10000 });
      const before = await page.getByRole("list", { name: "Saved poses" }).locator("li").count();
      const divergence = commandedVersusMeasured();
      await capture.click();
      const notice = page.locator(".bloom-position-notice");
      await expect(notice).toHaveText(/^Saved as |^The arm is not where it was commanded/, { timeout: 10000 });
      let saveDetail;
      if ((await notice.textContent())?.startsWith("Saved as ")) {
        const saved = page.getByRole("list", { name: "Saved poses" }).locator("li");
        await expect(saved).toHaveCount(before + 1, { timeout: 10000 });
        saveDetail = `${await saved.count()} pose saved (${divergence.text})`;
      } else {
        // The gate refused: it must be right that the arm is not where qontrol commands it.
        assert(
          divergence.metres > SAVE_BAND_M || divergence.radians > SAVE_BAND_RAD,
          `the save was refused as not where commanded, but the TF tip is ${divergence.text}`,
        );
        saveDetail = `save refused, rightly: after the lab's driving the ${divergence.text}`;
      }
      await page.locator("img.bloom-camera-image").waitFor({ timeout: 15000 });
      await shot(page, "lab-robot");
      return `${saveDetail}; camera shows a frame from ${CAMERA}`;
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
/**
 * The gripper offers the press that changes it, or both while its state is not known. The Kinova's finger
 * reports it, and may start closed: press the other action first so the wanted one is offered.
 */
async function offerGripper(page, action) {
  const name = (verb) => new RegExp(`^Gripper: ${verb} gripper`);
  const wanted = page.getByRole("button", { name: name(action) });
  const other = page.getByRole("button", { name: name(action === "Close" ? "Open" : "Close") });
  await wanted.or(other).first().waitFor({ timeout: 15000 });
  if ((await wanted.count()) === 0) {
    await other.click();
    await wanted.waitFor({ timeout: 15000 });
  }
  return wanted;
}

/**
 * The operator's save-a-pose flow on the wire: save where the hand is, drive it away with the pad, then Go to
 * the saved pose. The first press only arms; the second publishes the saved PoseStamped on the manager's pose
 * target, the manager reports behaviour/pose_target and returns to passthrough, and both the commanded /ee_pose
 * and the tip measured through TF are back. Passthrough goes out at the end whatever happened.
 */
async function saveMoveAwayAndGoBack(page) {
  try {
    return await saveMoveAwayAndGoBackOnce(page);
  } finally {
    await rosPublishOnce(MODE, "std_msgs/msg/String", "{data: 'behaviour/passthrough'}").catch(() => undefined);
  }
}

async function saveMoveAwayAndGoBackOnce(page) {
  await openScreen(page, "Positions", "manager_positions");
  const save = page.getByRole("button", { name: "Save the robot's current pose" });
  await expect(save).toBeEnabled({ timeout: 10000 });
  await page.waitForTimeout(500);
  const notice = page.locator(".bloom-position-notice");
  // The save gate refuses while the measured tip is off the commanded one (a lagging arm settles, so ask again).
  let saved;
  for (let attempt = 1; ; attempt += 1) {
    saved = await ros.waitFor(POSE, () => true, { since: Date.now() });
    await save.click();
    await expect(notice).toHaveText(/^Saved as Pose \d+\.$|^The arm is not where it was commanded/, { timeout: 10000 });
    if ((await notice.textContent())?.startsWith("Saved as ") || attempt === 3) {
      break;
    }
    await page.waitForTimeout(2000);
  }
  if (!(await notice.textContent())?.startsWith("Saved as ")) {
    // Refused three times: right only if the tip is off its command, and a WARN only where joints may lag and one
    // is blocked (scripts/lib/drive-verdict.mjs); anything else fails.
    const divergence = commandedVersusMeasured();
    const gaps = jointGaps();
    const short = gaps
      .slice(0, 3)
      .map((row) => `${row.name} ${row.gap >= 0 ? "+" : ""}${row.gap.toFixed(2)} rad`)
      .join(", ");
    assert(
      (divergence.metres > SAVE_BAND_M || divergence.radians > SAVE_BAND_RAD) &&
        robot.jointsMayLag &&
        gaps.some((row) => Math.abs(row.gap) > BLOCKED_JOINT_RAD),
      `the save was refused as not where commanded; ${divergence.text}; joints short of their command: ${short || "none measured"}`,
    );
    await shot(page, "positions-save-refused");
    return `WARN save refused, rightly, so Go to was not exercised this run: ${divergence.text}; joints short of their command: ${short} (${robot.jointsMayLag})`;
  }
  const label = /Saved as (Pose \d+)/.exec((await notice.textContent()) ?? "")?.[1];
  assert(label, "no saved pose name");
  const verified = (await page.getByText("not verified").count()) === 0;
  await shot(page, "positions-saved");

  await openScreen(page, "Drive · Operator", "manager_drive_operator");
  const translation = page.getByRole("application", { name: "Translation" });
  const release = await pressJoystick(page, translation, { x: 0, y: 2 });
  await page.waitForTimeout(robot.driveHoldMs * 1.5);
  const releasedAt = Date.now();
  await release();
  await ros.waitFor(TWIST, (data) => isZeroTwist(data), { since: releasedAt, timeoutMs: 2000 });
  await page.waitForTimeout(800);
  const away = ros.latest(POSE).data;
  const moved = distance(saved.position, away.position);
  assert(moved > MIN_DISPLACEMENT_M, `the pad moved the hand ${(moved * 100).toFixed(1)} cm, expected > 3 cm`);

  await openScreen(page, "Positions", "manager_positions");
  const since = Date.now();
  await page.getByRole("button", { name: `Go to ${label}` }).click();
  const armed = page.getByRole("button", { name: `Press again to send the arm to ${label}` });
  await armed.waitFor();
  await shot(page, "positions-go-to-armed");
  await page.waitForTimeout(700);
  assert(ros.since(POSE_TARGET, since).length === 0, `the first press already published on ${POSE_TARGET}`);
  await armed.click();
  const target = await ros.waitFor(POSE_TARGET, () => true, { since, timeoutMs: 8000 });
  assert(
    target.frame_id === saved.frame_id && distance(target.position, saved.position) < 0.002,
    `${POSE_TARGET} carried ${target.frame_id} ${fmtVector(target.position)}, saved ${saved.frame_id} ${fmtVector(saved.position)}`,
  );
  const sentAt = Date.now();
  const back = () => {
    const hand = ros.latest(POSE).data;
    return {
      error: distance(hand.position, target.position),
      angle: quaternionAngle(hand.orientation, target.orientation),
    };
  };
  let reported;
  if (ros.latest(MANAGER_STATUS)) {
    await ros.waitFor(MANAGER_STATUS, (data) => data.behaviour === "behaviour/pose_target", { since, timeoutMs: 5000 });
    await page.getByText(`Moving to ${label}`, { exact: false }).waitFor({ timeout: 5000 });
    await page.getByRole("status", { name: "Going to a pose" }).waitFor({ timeout: 5000 });
    await shot(page, "positions-go-to-moving");
    await ros.waitFor(MANAGER_STATUS, (data) => data.behaviour === "behaviour/passthrough", {
      since: sentAt,
      timeoutMs: 45000,
    });
    reported = `status behaviour/pose_target, then passthrough ${((Date.now() - sentAt) / 1000).toFixed(1)} s after the send`;
  } else {
    // No status to wait on: wait for the commanded pose itself to come back, or say the check cannot run.
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline && (back().error > GO_TO_POSITION_M || back().angle > GO_TO_ANGLE_RAD)) {
      await page.waitForTimeout(200);
    }
    reported = `${NO_STATUS}; the commanded pose came back after ${((Date.now() - sentAt) / 1000).toFixed(1)} s`;
  }
  await page.waitForTimeout(500);
  const { error, angle } = back();
  assert(
    error <= GO_TO_POSITION_M && angle <= GO_TO_ANGLE_RAD,
    `the commanded hand came back ${(error * 1000).toFixed(0)} mm and ${angle.toFixed(3)} rad from ${label}`,
  );
  // qontrol's /ee_pose is the pose it commands; the tip through TF is where the arm is. Give it 5 s to settle.
  const settleFrom = Date.now();
  const tipMiss = (sample) => ({
    metres: distance(sample.position, target.position),
    radians: quaternionAngle(sample.orientation, target.orientation),
  });
  const tipOff = (sample) => {
    const miss = tipMiss(sample);
    return miss.metres > GO_TO_POSITION_M || miss.radians > GO_TO_ANGLE_RAD;
  };
  while (ros.latest(HAND) && tipOff(ros.latest(HAND).data) && Date.now() - settleFrom < 5000) {
    await page.waitForTimeout(100);
  }
  const tip = ros.latest(HAND)?.data;
  assert(tip, `no measured hand on ${HAND}`);
  const miss = tipMiss(tip);
  const tipText = `measured tip ${robot.tipFrame} ${(miss.metres * 1000).toFixed(0)} mm and ${((miss.radians * 180) / Math.PI).toFixed(1)} deg from ${label}`;
  let measured = tipText;
  let expectedRow = "arrived";
  if (tipOff(tip)) {
    // Strict on mock hardware; on a robot naming why its joints may not follow, a miss is a WARN only while a
    // joint is blocked short of its command (scripts/lib/drive-verdict.mjs), and a failure otherwise.
    const gaps = jointGaps();
    const blocked = gaps.filter((row) => Math.abs(row.gap) > BLOCKED_JOINT_RAD);
    const short = gaps
      .slice(0, 3)
      .map((row) => `${row.name} ${row.gap >= 0 ? "+" : ""}${row.gap.toFixed(2)} rad`)
      .join(", ");
    assert(
      robot.jointsMayLag && blocked.length > 0,
      `the ${tipText} after ${((Date.now() - settleFrom) / 1000).toFixed(1)} s; joints short of their command: ${short || "none measured"}`,
    );
    measured = `WARN ${tipText}, joints short of their command: ${short} (${robot.jointsMayLag})`;
    // The row says what the arm did: the server judged it on the measured tip.
    expectedRow = "stopped";
  }
  await expect(page.locator(".bloom-position-progress")).toHaveAttribute("data-state", expectedRow, { timeout: 5000 });
  await expect(page.getByRole("status", { name: "Going to a pose" })).toHaveCount(0);
  await shot(page, "positions-go-to-arrived");
  const summary = `saved ${label} at ${fmtVector(saved.position)} (${verified ? "verified on the TF tip" : "not verified"}); the pad moved it ${(moved * 100).toFixed(1)} cm; the second press sent ${POSE_TARGET} (${target.frame_id}); ${reported}; commanded pose within ${(error * 1000).toFixed(0)} mm and ${((angle * 180) / Math.PI).toFixed(1)} deg`;
  return measured.startsWith("WARN ") ? `${measured}; ${summary}` : `${summary}; ${measured}`;
}

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
  const startHand = await ros.waitFor(HAND, () => true, { since: Date.now(), timeoutMs: 5000 });
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
  const endHand = ros.latest(HAND).data;
  const gaps = jointGaps();
  const components = [...axes(wire.linear, "linear"), ...axes(wire.angular, "angular")].filter(
    (c) => Math.abs(c.value) > 1e-6,
  );
  assert(components.length === 1 && Math.abs(components[0].value) > 0.5, `${gesture.word}: wire ${fmtTwist(wire)}`);
  const [component] = components;
  const floor = component.part === "linear" ? MIN_DISPLACEMENT_M : MIN_ROTATION_RAD;
  const follow = (from, to) => {
    const moved =
      component.part === "linear"
        ? subtract(to.position, from.position)
        : rotationVector(from.orientation, to.orientation);
    const magnitude = Math.hypot(moved.x, moved.y, moved.z);
    return { along: (moved[component.axis] * Math.sign(component.value)) / magnitude, magnitude, moved };
  };
  // What qontrol commanded (/ee_pose), and what the joints did (the hand the 3D view draws).
  const { moved, along, magnitude } = follow(start, end);
  const measured = follow(startHand, endHand);
  // The Explorer's Right lands 89-98% along its axis from the home pose, the QP's compromise, not the wire.
  const commanded = magnitude > floor && along > 0.85;
  // A horizontal push must not sag: the lowest the measured hand went while held, and where it stopped.
  const horizontal = component.part === "linear" && component.axis !== "z";
  const dip = horizontal ? lowestDip(startHand, ros.since(HAND, since)) : 0;
  // How much further from qontrol's command the joints left the hand during this push alone.
  const gap = distance(end.position, endHand.position) - distance(start.position, startHand.position);
  const sagged = dip > MAX_SAG_M;
  const drifted = horizontal && gap > MAX_COMMAND_GAP_M;
  const joints = measured.magnitude > floor && measured.along > 0.85;
  const tolerance = component.part === "linear" ? MAX_SAG_M : MIN_ROTATION_RAD;
  const against = -measured.moved[component.axis] * Math.sign(component.value);
  const wireWord = `${component.part}.${component.axis}${component.value > 0 ? "+" : "-"}`;
  const verdict = driveVerdict({
    commandedAgainst: -moved[component.axis] * Math.sign(component.value),
    commandedFollowed: commanded,
    drifted,
    jointsMayLag: robot.jointsMayLag,
    known: (robot.offAxis ?? []).includes(gesture.word),
    maxJointGap: Math.max(0, ...gaps.map((row) => Math.abs(row.gap))),
    measuredAgainst: against,
    measuredFollowed: joints,
    sagged,
    tolerance,
    wireOk: robot.words[gesture.word] === wireWord,
  });
  const ok = verdict.verdict === "pass";
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
  const flaws = [
    ...(robot.words[gesture.word] === wireWord
      ? []
      : [`the wire is ${wireWord}, the word is ${robot.words[gesture.word]}`]),
    ...(against > tolerance ? [`the joints moved it ${against.toFixed(3)} ${unit} the other way`] : []),
    ...(sagged ? [`sagged ${(dip * 100).toFixed(1)} cm`] : []),
    ...(drifted ? [`joints ${(gap * 100).toFixed(1)} cm further from the command`] : []),
  ];
  const stalled = gaps
    .filter((row) => Math.abs(row.gap) > 0.05)
    .map((row) => `${row.name} ${row.gap.toFixed(2)} rad short of its command`)
    .join(", ");
  if ((flaws.length > 0 || !joints) && stalled) {
    flaws.push(stalled);
  }
  const measuredText = `, joints ${fmtVector(measured.moved)} ${unit} (${(measured.along * 100).toFixed(0)}%${
    horizontal ? `, dip ${(dip * 100).toFixed(1)} cm` : ""
  })`;
  return {
    summary: `${gesture.word} -> ${component.part}.${component.axis} ${sign}1 -> hand ${fmtVector(moved)} ${unit} in base from ${fmtVector(start.position)}, ${(along * 100).toFixed(0)}% along${measuredText}${ok ? "" : ` (${verdict.verdict}${flaws.length ? `: ${flaws.join(", ")}` : ""})`}`,
    verdict,
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

/** The finger once it has stopped: an Open pressed by offerGripper may still be moving it. */
async function settledFinger() {
  let last = fingerPosition();
  for (let waited = 0; waited < 5000; waited += 300) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    const now = fingerPosition();
    if (last !== null && now !== null && Math.abs(now - last) < 0.005) {
      return now;
    }
    last = now;
  }
  return last;
}

function fingerPosition() {
  const joints = ros.latest(JOINTS)?.data;
  const at = joints ? joints.name.indexOf(robot.finger) : -1;
  return at < 0 ? null : joints.position[at];
}

/**
 * Waits for the finger to travel the way a press asked (+1 closing, -1 opening). Travel the other way always fails;
 * no travel fails too, except where the robot names its gripper as one that may not answer (`fingerMayStall`).
 */
async function fingerMoved(before, direction, since, word) {
  assert(before !== null, `no ${robot.finger} in ${JOINTS}`);
  const travelled = (data) => direction * (data.position[data.name.indexOf(robot.finger)] - before);
  const moved = await ros
    .waitFor(JOINTS, (data) => Math.abs(travelled(data)) > MIN_FINGER_TRAVEL_RAD, { since, timeoutMs: FINGER_WAIT_MS })
    .catch(() => null);
  const went = (now) => `${word}: ${robot.finger} ${before.toFixed(2)} -> ${now.toFixed(2)} rad`;
  if (moved === null) {
    const now = fingerPosition();
    assert(robot.fingerMayStall, `${went(now)} in ${FINGER_WAIT_MS} ms, no travel`);
    return `${before.toFixed(2)} -> ${now.toFixed(2)} rad, WARN no travel in ${FINGER_WAIT_MS} ms: ${robot.fingerMayStall}`;
  }
  assert(travelled(moved) > 0, `${went(moved.position[moved.name.indexOf(robot.finger)])}: the opposite way`);
  await new Promise((resolveWait) => setTimeout(resolveWait, 600));
  return `${before.toFixed(2)} -> ${fingerPosition().toFixed(2)} rad`;
}

/** How far below its start the measured hand went at its lowest, in metres (0 when it never went lower). */
function lowestDip(start, samples) {
  return Math.max(0, ...samples.map((sample) => start.position.z - sample.data.position.z));
}

/** Each arm joint's command minus its position, largest first: a joint blocked by a contact shows here. */
function jointGaps() {
  const command = ros.latest(QONTROL_COMMANDS)?.data.data;
  const joints = ros.latest(JOINTS)?.data;
  if (!command || !joints) {
    return [];
  }
  return command
    .map((value, index) => {
      const name = `joint_${index + 1}`;
      const at = joints.name.indexOf(name);
      return at < 0 ? null : { gap: value - joints.position[at], name };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
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

node.create_subscription(PoseStamped, "${POSE}", lambda m: emit("${POSE}", {"frame_id": m.header.frame_id, "position": vector(m.pose.position), "orientation": quaternion(m.pose.orientation)}, 0.05), 10)
node.create_subscription(PoseStamped, "${POSE_TARGET}", lambda m: emit("${POSE_TARGET}", {"frame_id": m.header.frame_id, "position": vector(m.pose.position), "orientation": quaternion(m.pose.orientation)}), 10)
node.create_subscription(TwistStamped, "${TWIST}", lambda m: emit("${TWIST}", {"frame_id": m.header.frame_id, "linear": vector(m.twist.linear), "angular": vector(m.twist.angular)}), 50)
node.create_subscription(Float64MultiArray, "${GRIPPER}", lambda m: emit("${GRIPPER}", {"data": list(m.data)}), 10)
node.create_subscription(Float64, "${MAX_LINEAR}", lambda m: emit("${MAX_LINEAR}", {"data": m.data}), 10)
node.create_subscription(String, "${MODE}", lambda m: emit("${MODE}", {"data": m.data}), 10)
node.create_subscription(JointState, "${JOINT_TARGET}", lambda m: emit("${JOINT_TARGET}", {"name": list(m.name), "position": list(m.position)}, 0.1), 10)
node.create_subscription(String, "${GESTURE}", lambda m: emit("${GESTURE}", {"data": m.data}), 10)
# The manager's lasting behaviours report themselves only while active: the scale at 20 Hz, the confidences at 100 Hz.
node.create_subscription(Float64, "${INTENT_SCALE}", lambda m: emit("${INTENT_SCALE}", {"data": m.data}), 10)
def on_confidences(m):
    label = m.layout.dim[0].label if m.layout.dim else ""
    emit("${CONFIDENCES}", {"data": list(m.data), "ids": [i for i in label.split(",") if i]}, 0.05)
node.create_subscription(Float64MultiArray, "${CONFIDENCES}", on_confidences, 10)
node.create_subscription(PoseStamped, "${SOFT_GOAL}", lambda m: emit("${SOFT_GOAL}", {"frame_id": m.header.frame_id, "position": vector(m.pose.position)}, 0.1), 10)

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

# The manager's latched status, when it has one: reliable and transient local, so the last value arrives on subscribe.
try:
    from diagnostic_msgs.msg import DiagnosticStatus
    from rclpy.qos import ReliabilityPolicy
    latched = QoSProfile(depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL)
    node.create_subscription(DiagnosticStatus, "${MANAGER_STATUS}", lambda m: emit("${MANAGER_STATUS}", {v.key: v.value for v in m.values}), latched)
except ImportError:
    pass

# Markers of every kind the view draws: the shared-control rviz shapes, a coloured trajectory, a label on
# the tool link, a cube list, and every six seconds the robot's own first mesh for three seconds.
markers = node.create_publisher(MarkerArray, "${MARKERS}", 10)
# The same markers on the topic the Bloom Debug app's view reads.
debug_markers = node.create_publisher(MarkerArray, "${STACK.goalMarkers}", 10)
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
    debug_markers.publish(array)
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

# The hand as the joints put it, and the joints next to qontrol's command: a stalled joint shows as a gap.
node.create_subscription(JointState, "${JOINTS}", lambda m: emit("${JOINTS}", {"name": list(m.name), "position": list(m.position)}, 0.05), 10)
node.create_subscription(Float64MultiArray, "${QONTROL_COMMANDS}", lambda m: emit("${QONTROL_COMMANDS}", {"data": list(m.data)}, 0.05), 10)
from rclpy.time import Time
from tf2_ros import Buffer, TransformListener
tf_buffer = Buffer()
tf_listener = TransformListener(tf_buffer, node)
def publish_hand():
    try:
        t = tf_buffer.lookup_transform("base_link", "${robot.tipFrame}", Time())
    except Exception:
        return
    emit("${HAND}", {"position": vector(t.transform.translation), "orientation": quaternion(t.transform.rotation)})
node.create_timer(0.05, publish_hand)

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

/** How far the tip measured through TF is from the pose qontrol commands (/ee_pose), as the save gate sees it. */
function commandedVersusMeasured() {
  const commanded = ros.latest(POSE)?.data;
  const tip = ros.latest(HAND)?.data;
  if (!commanded || !tip) {
    return { metres: 0, radians: 0, text: "TF tip not available" };
  }
  const metres = distance(commanded.position, tip.position);
  const radians = quaternionAngle(commanded.orientation, tip.orientation);
  return {
    metres,
    radians,
    text: `measured tip ${robot.tipFrame} is ${(metres * 1000).toFixed(0)} mm and ${((radians * 180) / Math.PI).toFixed(1)} deg from /ee_pose`,
  };
}

/** The rotation between two orientations, in radians; q and -q are the same one. */
function quaternionAngle(a, b) {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  const norms = Math.hypot(a.x, a.y, a.z, a.w) * Math.hypot(b.x, b.y, b.z, b.w);
  return 2 * Math.acos(Math.min(1, dot / norms));
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
