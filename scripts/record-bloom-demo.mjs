/**
 * Record a guided Bloom walkthrough against a live backend and ROS graph, with a visible cursor.
 *
 *   BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 BLOOM_DEMO_ROS_SETUP=<ws>/install/setup.bash \
 *     node scripts/record-bloom-demo.mjs [--out docs/assets/demo/bloom-demo.mp4] [--probe dir] [--camera feed.y4m]
 *
 * Frames come from the Chrome screencast, so the video keeps the page's own resolution. `--probe` runs the same
 * script quickly and saves one screenshot per scene instead of encoding.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const readArgument = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5173";
const rosSetup = process.env.BLOOM_DEMO_ROS_SETUP;
const probeDirectory = readArgument("--probe");
const outputPath = resolve(readArgument("--out") ?? "docs/assets/demo/bloom-demo.mp4");
const cameraFeed = readArgument("--camera");
const pauseScale = probeDirectory ? 0.25 : 1;
const size = { height: 1080, width: 1920 };

const frameDirectory = await mkdtemp(resolve(tmpdir(), "bloom-demo-frames-"));
const browser = await chromium
  .launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      ...(cameraFeed ? [`--use-file-for-fake-video-capture=${resolve(cameraFeed)}`] : []),
    ],
    channel: "chrome",
  })
  .catch(() => chromium.launch());
const context = await browser.newContext({ deviceScaleFactor: 1, permissions: ["camera"], viewport: size });
await context.addInitScript(installDemoOverlay);
const page = await context.newPage();
const frames = [];
const pendingWrites = [];
let cursor = { x: size.width / 2, y: size.height / 2 };
let sceneIndex = 0;

const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const file = resolve(frameDirectory, `${String(frames.length).padStart(6, "0")}.jpg`);
  frames.push({ file, time: metadata.timestamp });
  pendingWrites.push(writeFile(file, Buffer.from(data, "base64")));
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
});

try {
  if (!probeDirectory) {
    await cdp.send("Page.startScreencast", { everyNthFrame: 1, format: "jpeg", quality: 92, ...size });
  }
  await landing();
  await createApp();
  await createScreen();
  await driveExplorer();
  await positionsAndFeedback();
  await joystickLab();
  await settingsAndStop();
  await bloomDebug();
  await camera();
  await closing();
} finally {
  if (!probeDirectory) {
    await cdp.send("Page.stopScreencast").catch(() => undefined);
  }
  await Promise.all(pendingWrites);
  await context.close();
  await browser.close();
}

if (!probeDirectory) {
  await encode();
  console.log(`Bloom demo recorded at ${outputPath}`);
}
await rm(frameDirectory, { force: true, recursive: true });

// ---- Scenes ----

async function landing() {
  await page.goto(`${dashboardUrl}/#/`, { waitUntil: "networkidle" });
  await caption("Bloom", "The control screen for an assistive robot arm, built without code");
  await moveTo(size.width * 0.3, size.height * 0.45, 900);
  await pause(3500);
  await scroll(900);
  await pause(2500);
  await scroll(-900);
  await pause(1200);
  await click(
    page
      .getByRole("link", { name: "Open Builder" })
      .or(page.getByRole("button", { name: "Open Builder" }))
      .first(),
  );
  await page.getByRole("heading", { name: "Choose what to build." }).waitFor();
  await snapshot("landing");
}

async function createApp() {
  await caption("Builder", "Create an app from a guided starter");
  await pause(2000);
  await click(page.getByRole("button", { exact: true, name: "Apps" }));
  const name = page.getByLabel("New app name");
  await name.scrollIntoViewIfNeeded();
  await pause(800);
  await click(name);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Kitchen Assist", { delay: 70 });
  await click(page.getByLabel("Starter screen"));
  await page.getByLabel("Starter screen").selectOption("operator-control");
  await pause(600);
  await click(page.getByRole("button", { name: "Create guided app" }));
  await page.getByRole("heading", { exact: true, name: "Kitchen Assist" }).waitFor();
  await page.evaluate(() => window.scrollTo({ behavior: "smooth", top: 0 }));
  await pause(2500);
  await snapshot("app-created");
}

async function createScreen() {
  await caption("Builder", "Add a screen, then lay it out on the panel");
  const screenName = page.getByLabel("New screen name");
  await screenName.scrollIntoViewIfNeeded();
  await click(screenName);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Grab a cup", { delay: 70 });
  await click(page.getByRole("button", { name: "Create screen" }));
  await click(page.getByRole("button", { name: "Save app" }));
  await page.getByRole("button", { name: "Open Grab a cup screen builder" }).waitFor();
  await pause(900);
  await click(page.getByRole("button", { name: "Open Grab a cup screen builder" }));
  await page.getByRole("heading", { exact: true, name: "Grab a cup" }).waitFor();
  await pause(1800);

  await click(page.getByRole("button", { name: "Add Joystick widget" }));
  await pause(900);
  await drag(page.getByRole("button", { name: /^Select and move .* widget$/ }).last(), [{ dx: 120, dy: 80 }]);
  await caption("Builder", "Every widget shows its size on the real glass, and says when it is too small");
  await pause(3200);
  await drag(page.getByRole("button", { name: /^Resize .* widget$/ }).last(), [
    { dx: 90, dy: 90, ms: 700 },
    { dx: 200, dy: 200, ms: 1100 },
  ]);
  await pause(2200);
  await click(page.getByRole("button", { name: "Add Command button widget" }));
  await pause(900);
  await drag(page.getByRole("button", { name: /^Select and move .* widget$/ }).last(), [{ dx: 640, dy: 120 }]);
  await pause(1200);
  await caption("Builder", "Say what a control does: where it sends, and what. No code.");
  await typeInto("Button label", "Jaco mode");
  await typeInto("Output topic", "/mode_request");
  await typeInto("ROS message type", "std_msgs/msg/String");
  await typeInto("Payload", '{"data": "geometric/jaco"}');
  await pause(2500);
  await click(page.getByRole("button", { name: "Save changes" }));
  await pause(2000);
  await snapshot("screen-built");
}

async function driveExplorer() {
  await caption("Runtime", "Open an app as a role. The role picks the layout.");
  await click(page.getByRole("button", { name: /^Runtime:/ }));
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
  await pause(1500);
  await click(page.getByRole("button", { exact: true, name: "Explorer Manager" }));
  await pause(1200);
  await caption("Roles", "One app, a screen for each person: the operator, the engineer, a one-switch user");
  for (const role of ["Operator", "Bench", "One switch"]) {
    const button = page.locator(".runtime-library-roles button").filter({ hasText: role }).first();
    const box = await centerOf(button);
    await moveTo(box.x, box.y, 700);
    await pause(1300);
  }
  await click(page.locator(".runtime-library-roles button").filter({ hasText: "Operator" }).first());
  await pause(900);
  await click(page.locator(".runtime-library-open"));
  await page.getByRole("status").filter({ hasText: /READY/ }).first().waitFor({ timeout: 20000 });
  await caption("Explorer · Drive", "Live against cartesian_manager and the Explorer simulation");
  await pause(2500);
  await drag(page.getByRole("application", { name: "Translation" }), [
    { dx: 0, dy: -120, ms: 700 },
    { dx: 0, dy: -120, ms: 1800 },
    { dx: 110, dy: -40, ms: 1200 },
  ]);
  await pause(800);
  await drag(page.getByRole("application", { name: "Rotation" }), [
    { dx: -120, dy: 0, ms: 700 },
    { dx: -120, dy: 0, ms: 1500 },
  ]);
  await pause(600);
  await click(page.getByRole("button", { name: /^Fast/ }).first());
  await pause(900);
  await click(page.getByRole("button", { name: /Close gripper/ }).first());
  await pause(2000);
  await snapshot("drive");
}

async function positionsAndFeedback() {
  await openScreen("Positions");
  await caption("Positions", "Send a named pose. Go home asks for a second press.");
  await pause(1800);
  await click(page.locator("button").filter({ hasText: "Go home" }).first());
  await pause(900);
  await click(page.locator("button").filter({ hasText: "Go home" }).first());
  await pause(1800);
  await openScreen("Robot feedback");
  await caption("Robot feedback", "The home pose runs while every series streams live from ROS");
  await pause(3000);
  await click(page.getByRole("button", { name: /^Height/ }).first());
  await pause(6000);
  await snapshot("feedback");
  await openScreen("Positions");
  await click(page.locator("button").filter({ hasText: "Release" }).first());
  await pause(1500);
}

async function joystickLab() {
  await openScreen("Joystick lab");
  await caption("Joystick lab", "Choose the frame every twist is stamped with, and read what was sent");
  await pause(2000);
  await click(page.getByRole("button", { name: /^Hybrid/ }).first());
  await pause(1200);
  await drag(page.getByRole("application", { name: "Translation" }), [
    { dx: 100, dy: 0, ms: 600 },
    { dx: 0, dy: -100, ms: 900 },
    { dx: -100, dy: 0, ms: 900 },
    { dx: 0, dy: 100, ms: 900 },
  ]);
  await pause(500);
  await drag(
    page
      .getByRole("slider", { name: /Height/ })
      .or(page.getByRole("application", { name: "Height" }))
      .first(),
    [
      { dx: 0, dy: -110, ms: 700 },
      { dx: 0, dy: -110, ms: 1200 },
    ],
  );
  await pause(500);
  await drag(
    page
      .getByRole("slider", { name: /Pivot/ })
      .or(page.getByRole("application", { name: "Pivot" }))
      .first(),
    [
      { dx: -130, dy: 0, ms: 700 },
      { dx: -130, dy: 0, ms: 1200 },
    ],
  );
  await pause(600);
  await hold(page.getByRole("button", { name: /Hold snake/ }).first(), 1800);
  await pause(1500);
  await snapshot("joystick-lab");
}

async function settingsAndStop() {
  await caption("Maintenance", "A 1.5 s hold. The robot is held at zeros while it is open.");
  await openMaintenance();
  await pause(3000);
  await click(page.getByRole("dialog").getByRole("button", { name: /^Settings/ }));
  await caption("Settings", "Text size, language and how the operator reaches the controls");
  await pause(2200);
  await click(page.getByRole("button", { exact: true, name: "Larger" }));
  await pause(1800);
  await click(page.getByRole("button", { exact: true, name: "Normal" }));
  await pause(700);
  await click(page.getByRole("button", { name: /^ES$|Español/ }).first());
  await pause(1800);
  await click(page.getByRole("button", { name: /Guardar y reanudar|Save and resume/ }).first());
  await caption("STOP", "Always live, latched by the backend, one-second hold to resume");
  await pause(2500);
  await click(page.locator(".runtime-stop-control"));
  await pause(2800);
  await hold(page.locator(".runtime-stop-control"), 1400);
  await pause(2000);
  await snapshot("stop");
  await openMaintenance();
  await click(page.getByRole("dialog").getByRole("button", { exact: true, name: "EN" }));
  await pause(900);
  await click(page.getByRole("dialog").getByRole("button", { name: /^Resume operating/ }));
  await pause(1200);
}

async function bloomDebug() {
  await openMaintenance();
  await click(page.getByRole("dialog", { name: "Maintenance" }).getByRole("button", { name: /^Exit to library/ }));
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
  await pause(1200);
  await click(page.getByRole("button", { exact: true, name: "Bloom Debug" }));
  await pause(900);
  await click(page.locator(".runtime-library-open"));
  const mover = startRosMover(32);
  await caption("Bloom Debug", "Joint states, the Jacobian and any series, from the live ROS graph");
  await pause(3000);
  await click(page.getByRole("button", { name: "Refresh topics" }));
  await pause(2500);
  await click(page.getByRole("button", { name: /^joint_3 position/ }));
  await pause(700);
  await click(page.getByRole("button", { name: /^\/ee_pose position\.z/ }));
  await pause(6000);
  await moveTo(size.width * 0.2, size.height * 0.75, 900);
  await pause(5000);
  await moveTo(size.width * 0.55, size.height * 0.8, 900);
  await pause(5000);
  await click(page.getByRole("button", { name: "Refresh audit" }));
  await pause(4000);
  await snapshot("bloom-debug");
  await mover;
  await openScreen("Robot view");
  const drawing = startRosMover(16);
  await caption("Robot view", "The robot in 3D as it moves, drawn from its own description");
  const stage = page.locator('[aria-label="Robot 3D view"][data-model="ready"]');
  await stage.waitFor({ timeout: 30000 });
  // Closer, then around: the view is a scene to look into, not a picture.
  const middle = await centerOf(stage);
  await moveTo(middle.x, middle.y + 60, 900);
  await pause(1500);
  await scroll(-900);
  await pause(2500);
  await caption("Robot view", "Drag to look around, wheel to come closer");
  await drag(stage, [
    { dx: 220, dy: 0, ms: 1600 },
    { dx: 120, dy: -40, ms: 1200 },
  ]);
  await pause(6000);
  await snapshot("robot-view");
  await drawing;
}

async function camera() {
  await openMaintenance();
  await click(page.getByRole("dialog", { name: "Maintenance" }).getByRole("button", { name: /^Exit to library/ }));
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
  await click(page.getByRole("button", { exact: true, name: "Webcam visualizer" }));
  await click(page.locator(".runtime-library-open"));
  await caption("Camera", "A local camera in the runtime, ready to publish to ROS");
  await pause(7000);
  await snapshot("camera");
}

async function closing() {
  await openMaintenance();
  await click(page.getByRole("dialog", { name: "Maintenance" }).getByRole("button", { name: /^Exit to library/ }));
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
  await pause(800);
  await page.evaluate(() => {
    window.location.hash = "#/";
  });
  await page.getByRole("button", { name: /^Home:/ }).waitFor();
  await caption("Bloom", "Give the gesture back.");
  await moveTo(size.width - 60, size.height - 60, 1200);
  await pause(4000);
  await snapshot("closing");
}

// ---- Helpers ----

async function typeInto(label, text) {
  const advanced = page.locator("details.builder-settings-advanced");
  if ((await advanced.count()) > 0 && !(await advanced.first().evaluate((node) => node.open))) {
    await advanced.first().locator("summary").click();
  }
  const field = page
    .locator("label.builder-settings-field", { has: page.locator("span", { hasText: new RegExp(`^${label}$`) }) })
    .locator("input, textarea")
    .first();
  await field.scrollIntoViewIfNeeded();
  await click(field);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(text, { delay: 55 });
  await page.keyboard.press("Tab");
  await pause(500);
}

async function openScreen(title) {
  await openMaintenance();
  await click(
    page
      .getByRole("dialog", { name: "Maintenance" })
      .getByRole("navigation", { name: "Switch runtime screen" })
      .getByRole("button", { exact: true, name: title }),
  );
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor({ state: "detached" });
  await pause(900);
}

async function openMaintenance() {
  await hold(page.locator(".runtime-kiosk-maintenance"), 1700);
  await page.getByRole("dialog").waitFor();
  await pause(900);
}

async function centerOf(locator) {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  if (!bounds) {
    throw new Error(`No bounds for ${locator}`);
  }
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function moveTo(x, y, milliseconds = 650) {
  const steps = Math.max(6, Math.round((milliseconds * pauseScale) / 16));
  const start = cursor;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    await page.mouse.move(start.x + (x - start.x) * eased, start.y + (y - start.y) * eased);
    await page.waitForTimeout(16);
  }
  cursor = { x, y };
}

async function click(locator) {
  const target = await centerOf(locator);
  await moveTo(target.x, target.y);
  await pause(180);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await pause(350);
}

async function hold(locator, milliseconds) {
  const target = await centerOf(locator);
  await moveTo(target.x, target.y);
  await pause(200);
  await page.mouse.down();
  await page.waitForTimeout(milliseconds);
  await page.mouse.up();
}

/** Press on the element, follow each segment relative to the press point, then release where it ended. */
async function drag(locator, segments) {
  const origin = await centerOf(locator);
  await moveTo(origin.x, origin.y);
  await pause(200);
  await page.mouse.down();
  for (const segment of segments) {
    await moveTo(origin.x + segment.dx, origin.y + segment.dy, segment.ms ?? 700);
  }
  await pause(250);
  await page.mouse.up();
}

async function scroll(deltaY) {
  const chunks = 24;
  for (let index = 0; index < chunks; index += 1) {
    await page.mouse.wheel(0, deltaY / chunks);
    await page.waitForTimeout(20);
  }
}

function pause(milliseconds) {
  return page.waitForTimeout(milliseconds * pauseScale);
}

async function caption(title, detail) {
  console.log(`Scene: ${title} — ${detail}`);
  await page.evaluate(([heading, text]) => window.__bloomDemoCaption?.(heading, text), [title, detail]);
}

async function snapshot(name) {
  sceneIndex += 1;
  if (probeDirectory) {
    await mkdir(probeDirectory, { recursive: true });
    await page.screenshot({ path: resolve(probeDirectory, `${String(sceneIndex).padStart(2, "0")}-${name}.png`) });
  }
}

/** A slow figure-eight on the joystick input, so Debug has motion to show while no operator is driving. */
function startRosMover(seconds) {
  if (!rosSetup) {
    return Promise.resolve();
  }
  const script = `
import math, time, rclpy
from geometry_msgs.msg import TwistStamped
rclpy.init()
node = rclpy.create_node("bloom_demo_mover")
pub = node.create_publisher(TwistStamped, "/joystick_cartesian_command", 10)
start = time.time()
while time.time() - start < ${seconds}:
    t = time.time() - start
    msg = TwistStamped()
    msg.header.frame_id = "base_link"
    msg.header.stamp = node.get_clock().now().to_msg()
    msg.twist.linear.y = 0.4 * math.sin(2 * math.pi * t / 8)
    msg.twist.linear.z = 0.3 * math.sin(4 * math.pi * t / 8)
    pub.publish(msg)
    time.sleep(0.02)
node.destroy_node()
rclpy.shutdown()
`;
  return new Promise((resolvePromise) => {
    const child = spawn("bash", ["-c", `set +u; source "${rosSetup}"; exec python3 -c "$BLOOM_DEMO_MOVER"`], {
      env: { ...process.env, BLOOM_DEMO_MOVER: script },
      stdio: "ignore",
    });
    child.on("exit", () => resolvePromise());
    child.on("error", () => resolvePromise());
  });
}

async function encode() {
  await mkdir(dirname(outputPath), { recursive: true });
  const lines = frames.map((frame, index) => {
    const next = frames[index + 1];
    const duration = next ? Math.max(0.001, next.time - frame.time) : 1;
    return `file '${frame.file}'\nduration ${duration.toFixed(4)}`;
  });
  const last = frames.at(-1);
  const list = resolve(frameDirectory, "frames.txt");
  await writeFile(list, `${lines.join("\n")}\nfile '${last.file}'\n`);
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-vf",
    "fps=30,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "23",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
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

/** Runs in the page: a cursor that follows real pointer events and a lower-third caption. */
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
      #bloom-demo-caption { position: fixed; left: 32px; bottom: 32px; z-index: 2147483646; pointer-events: none;
        max-width: 760px; padding: 16px 22px; border-radius: 16px; background: rgb(31 42 36 / 88%); color: #fbf7ef;
        font: 500 20px/1.35 system-ui, sans-serif; box-shadow: 0 10px 30px rgb(0 0 0 / 25%);
        opacity: 0; transform: translateY(12px); transition: opacity 280ms ease, transform 280ms ease; }
      #bloom-demo-caption.is-visible { opacity: 1; transform: none; }
      #bloom-demo-caption strong { display: block; margin-bottom: 2px; color: #e9c46a; font-size: 14px;
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
      hideTimer = setTimeout(() => captionBox.classList.remove("is-visible"), 5200);
    };
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
}
