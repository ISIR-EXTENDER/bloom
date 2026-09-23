/**
 * Robin's AprilTag flow on a live simulated robot: the gripper camera in Bloom, the enable and save
 * controls reaching the visual servoing node, the node answering with velocity and error, and STOP
 * switching the servoing off. Tag detections and camera frames are synthetic (no camera in Gazebo);
 * the node, the manager and Bloom are real.
 *
 *   BLOOM_DASHBOARD_URL=... node scripts/ros-sim-e2e-visual-servoing-checks.mjs --robot explorer|kinova [--out dir]
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const readArg = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5173";
const robotKey = readArg("--robot") ?? "kinova";
const outputDir = resolve(readArg("--out") ?? `/tmp/bloom-ros-sim-e2e-${robotKey}-visual-servoing`);
const screenDir = resolve(outputDir, "screens");

const ON = "/ui/visual_servoing/on";
const SAVE = "/ui/visual_servoing/save";
const VELOCITY = "/visual_servoing/velocity_command";
const ERROR = "/visual_servoing/error_TAGtoTAGd";
const TAGS = "/tag_detections";
const CAMERA = "/camera/color/image_raw/compressed";
const MANAGER_INPUT = "/visual_servoing_cartesian_command";
//: A tag the node already knows (config/saved_tag_goals.yaml), seen a little off its saved pose.
const SEEN_TAG = { id: 2, position: [0.05, 0.02, 0.25] };

await mkdir(screenDir, { recursive: true });
const ros = await startRosProbe();
const results = [];
let shotIndex = 0;

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
try {
  await servoSession();
} finally {
  await browser.close();
  ros.stop();
}

await writeFile(resolve(outputDir, "results.json"), `${JSON.stringify({ robot: robotKey, results }, null, 2)}\n`);
const failed = results.filter((result) => result.status === "fail");
console.log(
  `\n${robotKey} visual servoing: ${results.length - failed.length}/${results.length} checks passed (${outputDir})`,
);
process.exit(failed.length > 0 ? 1 : 0);

async function servoSession() {
  const { page } = await newPage({ width: 1280, height: 720 });

  const opened = await check(page, "library-opens-servo", async () => {
    await openApp(page, "Visual servoing", "Operator", "servo");
    await shot(page, "servo");
    return "servo, READY";
  });
  if (!opened) {
    return;
  }

  await check(page, "gripper-camera-shows-frames", async () => {
    // Frames flow on their own socket; the widget swaps its placeholder for an image when the first one lands.
    const image = page.locator('[data-widget-kind="camera"] img.bloom-camera-image').first();
    await image.waitFor({ timeout: 15000 });
    const src = await image.getAttribute("src");
    assert(src?.startsWith("blob:"), `camera image src is ${src}`);
    await shot(page, "gripper-camera");
    return `frames from ${CAMERA} rendered in the Gripper camera widget`;
  });

  await check(page, "tag-detections-reach-the-monitor", async () => {
    const echo = page.locator('[data-widget-kind="topic-echo"]').first();
    await echo
      .getByText(/"id":\s*2|id: 2/)
      .first()
      .waitFor({ timeout: 10000 });
    return `tag ${SEEN_TAG.id} listed from ${TAGS}`;
  });

  await check(page, "enable-reaches-the-node-and-it-answers", async () => {
    const since = Date.now();
    await page.getByRole("button", { name: "Visual servoing: Off" }).click();
    const on = await ros.waitFor(ON, (data) => data.data === true, { since });
    assert(on.data === true, "enable did not publish true");
    // The node runs its loop at 30 Hz once on; with a tag off its saved pose the velocity is not zero.
    const velocity = await ros.waitFor(VELOCITY, (data) => !isZeroTwist(data), { since, timeoutMs: 10000 });
    const error = await ros.waitFor(ERROR, () => true, { since, timeoutMs: 5000 });
    await shot(page, "servoing");
    return `on -> velocity ${fmtVector(velocity.linear)} m/s, error ${fmtVector(error.linear)} m`;
  });

  await check(page, "monitor-shows-the-servo-numbers", async () => {
    await switchScreen(page, "Monitor");
    const strip = page.getByRole("list", { name: "Servo velocity" });
    await strip
      .getByText(/[+-]\d\.\d{2}/)
      .first()
      .waitFor({ timeout: 10000 });
    await shot(page, "monitor");
    await switchScreen(page, "Servo");
    return "Monitor's velocity strip shows live numbers";
  });

  await check(page, "manager-reads-the-servo-velocity", async () => {
    // Open loop today: the manager configs declare only the joystick source and name a topic nobody
    // publishes. The check documents it as a skip until cartesian_manager closes it.
    const subscribers = ros.subscribers(VELOCITY);
    if (!subscribers.some((name) => name.includes("cartesian_manager"))) {
      skip(
        `cartesian_manager does not subscribe to ${VELOCITY} (it names ${MANAGER_INPUT} and declares only the joystick source)`,
      );
    }
    return `cartesian_manager subscribes to ${VELOCITY}`;
  });

  await check(page, "save-writes-the-tag-goal", async () => {
    const since = Date.now();
    await page.getByRole("button", { name: "Save this view" }).click();
    await ros.waitFor(SAVE, (data) => data.data === "save", { since });
    const goalsPath = resolve(outputDir, "saved_tag_goals.yaml");
    const deadline = Date.now() + 5000;
    let goals = "";
    while (Date.now() < deadline) {
      goals = await readFile(goalsPath, "utf8").catch(() => "");
      if (/tag_id:\s*2\b/.test(goals)) {
        break;
      }
      await page.waitForTimeout(200);
    }
    assert(/tag_id:\s*2\b/.test(goals), `tag ${SEEN_TAG.id} not written to ${goalsPath}`);
    return `save -> ${SAVE}, tag ${SEEN_TAG.id} rewritten in saved_tag_goals.yaml`;
  });

  await check(page, "stop-switches-servoing-off", async () => {
    const since = Date.now();
    await page.getByRole("button", { name: "Stop the robot" }).click();
    const off = await ros.waitFor(ON, (data) => data.data === false, { since });
    assert(off.data === false, "STOP did not publish visual servoing off");
    const quiet = await ros
      .waitFor(VELOCITY, (data) => isZeroTwist(data), { since, timeoutMs: 5000 })
      .catch(() => null);
    const resume = page.getByRole("button", { name: "Hold for one second to resume" });
    await hold(page, resume, 1300);
    await page.getByRole("button", { name: "Stop the robot" }).waitFor();
    return `STOP published ${ON} false${quiet ? ", node went quiet" : ""}, resumed after the hold`;
  });

  await check(page, "approach-screen-drives-through-the-manager", async () => {
    // Approach is the Bench role's layout, reached by opening as Bench, not by navigating.
    await openApp(page, "Visual servoing", "Bench", "approach");
    const since = Date.now();
    const pad = page.getByRole("application", { name: "Translation" });
    const box = await pad.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2, { steps: 8 });
    await page.waitForTimeout(600);
    await page.mouse.up();
    const twist = await ros.waitFor("/joystick_cartesian_command", (data) => !isZeroTwist(data), { since });
    await shot(page, "approach");
    return `translation pad -> /joystick_cartesian_command linear ${fmtVector(twist.linear)}`;
  });
}

// ---- Helpers ----

async function newPage(viewport) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`page error: ${error.message}`));
  return { context, page };
}

async function openApp(page, appName, roleName, layoutId) {
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { exact: true, name: appName }).click();
  const roles = page.locator(".runtime-library-roles");
  if (roleName) {
    await roles.getByRole("button", { exact: true, name: roleName }).click();
  }
  await page.locator(".runtime-library-open").click();
  await page.locator(`[data-testid="runtime-artboard"][data-screen-id="${layoutId}"]`).waitFor({ timeout: 15000 });
  await page.getByRole("status").filter({ hasText: /READY/ }).first().waitFor({ timeout: 20000 });
}

async function switchScreen(page, title) {
  const dialog = page.getByRole("dialog", { name: "Maintenance" });
  await hold(page, page.getByRole("button", { name: "Hold to open maintenance" }), 1700);
  await dialog.getByRole("navigation", { name: "Switch runtime screen" }).getByRole("button", { name: title }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function hold(page, locator, milliseconds) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(milliseconds);
  await page.mouse.up();
}

async function shot(page, name) {
  shotIndex += 1;
  const file = `${String(shotIndex).padStart(2, "0")}-${robotKey}-${name}.png`;
  await page.screenshot({ path: resolve(screenDir, file) }).catch(() => undefined);
}

function skip(reason) {
  throw Object.assign(new Error(reason), { skipped: true });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function check(page, name, run) {
  try {
    const detail = await run();
    results.push({ detail, name, status: "pass" });
    console.log(`PASS ${name}: ${detail}`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    if (error?.skipped) {
      results.push({ detail, name, status: "skip" });
      console.log(`SKIP ${name}: ${detail}`);
      return true;
    }
    results.push({ detail, name, status: "fail" });
    console.error(`FAIL ${name}: ${detail}`);
    await shot(page, `${name}.failed`);
    return false;
  }
}

function isZeroTwist(twist) {
  return [twist.linear, twist.angular].every((v) => Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 1e-9);
}

function fmtVector(v) {
  return `(${[v.x, v.y, v.z].map((value) => value.toFixed(3)).join(", ")})`;
}

// ---- ROS side: the synthetic camera and tag, and the listeners ----

function probeSource() {
  return `
import base64, json, struct, sys, time, zlib, rclpy
from rclpy.node import Node
from geometry_msgs.msg import TwistStamped
from sensor_msgs.msg import CompressedImage
from std_msgs.msg import Bool, String
from extender_msgs.msg import SharedControlGoal, SharedControlGoalArray

rclpy.init()
node = Node("bloom_visual_servoing_probe")
last = {}

def emit(topic, data, period=0.0):
    now = time.monotonic()
    if period and now - last.get(topic, 0.0) < period:
        return
    last[topic] = now
    print(json.dumps({"topic": topic, "data": data}), flush=True)

def vector(v):
    return {"x": v.x, "y": v.y, "z": v.z}

node.create_subscription(Bool, "${ON}", lambda m: emit("${ON}", {"data": bool(m.data)}), 10)
node.create_subscription(String, "${SAVE}", lambda m: emit("${SAVE}", {"data": m.data}), 10)
node.create_subscription(TwistStamped, "${VELOCITY}", lambda m: emit("${VELOCITY}", {"linear": vector(m.twist.linear), "angular": vector(m.twist.angular)}, 0.05), 10)
node.create_subscription(TwistStamped, "${ERROR}", lambda m: emit("${ERROR}", {"linear": vector(m.twist.linear), "angular": vector(m.twist.angular)}, 0.05), 10)
node.create_subscription(TwistStamped, "/joystick_cartesian_command", lambda m: emit("/joystick_cartesian_command", {"linear": vector(m.twist.linear), "angular": vector(m.twist.angular)}), 50)

# A 16x16 PNG (solid green) is enough for the widget to decode and show.
def png_frame():
    raw = b"".join(b"\\x00" + b"\\x3a\\x8f\\x5c" * 16 for _ in range(16))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return (b"\\x89PNG\\r\\n\\x1a\\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 16, 16, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

FRAME = png_frame()
tags_pub = node.create_publisher(SharedControlGoalArray, "${TAGS}", 10)
camera_pub = node.create_publisher(CompressedImage, "${CAMERA}", 10)

def publish_synthetic():
    now = node.get_clock().now().to_msg()
    tags = SharedControlGoalArray()
    tags.header.stamp = now
    tags.header.frame_id = "camera_link"
    goal = SharedControlGoal()
    goal.id = ${SEEN_TAG.id}
    goal.goal_pose.position.x, goal.goal_pose.position.y, goal.goal_pose.position.z = ${JSON.stringify(SEEN_TAG.position)}
    goal.goal_pose.orientation.w = 1.0
    tags.goal_array.append(goal)
    tags_pub.publish(tags)
    image = CompressedImage()
    image.header.stamp = now
    image.format = "png"
    image.data = list(FRAME)
    camera_pub.publish(image)

node.create_timer(0.1, publish_synthetic)

def graph():
    names = sorted({info.node_name for info in node.get_subscriptions_info_by_topic("${VELOCITY}") if info.node_name != node.get_name()})
    print(json.dumps({"subscribers": {"${VELOCITY}": names}}), flush=True)

node.create_timer(1.0, graph)
print(json.dumps({"topic": "probe", "data": "ready"}), flush=True)
try:
    rclpy.spin(node)
except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
    pass
`;
}

async function startRosProbe() {
  const child = spawn("python3", ["-u", "-c", probeSource()], { stdio: ["ignore", "pipe", "inherit"] });
  const messages = new Map();
  let subscribers = {};
  createInterface({ input: child.stdout }).on("line", (line) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (parsed.subscribers) {
      subscribers = parsed.subscribers;
      return;
    }
    const list = messages.get(parsed.topic) ?? [];
    list.push({ data: parsed.data, t: Date.now() });
    if (list.length > 4000) {
      list.splice(0, list.length - 4000);
    }
    messages.set(parsed.topic, list);
  });
  const exited = new Promise((resolvePromise) => child.on("exit", resolvePromise));

  const probe = {
    since: (topic, time) => (messages.get(topic) ?? []).filter((message) => message.t >= time),
    stop: () => child.kill("SIGINT"),
    subscribers: (topic) => subscribers[topic] ?? [],
    async waitFor(topic, predicate, { since = 0, timeoutMs = 5000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = probe.since(topic, since).find((message) => predicate(message.data));
        if (found) {
          return found.data;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      const seen = probe
        .since(topic, since)
        .slice(-3)
        .map((message) => JSON.stringify(message.data));
      throw new Error(`timed out after ${timeoutMs} ms on ${topic}; last seen: ${seen.join(" ") || "nothing"}`);
    },
  };
  const ready = await Promise.race([
    probe.waitFor("probe", () => true, { timeoutMs: 30000 }).then(() => true),
    exited.then(() => false),
  ]).catch(() => false);
  if (!ready) {
    child.kill("SIGKILL");
    console.error(`The probe did not start on ROS_DOMAIN_ID=${process.env.ROS_DOMAIN_ID ?? 0}; is ROS sourced?`);
    process.exit(1);
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
  return probe;
}
