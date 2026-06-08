import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outputDir = resolve(repoRoot, "docs/assets/screenshots");
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5174";

const screenshots = {
  appConfiguration: resolve(outputDir, "app-configuration.png"),
  bloomDebug: resolve(outputDir, "runtime-bloom-debug.png"),
  builderHome: resolve(outputDir, "builder-home.png"),
  cameraRuntime: resolve(outputDir, "runtime-camera.png"),
  landingPage: resolve(outputDir, "landing-page.png"),
  liveTeleop: resolve(outputDir, "runtime-live-teleop.png"),
};

await mkdir(outputDir, { recursive: true });

const browser = await launchBrowser();

try {
  const context = await browser.newContext({
    permissions: ["camera"],
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /robot interfaces that grow cleanly/i }).waitFor();
  await capture(page, screenshots.landingPage);

  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("heading", { name: "Choose what to build." }).waitFor();
  await capture(page, screenshots.builderHome);

  await page.getByRole("button", { exact: true, name: "Apps" }).click();
  await page.getByRole("button", { name: "Open Sandbox app" }).click();
  await page.getByRole("heading", { name: "App theme" }).waitFor();
  await capture(page, screenshots.appConfiguration);

  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: "Launch Sandbox runtime" }).click();
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
  await capture(page, screenshots.liveTeleop);

  await page.getByRole("button", { name: "Runtime" }).click();
  await page.getByRole("button", { name: "Launch Webcam visualizer runtime" }).click();
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
  await capture(page, screenshots.cameraRuntime);

  await page.getByRole("button", { name: "Runtime" }).click();
  await page.getByRole("button", { name: "Launch Bloom Debug runtime" }).click();
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
  await capture(page, screenshots.bloomDebug);
} finally {
  await browser.close();
}

console.log(`Bloom README screenshots captured in ${outputDir}`);

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
