/**
 * Authoring through the Builder's own UI, shared by the Builder harness (no ROS: what Bloom accepts and
 * stores) and the simulation harness (with ROS: what an authored control puts on the graph).
 */
import { expect } from "@playwright/test";

export async function createGuidedApp(page, dashboardUrl, appName) {
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("button", { exact: true, name: "Apps" }).click();
  await page.getByLabel("New app name").fill(appName);
  await page.getByLabel("Starter screen").selectOption("operator-control");
  await page.getByRole("button", { name: "Create guided app" }).click();
  // Creating drops straight into the new app's configuration rather than back to the library.
  await page.getByRole("heading", { name: appName }).waitFor({ timeout: 20000 });
}

export async function openScreenBuilder(page) {
  // "Open builder" is disabled while the app draft is dirty, which it is right after creation.
  const save = page.getByRole("button", { name: /^Save app$/ });
  if ((await save.count()) > 0 && (await save.first().isEnabled())) {
    await save.first().click();
  }
  const open = page.getByRole("button", { name: /screen builder$/ }).first();
  await open.waitFor({ timeout: 20000 });
  await open.scrollIntoViewIfNeeded();
  await open.click();
  await page.locator(".builder-widget-palette").first().waitFor({ timeout: 20000 });
}

/** Adds each named palette entry that exists and returns the names it added. */
export async function addPaletteWidgets(page, names) {
  const added = [];
  for (const name of names) {
    const button = page.getByRole("button", { name: new RegExp(`^Add ${name} widget`) });
    if ((await button.count()) === 0) {
      continue;
    }
    await button.first().click();
    added.push(name);
  }
  return added;
}

export async function selectCanvasWidget(page, kind) {
  await page.locator(`.builder-widget-frame[aria-label$=" ${kind} widget"]`).first().click();
}

/** The inspector's fields, by the label text beside them; the control itself may carry other ARIA names. */
export async function fillInspectorField(page, label, value) {
  await openAdvancedSettings(page);
  const field = inspectorField(page, "label.builder-settings-field", label).locator("input, textarea").first();
  await field.waitFor({ timeout: 10000 });
  await field.fill(value);
  await field.press("Tab");
}

/** A control's ROS fields sit under "Advanced (ROS)"; the harness sets them as an author would, opening it first. */
async function openAdvancedSettings(page) {
  const advanced = page.locator("details.builder-settings-advanced");
  if ((await advanced.count()) > 0 && !(await advanced.first().evaluate((node) => node.open))) {
    await advanced.first().locator("summary").click();
  }
}

export async function checkInspectorBox(page, label) {
  await openAdvancedSettings(page);
  await inspectorField(page, "label.builder-settings-checkbox", label).locator("input").check();
}

function inspectorField(page, selector, label) {
  return page.locator(selector, { has: page.locator("span", { hasText: new RegExp(`^${label}$`) }) });
}

/** A toggle that publishes one typed payload ON and another OFF, every field from the inspector. */
export async function configureRosToggle(page, { topic, messageType, onLabel, offLabel, onPayload, offPayload }) {
  await selectCanvasWidget(page, "toggle");
  await fillInspectorField(page, "Output topic", topic);
  await fillInspectorField(page, "ROS message type", messageType);
  await fillInspectorField(page, "Active label", onLabel);
  await fillInspectorField(page, "Inactive label", offLabel);
  await fillInspectorField(page, "ON payload", JSON.stringify(onPayload));
  await fillInspectorField(page, "OFF payload", JSON.stringify(offPayload));
}

/** A command button held to run: one payload while pressed, another on release. */
export async function configureHoldButton(page, { command, label, topic, messageType, payload, releasedPayload }) {
  await selectCanvasWidget(page, "command-button");
  await fillInspectorField(page, "Command", command);
  await fillInspectorField(page, "Button label", label);
  await checkInspectorBox(page, "Hold to run");
  await fillInspectorField(page, "Output topic", topic);
  await fillInspectorField(page, "ROS message type", messageType);
  await fillInspectorField(page, "Payload", JSON.stringify(payload));
  await fillInspectorField(page, "Payload on release", JSON.stringify(releasedPayload));
}

export async function saveScreenDraft(page) {
  const save = page.getByRole("button", { name: /^Save changes$/ });
  await save.waitFor({ timeout: 10000 });
  await save.click();
  // Save disables itself once the draft is clean, the only signal tied to this save.
  await expect(save).toBeDisabled({ timeout: 20000 });
}

/** The two controls the harnesses author, as Robin uses them: mode requests on the manager's topic. */
export const ROS_TOGGLE = {
  topic: "/mode_request",
  messageType: "std_msgs/msg/String",
  onLabel: "Jaco on",
  offLabel: "Jaco off",
  onPayload: { data: "geometric/jaco" },
  offPayload: { data: "geometric/both" },
};

export const HOLD_BUTTON = {
  command: "geometric/snake",
  label: "Hold snake e2e",
  topic: "/mode_request",
  messageType: "std_msgs/msg/String",
  payload: { data: "geometric/snake" },
  releasedPayload: { data: "geometric/both" },
};
