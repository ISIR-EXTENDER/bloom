import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dashboardRoot = resolve(repoRoot, "frontend/apps/bloom-dashboard");
const fixturePath = resolve(repoRoot, "tests/fixtures/sandbox-teleop-lab-configuration.json");
const outputDir = process.env.BLOOM_VISUAL_OUTPUT_DIR ?? resolve("/tmp", "bloom-visual-smoke");
const port = Number(process.env.BLOOM_VISUAL_PORT ?? "5178");
const baseUrl = `http://127.0.0.1:${port}`;

const viewports = [
  { name: "tablet-native", width: 1024, height: 600 },
  { name: "tablet-wide", width: 1280, height: 800 },
  { name: "configured-hd", width: 1920, height: 1080 },
];

const routes = [
  { name: "landing", setup: showLanding },
  { name: "builder", setup: showBuilder },
  { name: "app-config", setup: showAppConfig },
  { name: "runtime", setup: showRuntime },
];

const configuration = JSON.parse(await readFile(fixturePath, "utf8"));
await mkdir(outputDir, { recursive: true });

const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: dashboardRoot,
  detached: true,
  env: { ...process.env, VITE_BLOOM_API_URL: "" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverExitError;
server.on("exit", (code, signal) => {
  if (code !== null && code !== 0) {
    serverExitError = new Error(`Bloom dashboard dev server exited with code ${code}.`);
    return;
  }

  if (signal) {
    serverExitError = new Error(`Bloom dashboard dev server exited with signal ${signal}.`);
  }
});
server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  await waitForServer(baseUrl);
  const browser = await launchBrowser();

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      await mockConfigurationApi(page);

      for (const route of routes) {
        await route.setup(page);
        await assertNoHorizontalOverflow(page, `${viewport.name}:${route.name}`);
        await page.screenshot({
          fullPage: false,
          path: resolve(outputDir, `${viewport.name}-${route.name}.png`),
        });
      }

      await assertBrowserHistoryAffordance(page, viewport.name);
      await page.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  await stopServer();
}

console.log(`Bloom visual smoke screenshots captured in ${outputDir}`);

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return chromium.launch();
  }
}

async function waitForServer(url) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 20_000) {
    if (serverExitError) {
      throw serverExitError;
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer() {
  if (!server.pid || server.killed) {
    return;
  }

  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    // The server already stopped after SIGTERM.
  }
}

async function mockConfigurationApi(page) {
  await page.route("**/api/v1/configurations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { configuration_ids: ["sandbox"] },
      status: 200,
    });
  });

  await page.route("**/api/v1/configurations/sandbox", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: configuration,
      status: 200,
    });
  });
}

async function showLanding(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /robot interfaces that grow cleanly/i }).waitFor();
}

async function showBuilder(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("heading", { name: "Choose what to build." }).waitFor();
}

async function showAppConfig(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("button", { exact: true, name: "Apps" }).click();
  await page.getByRole("button", { name: "Open Sandbox app" }).click();
  await page.getByRole("heading", { name: "Sandbox" }).waitFor();
}

async function showRuntime(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: "Launch Sandbox runtime" }).click();
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
}

async function assertBrowserHistoryAffordance(page, label) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("heading", { name: "Choose what to build." }).waitFor();

  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("heading", { name: "Choose an app to operate." }).waitFor();

  await page.goBack({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Choose what to build." }).waitFor();
  await assertNoHorizontalOverflow(page, `${label}:browser-back`);

  await page.goForward({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Choose an app to operate." }).waitFor();
  await assertNoHorizontalOverflow(page, `${label}:browser-forward`);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));

  const toleratedOverflowPx = 2;
  const bodyOverflow = overflow.bodyScrollWidth - overflow.bodyClientWidth;
  const documentOverflow = overflow.documentScrollWidth - overflow.documentClientWidth;

  if (bodyOverflow > toleratedOverflowPx || documentOverflow > toleratedOverflowPx) {
    throw new Error(
      `${label} has horizontal overflow: body=${bodyOverflow}px, document=${documentOverflow}px (${JSON.stringify(
        overflow,
      )})`,
    );
  }
}
