/**
 * Capture the operator runtime against a live backend and ROS graph.
 *
 * Unlike visual:smoke, nothing is mocked: the API must be running with its
 * ROS gateways attached (`bloom api run-ros`) and the dashboard must be served.
 * Captures are 1280x720, the operator panel geometry, so they can be laid next
 * to the design handoff references.
 *
 *   BLOOM_DASHBOARD_URL=http://127.0.0.1:5173 node scripts/ros-e2e-capture.mjs [--only name,name] [--out dir]
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5173";
const args = process.argv.slice(2);
const readArg = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const only = readArg("--only")?.split(",").filter(Boolean);
const outputDir = resolve(readArg("--out") ?? "/tmp/bloom-ros-e2e");
const appName = process.env.BLOOM_E2E_APP ?? "Explorer Manager";
const configId = process.env.BLOOM_E2E_CONFIG_ID ?? "explorer-manager";
const appId = process.env.BLOOM_E2E_APP_ID ?? "explorer-manager";

const captures = [
  { name: "01-runtime-ready", setup: async (page) => openRuntime(page) },
  {
    name: "02-runtime-stopped",
    setup: async (page) => {
      await openRuntime(page);
      await page.getByRole("button", { name: "Stop the robot" }).click();
      await page.getByRole("button", { name: "Hold for one second to resume" }).waitFor();
      await page.waitForTimeout(300);
    },
    teardown: async (page) => holdResume(page),
  },
  {
    name: "03-runtime-maintenance",
    setup: async (page) => {
      await openRuntime(page);
      await holdForMaintenance(page);
    },
  },
  {
    name: "07-runtime-scanning",
    setup: async (page) => {
      await openRuntime(page, { profileId: process.env.BLOOM_E2E_SCAN_PROFILE ?? "one-switch" });
      await page.waitForTimeout(400);
    },
  },
  {
    name: "04-settings-movement",
    setup: async (page) => {
      await openRuntime(page);
      await openSettings(page);
    },
  },
  {
    name: "05-settings-tuning",
    setup: async (page) => {
      await openRuntime(page);
      await openSettings(page);
      await page.getByRole("button", { name: "Fine tuning" }).click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "06-settings-language",
    setup: async (page) => {
      await openRuntime(page);
      await openSettings(page);
      await page.getByRole("button", { name: "Language" }).click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "08-runtime-french",
    setup: async (page) => {
      await openRuntime(page, { language: "fr" });
      await page.waitForTimeout(400);
    },
  },
  {
    name: "09-runtime-tour",
    setup: async (page) => {
      await openRuntime(page);
      await holdForMaintenance(page);
      await page.getByRole("button", { name: "Practice tour" }).click();
      await page.getByRole("region", { name: "Practice this app" }).waitFor();
      await page.waitForTimeout(300);
    },
  },
  {
    name: "10-builder-review",
    setup: async (page) => {
      await openBuilderReview(page);
      await page.waitForTimeout(300);
    },
  },
  {
    name: "11-joystick-lab",
    setup: async (page) => {
      await openRuntime(page);
      await selectRuntimeScreen(page, "Joystick lab");
      await page.getByRole("application", { name: "Translation" }).waitFor();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "12-supervisor-mirror",
    setup: async (page) => {
      await page.goto(`${dashboardUrl}/#/runtime/supervisor/${configId}/${appId}`, { waitUntil: "networkidle" });
      await page.getByRole("region", { name: "Supervisor mirror" }).waitFor();
      await page.getByText("Operator retains control").waitFor();
      await page.waitForTimeout(600);
    },
  },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const failures = [];
try {
  for (const capture of captures) {
    if (only && !only.includes(capture.name)) {
      continue;
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    try {
      await capture.setup(page);
      await page.screenshot({ path: resolve(outputDir, `${capture.name}.png`) });
      console.log(`captured ${capture.name}`);
      await capture.teardown?.(page);
    } catch (error) {
      failures.push(capture.name);
      console.error(`FAILED ${capture.name}: ${error instanceof Error ? error.message : error}`);
      await page.screenshot({ path: resolve(outputDir, `${capture.name}.failed.png`) }).catch(() => undefined);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failures.length > 0) {
  process.exit(1);
}

async function openRuntime(page, options = {}) {
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  if (options.profileId || options.language) {
    await page.evaluate(
      ({ key, profileId, language, configId: config, appId: app }) => {
        const prefs = JSON.parse(window.localStorage.getItem("bloom.runtime-user-preferences.v1") ?? "{}");
        prefs.profilePreferences = prefs.profilePreferences ?? {};
        if (profileId) {
          prefs.profilePreferences[key] = profileId;
        }
        if (language) {
          prefs.profileOverrides = prefs.profileOverrides ?? {};
          const overrideKey = `${config}:${app}:${profileId ?? "operator"}`;
          prefs.profileOverrides[overrideKey] = { ...(prefs.profileOverrides[overrideKey] ?? {}), language };
        }
        window.localStorage.setItem("bloom.runtime-user-preferences.v1", JSON.stringify(prefs));
      },
      { key: `${configId}:${appId}`, profileId: options.profileId, language: options.language, configId, appId },
    );
    await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  }
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: `Launch ${appName} runtime` }).click();
  await page
    .getByRole("region", { name: /Runtime application|Aplicación de operación|Application opérateur/ })
    .waitFor();
  // The chip only says READY once the runtime WebSocket is really open.
  await page
    .getByRole("status")
    .filter({ hasText: /READY|LIVE|PRÊT|ACTIF|LISTO|ACTIVO/ })
    .first()
    .waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
}

async function openBuilderReview(page) {
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("button", { exact: true, name: "Apps" }).click();
  await page.getByRole("button", { name: `Open ${appName} app` }).click();
  await page.getByRole("button", { name: "Review checklist" }).click();
  await page.getByRole("region", { name: "Builder review checklist" }).waitFor();
}

async function holdForMaintenance(page) {
  const button = page.getByRole("button", { name: "Hold to open maintenance" });
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor();
  await page.waitForTimeout(200);
}

async function selectRuntimeScreen(page, title) {
  await holdForMaintenance(page);
  await page.getByRole("navigation", { name: "Switch runtime screen" }).getByRole("button", { name: title }).click();
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor({ state: "hidden" });
}

async function holdResume(page) {
  const button = page.getByRole("button", { name: "Hold for one second to resume" });
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.getByRole("button", { name: "Stop the robot" }).waitFor();
}

async function openSettings(page) {
  await holdForMaintenance(page);
  await page.getByRole("button", { name: /settings|réglages|ajustes/i }).click();
  await page.getByRole("region", { name: /settings|réglages|ajustes/i }).waitFor();
  await page.waitForTimeout(200);
}
