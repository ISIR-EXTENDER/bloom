import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "@playwright/test";

/**
 * Capture the README previews.
 *
 * The set is meant to be exhaustive across the surfaces someone evaluating
 * Bloom would want to see, not just the entry points: the screen builder and
 * the Explorer and Kinova Manager apps are what the tool is actually for.
 *
 * Run against a dashboard with a seeded backend:
 *   BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 npm run capture:readme
 * Append `-- --only landing-page,builder-home` to refresh selected images.
 * Set BLOOM_README_API_URL when the dashboard uses a separate API origin.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outputDir = resolve(repoRoot, "docs/assets/screenshots");
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5174";
const apiUrl = (process.env.BLOOM_README_API_URL ?? dashboardUrl).replace(/\/$/, "");
const args = process.argv.slice(2);
const onlyArgumentIndex = args.indexOf("--only");
const only = onlyArgumentIndex >= 0 ? new Set((args[onlyArgumentIndex + 1] ?? "").split(",").filter(Boolean)) : null;
const capturedApplicationIds = [
  "bloom-debug",
  "explorer-manager",
  "explorer-user-tests",
  "kinova-manager",
  "petanque-admin",
  "sandbox",
  "webcam-visualizer",
];
const trackedApplications = Object.fromEntries(
  await Promise.all(
    capturedApplicationIds.map(async (id) => {
      const bundle = JSON.parse(await readFile(resolve(repoRoot, `backend/seed/applications/${id}.json`), "utf8"));
      return [id, applyApiDefaults(bundle.applications[0])];
    }),
  ),
);

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
  await assertTrackedApplications(page, apiUrl);

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
    await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
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
    await openRuntimeApp(page, "Explorer Manager");
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(800);
  });

  for (const [name, screenTitle] of explorerScreens.slice(1)) {
    await step(name, async () => {
      await selectRuntimeScreen(page, screenTitle);
      await page.waitForTimeout(700);
    });
  }

  await step("runtime-kinova-drive", async () => {
    await openRuntimeLibrary(page);
    await openRuntimeApp(page, "Kinova Manager");
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(800);
  });

  await step("runtime-live-teleop", async () => {
    await openRuntimeLibrary(page);
    await openRuntimeApp(page, "Sandbox V0.0");
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(600);
  });

  await step("runtime-camera", async () => {
    await openRuntimeLibrary(page);
    await openRuntimeApp(page, "Webcam visualizer");
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(800);
  });

  await step("runtime-bloom-debug", async () => {
    await openRuntimeLibrary(page);
    await openRuntimeApp(page, "Bloom Debug");
    await page.getByRole("region", { name: "Runtime application" }).waitFor();
    await page.waitForTimeout(600);
  });

  await step("help", async () => {
    // Reached by route: the runtime view hides the product nav.
    await page.goto(`${dashboardUrl}/#/help`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
  });

  async function step(name, navigate) {
    if (only && !only.has(name)) {
      return;
    }
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
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
}

async function assertTrackedApplications(page, apiBaseUrl) {
  for (const id of capturedApplicationIds) {
    const bundle = await page.evaluate(
      async ({ applicationId, baseUrl }) => {
        const response = await fetch(`${baseUrl}/api/v1/configurations/${applicationId}`);
        if (!response.ok) {
          throw new Error(`Configuration ${applicationId} returned HTTP ${response.status}`);
        }
        return response.json();
      },
      { applicationId: id, baseUrl: apiBaseUrl },
    );
    const actual = bundle.applications?.[0];
    if (!isDeepStrictEqual(actual, trackedApplications[id])) {
      throw new Error(
        `README capture requires the tracked ${id} seed. Start the backend with an isolated database or restore that app with config seed --force ${id}.`,
      );
    }
  }
}

function applyApiDefaults(application) {
  return {
    ...application,
    profiles: application.profiles.map((profile) => ({
      audio_cues: false,
      deadzone: 0,
      dwell_enabled: false,
      dwell_ms: 1000,
      language: "en",
      repeat_guard_ms: 0,
      scan_period_ms: 1400,
      ...profile,
    })),
    runtime_policy: {
      command_frame_id: "",
      allowed_service_calls: [],
      ...application.runtime_policy,
    },
  };
}

async function selectRuntimeScreen(page, screenTitle) {
  const maintenanceButton = page.getByRole("button", { name: "Hold to open maintenance" });
  const box = await maintenanceButton.boundingBox();
  if (!box) {
    throw new Error("Maintenance button has no visible bounds");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  const maintenance = page.getByRole("dialog", { name: "Maintenance" });
  await maintenance.waitFor();
  await maintenance
    .getByRole("navigation", { name: "Switch runtime screen" })
    .getByRole("button", { exact: true, name: screenTitle })
    .click();
  await maintenance.waitFor({ state: "detached" });
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

/** The library opens an app as a role: select its row, keep the remembered role or take the first, open. */
async function openRuntimeApp(page, appName) {
  await page.getByRole("button", { exact: true, name: appName }).click();
  const open = page.locator(".runtime-library-open");
  if (await open.isDisabled()) {
    await page.locator(".runtime-library-roles button").first().click();
  }
  await open.click();
}
