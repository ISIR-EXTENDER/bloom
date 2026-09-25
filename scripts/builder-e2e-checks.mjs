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
import {
  addPaletteWidgets,
  configureHoldButton,
  configureRosToggle,
  createGuidedApp,
  HOLD_BUTTON,
  openScreenBuilder,
  ROS_TOGGLE,
  saveScreenDraft,
} from "./lib/builder-authoring.mjs";
import { assert, createChecks, readArg as readArgument } from "./lib/e2e-checks.mjs";

const args = process.argv.slice(2);
const readArg = (flag) => readArgument(args, flag);
const dashboardUrl = process.env.BLOOM_DASHBOARD_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.BLOOM_API_URL ?? "http://127.0.0.1:8000";
const outputDir = resolve(readArg("--out") ?? "/tmp/bloom-builder-e2e");
const screenDir = resolve(outputDir, "screens");

const APP_NAME = `E2E Drive ${Date.now()}`;
const { check, results, shot } = createChecks({ screenDir });

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
      await createGuidedApp(page, dashboardUrl, APP_NAME);
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
      await shot(page, "screen-builder");
      return "the canvas and the palette are up";
    });

    await check(page, "palette-adds-every-command-family", async () => {
      const added = await addPaletteWidgets(page, ["Joystick", "Slider", "Toggle", "Command button", "Label"]);
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

    await check(page, "inspector-configures-a-ros-toggle-and-a-hold-button", async () => {
      // Robin's autonomy: every field of a ROS button from the inspector, no backend edit.
      await configureRosToggle(page, ROS_TOGGLE);
      await configureHoldButton(page, HOLD_BUTTON);
      await shot(page, "inspector-ros-buttons");
      return "a toggle on /mode_request with ON/OFF payloads, a hold button with pressed/released payloads";
    });

    await check(page, "draft-saves-through-the-api", async () => {
      await saveScreenDraft(page);
      const application = await fetchApplication(page);
      const widgets = application.screens.flatMap((screen) => screen.widgets ?? []);
      assert(widgets.length >= 4, `the stored screen has ${widgets.length} widget(s)`);
      const toggle = widgets.find((widget) => widget.kind === "toggle");
      const hold = widgets.find((widget) => widget.kind === "command-button");
      assert(toggle?.settings.topic === "/mode_request", `stored toggle ${JSON.stringify(toggle?.settings)}`);
      assert(hold?.settings.momentary === true, `stored button ${JSON.stringify(hold?.settings)}`);
      assert(
        JSON.stringify(hold.settings.releasedPayload) === JSON.stringify(HOLD_BUTTON.releasedPayload),
        `release payload ${JSON.stringify(hold.settings.releasedPayload)}`,
      );
      return `${widgets.length} widget(s) stored, the toggle and the hold button with their payloads`;
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

    await check(page, "authored-buttons-are-gated-without-ros", async () => {
      // No ROS here, so nothing subscribes: the runtime must say so rather than pretend to publish.
      // scripts/ros-sim-e2e.sh authors the same two controls and presses them against the manager.
      // The starter brings its own gripper toggle, so each is found by the words this harness gave it.
      const gated = (kind) =>
        page
          .locator(`article[data-widget-kind="${kind}"][data-runtime-unavailable="true"]`)
          .filter({ hasText: kind === "toggle" ? "Jaco off" : "Hold snake e2e" });
      await gated("toggle").waitFor({ timeout: 15000 });
      await gated("command-button").waitFor({ timeout: 15000 });
      await expect(gated("toggle")).toContainText("Jaco off");
      await expect(gated("command-button")).toContainText("Hold snake e2e");
      await expect(gated("command-button").getByRole("note")).toContainText("No ROS node subscribes to /mode_request");
      return "both authored controls render inert, and say why";
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
