/**
 * What every browser end-to-end script needs and none should carry twice: argument reading, the
 * check runner with its results list and screenshots, and the runtime gestures (hold, open an app).
 */
import { resolve } from "node:path";

export function readArg(args, flag) {
  return args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** A check that cannot run here, for a reason worth printing, counts as neither pass nor fail. */
export function skip(reason) {
  throw Object.assign(new Error(reason), { skipped: true });
}

export async function newPage(browser, viewport) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`page error: ${error.message}`));
  return { context, page };
}

export async function hold(page, locator, milliseconds) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(milliseconds);
  await page.mouse.up();
}

/** The chip only says READY once the runtime WebSocket is open; a debug app reads DEBUG instead. */
export async function waitReady(page, pattern = /^(READY|DEBUG)$/) {
  await page.getByRole("status").filter({ hasText: pattern }).first().waitFor({ timeout: 20000 });
}

/** From the landing to one screen of one app as one role, READY. Without a role, the first offered. */
export async function openRuntimeApp(page, dashboardUrl, { appName, roleName, layoutId }) {
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { exact: true, name: appName }).click();
  const roles = page.locator(".runtime-library-roles");
  if (roleName) {
    await roles.getByRole("button", { exact: true, name: roleName }).click();
  } else if (await page.locator(".runtime-library-open").isDisabled()) {
    await roles.getByRole("button").first().click();
  }
  await page.locator(".runtime-library-open").click();
  await page.locator(`[data-testid="runtime-artboard"][data-screen-id="${layoutId}"]`).waitFor({ timeout: 15000 });
  await waitReady(page);
}

/**
 * The runner: `check` records one result per named step and screenshots a failure; `recover`, when
 * given, puts the page back in a usable state after one so the next step still means something.
 */
export function createChecks({ screenDir, prefix = "", recover }) {
  const results = [];
  let shotIndex = 0;

  async function shot(page, name) {
    shotIndex += 1;
    const file = `${String(shotIndex).padStart(2, "0")}-${prefix}${name}.png`;
    await page.screenshot({ path: resolve(screenDir, file) }).catch(() => undefined);
  }

  async function check(page, name, run) {
    try {
      const detail = await run();
      results.push({ detail, name, status: "pass" });
      console.log(`PASS ${name}: ${detail}`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
      if (error?.skipped) {
        results.push({ detail, name, status: "skip" });
        console.log(`SKIP ${name}: ${detail}`);
        return true;
      }
      results.push({ detail, name, status: "fail" });
      console.error(`FAIL ${name}: ${detail}`);
      await shot(page, `${name}.failed`);
      await recover?.(page);
      return false;
    }
  }

  return { check, results, shot };
}

export function isZeroTwist(twist) {
  return [twist.linear, twist.angular].every((v) => Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 1e-9);
}

export function fmtVector(v) {
  return `(${[v.x, v.y, v.z].map((value) => value.toFixed(3)).join(", ")})`;
}
