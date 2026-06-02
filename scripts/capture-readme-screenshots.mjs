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
  builderHome: resolve(outputDir, "builder-home.png"),
  landingPage: resolve(outputDir, "landing-page.png"),
};

await mkdir(outputDir, { recursive: true });

const browser = await launchBrowser();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /robot interfaces that grow cleanly/i }).waitFor();
  await capture(page, screenshots.landingPage);

  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("heading", { name: "Choose an app to shape." }).waitFor();
  await capture(page, screenshots.builderHome);

  await page.getByRole("button", { name: /Sandbox operator interface/i }).click();
  await page.getByRole("heading", { name: "App theme" }).waitFor();
  await capture(page, screenshots.appConfiguration);
} finally {
  await browser.close();
}

console.log(`Bloom README screenshots captured in ${outputDir}`);

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return chromium.launch();
  }
}

async function capture(page, path) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ fullPage: false, path });
}
