import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

/**
 * Capture the README previews.
 *
 * The set is meant to be exhaustive across the surfaces someone evaluating
 * Bloom would want to see, not just the entry points: the screen builder and
 * the Explorer Manager screens are what the tool is actually for, and neither
 * used to appear at all.
 *
 * Run against a dashboard with a seeded backend:
 *   BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 npm run capture:readme
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outputDir = resolve(repoRoot, "docs/assets/screenshots");
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5174";

const shot = (name) => resolve(outputDir, `${name}.png`);

await mkdir(outputDir, { recursive: true });

const browser = await launchBrowser();
const captured = [];
const skipped = [];

try {
  const context = await browser.newContext({
    permissions: ["camera"],
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  await page.goto(dashboardUrl, { waitUntil: "networkidle" });

  // ---------------------------------------------------------------- product
  await step("landing-page", async () => {
    await page.getByRole("heading", { name: /robot interfaces that grow cleanly/i }).waitFor();
  });

  await step("builder-home", async () => {
    await page.getByRole("button", { name: "Builder: Compose screens" }).click();
    await page.getByRole("heading", { name: "Choose what to build." }).waitFor();
  });

  await step("builder-screen-library", async () => {
    await page.getByRole("button", { exact: true, name: "Screen library" }).click();
    await page.waitForTimeout(600);
  });

  // The builder canvas and inspector: the surface Bloom exists to provide, and
  // the one the previews never showed.
  await step("builder-screen-canvas", async () => {
    await page.goto(`${dashboardUrl}/#/builder/screen`, { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Bloom builder workspace" }).waitFor();
    await page.waitForTimeout(900);
  });

  await step("app-configuration", async () => {
    await page.goto(`${dashboardUrl}/#/builder`, { waitUntil: "networkidle" });
    await page.getByRole("button", { exact: true, name: "Apps" }).click();
    await page.getByRole("button", { name: "Open Sandbox V0.0 app" }).click();
    await page.getByRole("heading", { name: "App theme" }).waitFor();
  });

  // ---------------------------------------------------------------- runtime
  await step("runtime-library", async () => {
    await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
    await page.getByRole("heading", { name: "Choose an app to operate." }).waitFor();
  });

  // Explorer Manager is the app built for the cartesian_manager architecture,
  // so each of its screens gets a preview.
  const explorerScreens = [
    ["runtime-explorer-drive", "Drive"],
    ["runtime-explorer-positions", "Positions"],
    ["runtime-explorer-feedback", "Robot feedback"],
    ["runtime-explorer-command-sources", "Command sources"],
  ];

  await step(explorerScreens[0][0], async () => {
    await page.getByRole("button", { name: "Launch Explorer Manager runtime" }).click();
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(800);
  });

  for (const [name, screenTitle] of explorerScreens.slice(1)) {
    await step(name, async () => {
      await page.getByRole("button", { exact: true, name: screenTitle }).click();
      await page.waitForTimeout(700);
    });
  }

  await step("runtime-live-teleop", async () => {
    await openRuntimeLibrary(page);
    await page.getByRole("button", { name: "Launch Sandbox V0.0 runtime" }).click();
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(600);
  });

  await step("runtime-camera", async () => {
    await openRuntimeLibrary(page);
    await page.getByRole("button", { name: "Launch Webcam visualizer runtime" }).click();
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(800);
  });

  await step("runtime-bloom-debug", async () => {
    await openRuntimeLibrary(page);
    await page.getByRole("button", { name: "Launch Bloom Debug runtime" }).click();
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(600);
  });

  await step("help", async () => {
    // Reached by route: the runtime view hides the product nav.
    await page.goto(`${dashboardUrl}/#/help`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
  });

  async function step(name, navigate) {
    try {
      await navigate();
      await capture(page, shot(name));
      captured.push(name);
    } catch (error) {
      // One unreachable screen must not cost every later shot, and a silent
      // skip would leave a stale image in the README pretending to be current.
      skipped.push(`${name}: ${String(error).split("\n")[0]}`);
    }
  }
} finally {
  await browser.close();
}

console.log(`Captured ${captured.length} screenshots in ${outputDir}`);
for (const name of captured) {
  console.log(`  ok      ${name}`);
}
for (const failure of skipped) {
  console.log(`  SKIPPED ${failure}`);
}
if (skipped.length > 0) {
  process.exitCode = 1;
}

async function openRuntimeLibrary(page) {
  await page.goto(`${dashboardUrl}/#/runtime`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Choose an app to operate." }).waitFor();
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream"] });
  } catch {
    return chromium.launch({ args: ["--use-fake-device-for-media-stream"] });
  }
}

async function capture(page, path) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ fullPage: false, path });
}
