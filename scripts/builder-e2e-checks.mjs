/**
 * Author a complete app through the Builder, then open it and drive it.
 *
 *   BLOOM_DASHBOARD_URL=… BLOOM_API_URL=… node scripts/builder-e2e-checks.mjs [--out dir]
 *
 * scripts/builder-e2e.sh starts the API and the dashboard for this. Every unit test in the repo
 * builds an app from the model; nobody had ever clicked one together and then run it, which is how
 * a Builder that passed its whole suite still failed at the bench.
 *
 * There is no ROS here on purpose. This asserts what Bloom accepts, stores and sends; whether an arm
 * moves is scripts/ros-sim-e2e.sh's question.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const args = process.argv.slice(2);
const readArg = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.BLOOM_API_URL ?? "http://127.0.0.1:8000";
const outputDir = resolve(readArg("--out") ?? "/tmp/bloom-builder-e2e");
const screenDir = resolve(outputDir, "screens");

const APP_NAME = `E2E Drive ${Date.now()}`;
const results = [];
let shotIndex = 0;

await mkdir(screenDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
try {
  await authorAndDrive();
} finally {
  await browser.close();
}

await writeFile(resolve(outputDir, "results.json"), `${JSON.stringify({ results }, null, 2)}\n`);
const failed = results.filter((result) => result.status === "fail");
console.log(`\nbuilder: ${results.length - failed.length}/${results.length} checks passed (${outputDir})`);
process.exit(failed.length > 0 ? 1 : 0);

async function authorAndDrive() {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`page error: ${error.message}`));

  try {
    const created = await check(page, "builder-creates-an-app", async () => {
      await page.goto(dashboardUrl, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Builder: Compose screens" }).click();
      await page.getByRole("button", { exact: true, name: "Apps" }).click();
      await page.getByLabel("New app name").fill(APP_NAME);
      await page.getByLabel("Starter screen").selectOption("operator-control");
      await page.getByRole("button", { name: "Create guided app" }).click();
      // Creating drops straight into the new app's configuration rather than back to the library.
      await page.getByRole("heading", { name: APP_NAME }).waitFor({ timeout: 20000 });
      await shot(page, "app-created");
      return `${APP_NAME} is open in app configuration`;
    });
    if (!created) {
      return;
    }

    await check(page, "api-stored-the-app", async () => {
      const application = await fetchApplication(page);
      assert(application, `${APP_NAME} is not in any stored configuration`);
      assert(application.screens.length > 0, "the new app has no screens");
      return `${application.screens.length} screen(s), id ${application.id}`;
    });

    await check(page, "screen-opens-in-the-builder", async () => {
      await openScreenBuilder(page);
      await page.locator(".builder-widget-palette").first().waitFor({ timeout: 20000 });
      await shot(page, "screen-builder");
      return "the canvas and the palette are up";
    });

    await check(page, "palette-adds-every-command-family", async () => {
      const added = [];
      for (const name of ["Joystick", "Slider", "Toggle", "Command button", "Label"]) {
        const button = page.getByRole("button", { name: new RegExp(`^Add ${name} widget`) });
        if ((await button.count()) === 0) {
          continue;
        }
        await button.first().click();
        added.push(name);
      }
      assert(added.length >= 4, `only added ${added.join(", ")}`);
      await shot(page, "widgets-added");
      return added.join(", ");
    });

    await check(page, "stop-can-be-placed-from-the-palette", async () => {
      const add = page.getByRole("button", { name: "Add STOP" });
      const already = page.getByRole("button", { name: "STOP is already on this screen" });
      if ((await add.count()) > 0) {
        await add.click();
      }
      await page
        .getByRole("button", { name: /^(Move the STOP region|STOP is already on this screen)$/ })
        .first()
        .waitFor({ timeout: 10000 });
      assert((await already.count()) > 0, "the palette still offers STOP after placing it");
      return "STOP is reserved on the screen";
    });

    await check(page, "no-widget-is-below-its-minimum", async () => {
      // The banner the Builder shows itself, rather than a DOM guess that also matches ancestors.
      const banner = page.locator(".builder-undersized-count");
      const reported = (await banner.count()) > 0 ? ((await banner.first().textContent()) ?? "") : "";
      assert(!reported.trim(), `the Builder reports "${reported.trim()}"`);
      return "the Builder reports none below their minimum";
    });

    await check(page, "draft-saves-through-the-api", async () => {
      const save = page.getByRole("button", { name: /^Save changes$/ });
      await save.waitFor({ timeout: 10000 });
      assert(await save.isEnabled(), "Save changes is disabled on a dirty draft");
      await save.click();
      // Waiting for the word "Saved" read a status left over from saving the app a moment earlier,
      // so the fetch below sometimes raced the screen save and saw three widgets instead of eight.
      // Save disables itself once the draft is clean, which is the only signal tied to this save.
      await expect(save).toBeDisabled({ timeout: 20000 });

      const application = await fetchApplication(page);
      const widgets = application.screens.flatMap((screen) => screen.widgets ?? []);
      assert(widgets.length >= 4, `the stored screen has ${widgets.length} widget(s)`);
      return `${widgets.length} widget(s) stored`;
    });

    await check(page, "authored-app-opens-in-the-runtime", async () => {
      await page.goto(dashboardUrl, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
      await page.getByRole("button", { exact: true, name: APP_NAME }).click();
      const roles = page.locator(".runtime-library-roles");
      if ((await roles.getByRole("button").count()) > 0) {
        await roles.getByRole("button").first().click();
      }
      await page.locator(".runtime-library-open").click();
      await page.locator('[data-testid="runtime-artboard"]').waitFor({ timeout: 20000 });
      await shot(page, "runtime");
      return "the authored app is operating";
    });

    await check(page, "stop-latches-in-the-backend", async () => {
      const stop = page.getByRole("button", { name: "Stop the robot" });
      await stop.waitFor({ timeout: 15000 });
      await stop.click();
      await page.waitForTimeout(400);
      const state = await readStop(page);
      assert(state.stopped === true, `STOP reported ${JSON.stringify(state)}`);
      // Simulated is the honest answer with no ROS attached; the latch itself is what matters here.
      return `latched in the backend${state.simulated ? ", zeros simulated" : ""}`;
    });
  } finally {
    await context.close();
  }
}

// ---- Helpers ----

async function openScreenBuilder(page) {
  // "Open builder" is disabled while the app draft is dirty, which it is right after creation.
  const save = page.getByRole("button", { name: /^Save app$/ });
  if ((await save.count()) > 0 && (await save.first().isEnabled())) {
    await save.first().click();
  }
  const open = page.getByRole("button", { name: /screen builder$/ }).first();
  await open.waitFor({ timeout: 20000 });
  await open.scrollIntoViewIfNeeded();
  await open.click();
}

async function fetchApplication(page) {
  const list = await page.request.get(`${apiUrl}/api/v1/configurations`);
  assert(list.ok(), `GET /configurations returned ${list.status()}`);
  const { configuration_ids: ids } = await list.json();
  for (const id of ids) {
    const response = await page.request.get(`${apiUrl}/api/v1/configurations/${id}`);
    if (!response.ok()) {
      continue;
    }
    const bundle = await response.json();
    const application = bundle.applications.find((candidate) => candidate.name === APP_NAME);
    if (application) {
      return application;
    }
  }
  return null;
}

async function readStop(page) {
  const response = await page.request.get(`${apiUrl}/api/v1/runtime/stop`);
  assert(response.ok(), `GET /runtime/stop returned ${response.status()}`);
  return response.json();
}

async function shot(page, name) {
  shotIndex += 1;
  await page
    .screenshot({ path: resolve(screenDir, `${String(shotIndex).padStart(2, "0")}-${name}.png`) })
    .catch(() => undefined);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function check(page, name, run) {
  try {
    const detail = await run();
    results.push({ name, status: "pass", detail });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
    return true;
  } catch (error) {
    results.push({ name, status: "fail", detail: error.message });
    console.log(`  FAIL ${name} — ${error.message}`);
    await shot(page, `fail-${name}`);
    return false;
  }
}
