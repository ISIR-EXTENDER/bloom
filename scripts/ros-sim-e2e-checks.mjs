/**
 * Drive a Manager app on a live simulated robot and verify each gesture on the ROS graph, not only in the page.
 *
 *   BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-sim-e2e-checks.mjs --robot explorer|kinova [--out dir]
 *
 * Needs a sourced ROS environment on the simulation's ROS_DOMAIN_ID. scripts/ros-sim-e2e.sh sets all of this up.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
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
  },
  kinova: {
    app: "Kinova Manager",
    joints: 7,
    // command_max_linear_velocity is 0.05 m/s on the gen3.
    driveHoldMs: 2500,
    gripper: { close: [0.8], open: [0.0] },
    speed: { slow: 0.025, medium: 0.05 },
    goHome: false,
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
} = STACK;
const MIN_DISPLACEMENT_M = 0.03;
const MIN_ROTATION_RAD = 0.05;

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
from geometry_msgs.msg import PoseStamped, TwistStamped
from sensor_msgs.msg import JointState
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
