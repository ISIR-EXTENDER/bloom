import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5173";
const args = process.argv.slice(2);
const outputPath = resolve(readArgument("--out") ?? "docs/assets/demo/bloom-explorer-demo.mp4");
const minimumDurationMs = Number(process.env.BLOOM_DEMO_DURATION_MS ?? "115000");
const pauseScale = Number(process.env.BLOOM_DEMO_PAUSE_SCALE ?? "1");
const temporaryVideoDirectory = await mkdtemp(resolve(tmpdir(), "bloom-explorer-demo-"));

await mkdir(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const context = await browser.newContext({
  recordVideo: { dir: temporaryVideoDirectory, size: { height: 720, width: 1280 } },
  viewport: { height: 720, width: 1280 },
});
const page = await context.newPage();
const video = page.video();
const startedAt = Date.now();

try {
  report("Explorer Drive");
  await openExplorerRuntime(page);
  await show(page, 7000);

  await demonstrateDirectionalControl(page, "Translation");
  await show(page, 5000);

  report("Joystick Lab");
  await selectRuntimeScreen(page, "Joystick lab");
  await page.getByRole("application", { name: "Translation" }).waitFor();
  await show(page, 7000);
  await page.getByRole("button", { name: /^Hybrid/ }).click();
  await show(page, 3500);
  await demonstrateDirectionalControl(page, "Translation");
  await show(page, 5000);

  report("Robot feedback");
  await selectRuntimeScreen(page, "Robot feedback");
  await page.getByText("End effector speed", { exact: true }).waitFor();
  await show(page, 12000);

  report("Command sources");
  await selectRuntimeScreen(page, "Command sources");
  await page.getByText("Runtime events", { exact: true }).waitFor();
  await show(page, 12000);

  report("Bloom Debug");
  await openBloomDebug(page);
  await page.getByRole("button", { name: "Refresh topics" }).click();
  await page.getByRole("heading", { name: "Topic catalog" }).waitFor();
  report("Live debug sample");
  await sendBackgroundExplorerCommand(browser);
  await page.getByRole("button", { name: "Refresh audit" }).click();
  await show(page, 12000);

  const artboard = page.getByTestId("runtime-artboard");
  await artboard.scrollIntoViewIfNeeded();
  await page.getByText("Velocity command X", { exact: true }).waitFor();
  report("Live velocity plot");
  await show(page, 10000);

  const remainingMs = minimumDurationMs - (Date.now() - startedAt);
  if (remainingMs > 0) {
    report("Final debug view");
    await show(page, remainingMs, false);
  }
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

if (!video) {
  throw new Error("Playwright did not create a video for the Explorer demo.");
}

const rawVideoPath = await video.path();
try {
  await transcodeVideo(rawVideoPath, outputPath);
} finally {
  await rm(temporaryVideoDirectory, { force: true, recursive: true });
}

console.log(`Bloom Explorer demo recorded at ${outputPath}`);

function readArgument(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function openExplorerRuntime(page) {
  await page.goto(`${dashboardUrl}/#/runtime`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
  await openRuntimeApp(page, "Explorer Manager");
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
  await page
    .getByRole("status")
    .filter({ hasText: /READY|LIVE/ })
    .first()
    .waitFor({ timeout: 15000 });
}

async function demonstrateDirectionalControl(page, accessibleName, key = "ArrowUp") {
  const control = page.getByRole("application", { name: accessibleName });
  await control.focus();
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.down(key);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1300);
  await page.keyboard.up(key);
}

async function selectRuntimeScreen(page, screenTitle) {
  await holdForMaintenance(page);
  const maintenance = page.getByRole("dialog", { name: "Maintenance" });
  await maintenance
    .getByRole("navigation", { name: "Switch runtime screen" })
    .getByRole("button", { exact: true, name: screenTitle })
    .click();
  await maintenance.waitFor({ state: "detached" });
  await show(page, 700);
}

async function holdForMaintenance(page) {
  const button = page.getByRole("button", { name: "Hold to open maintenance" });
  const bounds = await button.boundingBox();
  if (!bounds) {
    throw new Error("Maintenance button has no visible bounds.");
  }
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor();
  await show(page, 800);
}

async function openBloomDebug(page) {
  await page.goto(`${dashboardUrl}/#/runtime`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
  await show(page, 2500);
  await openRuntimeApp(page, "Bloom Debug");
  await page.getByRole("heading", { name: "Inspect, record, and audit runtime topics." }).waitFor();
  await show(page, 3500);
}

async function sendBackgroundExplorerCommand(browser) {
  const driverContext = await browser.newContext({ viewport: { height: 720, width: 1280 } });
  try {
    const driverPage = await driverContext.newPage();
    await openExplorerRuntime(driverPage);
    await demonstrateDirectionalControl(driverPage, "Translation", "ArrowRight");
  } finally {
    await driverContext.close();
  }
}

function show(page, milliseconds, scale = true) {
  return page.waitForTimeout(scale ? milliseconds * pauseScale : milliseconds);
}

function report(scene) {
  console.log(`Recording: ${scene}`);
}

function transcodeVideo(inputPath, destinationPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        inputPath,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        destinationPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let errorOutput = "";
    ffmpeg.stderr.on("data", (chunk) => {
      errorOutput += chunk;
    });
    ffmpeg.on("error", rejectPromise);
    ffmpeg.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`ffmpeg exited with code ${code}: ${errorOutput.slice(-2000)}`));
    });
  });
}

/** The library opens an app as a role: select its row, keep the remembered role or take the first, open. */
async function openRuntimeApp(page, appName) {
  await page.getByRole("button", { exact: true, name: appName }).click();
  const open = page.locator(".runtime-library-open");
  if (await open.isDisabled()) {
    await page.locator(".runtime-library-roles button").first().click();
  }
  await open.click();
}
