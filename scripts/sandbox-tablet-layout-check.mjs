#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertNoHorizontalOverflow,
  installConfigurationMocks,
  installRuntimeWebSocketMock,
  launchBrowser,
  loadSeedConfigurationsByPath,
  seedApplicationsDir,
  startDashboardServer,
} from "./lib/runtime-harness.mjs";

const outputDir = process.env.BLOOM_TABLET_LAYOUT_OUTPUT_DIR ?? resolve("/tmp", "bloom-sandbox-tablet-layout");
const port = Number(process.env.BLOOM_TABLET_LAYOUT_PORT ?? "5179");
const configurations = await loadSeedConfigurationsByPath({ sandbox: resolve(seedApplicationsDir, "sandbox.json") });

const checks = [
  {
    name: "control-panel",
    screen: "Control Panel",
    assertions: async (page) => {
      await assertFramesInsideViewport(page, "Control Panel");
      await assertNoFrameOverlap(page, "Control Panel");
      await assertVisibleBox(page, ".bloom-slider-widget[data-direction='vertical'] .bloom-axis-slider", {
        label: "Control Panel Z slider track",
        minHeight: 120,
      });
      await assertVisibleBox(page, ".bloom-joystick", {
        label: "Control Panel joysticks",
        minHeight: 108,
        minWidth: 108,
      });
    },
  },
  {
    name: "snake-control",
    screen: "Snake Control",
    assertions: async (page) => {
      await assertFramesInsideViewport(page, "Snake Control");
      await assertNoFrameOverlap(page, "Snake Control");
      await assertVisibleBox(page, ".bloom-action-widget[data-variant='snake-hold'] .bloom-command-button", {
        label: "Snake hold button",
        minHeight: 36,
        minWidth: 90,
      });
      await assertVisibleBox(page, ".bloom-toggle-widget[data-variant='mode-segmented'] .bloom-toggle-button", {
        label: "Snake mode segmented control",
        minHeight: 36,
        minWidth: 120,
      });
      await assertVisibleBox(page, ".bloom-joystick", {
        label: "Snake joystick",
        minHeight: 180,
        minWidth: 180,
      });
    },
  },
  {
    name: "visual-servoing-monitor",
    screen: "Visual Servoing Monitor",
    assertions: async (page) => {
      await assertFramesInsideViewport(page, "Visual Servoing Monitor");
      await assertNoFrameOverlap(page, "Visual Servoing Monitor");
      await assertVisibleBox(page, ".bloom-plot-board", {
        label: "Servo output plot",
        minHeight: 280,
        minWidth: 480,
      });
    },
  },
];

await mkdir(outputDir, { recursive: true });

const server = startDashboardServer(port);

try {
  await server.ready();
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { height: 600, width: 1024 } });
    await installConfigurationMocks(page, configurations);
    await installRuntimeWebSocketMock(page);

    for (const check of checks) {
      await showSandboxRuntimeScreen(page, check.screen);
      await page.screenshot({ fullPage: false, path: resolve(outputDir, `${check.name}-1024x600.png`) });
      await assertNoHorizontalOverflow(page, check.screen);
      await check.assertions(page);
      console.log(`ok: ${check.screen} tablet layout`);
    }
    await page.close();
  } finally {
    await browser.close();
  }
} finally {
  await server.stop();
}

console.log(`Sandbox tablet layout screenshots captured in ${outputDir}`);

async function showSandboxRuntimeScreen(page, screenName) {
  await page.goto(server.baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await openRuntimeApp(page, "Sandbox V0.0");

  // Screen switching lives behind the maintenance hold now, so the check has
  // to hold too. That is the point of the gate: it cannot be done by brushing
  // the glass while the arm is moving.
  await holdForMaintenance(page);
  await page
    .getByRole("navigation", { name: "Switch runtime screen" })
    .getByRole("button", { exact: true, name: screenName })
    .click();
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor({ state: "detached" });
}

async function holdForMaintenance(page) {
  const button = page.getByRole("button", { name: "Hold to open maintenance" });
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor();
}

async function assertFramesInsideViewport(page, label) {
  const result = await page.evaluate(() => {
    const viewport = document.querySelector(".runtime-app-canvas-viewport")?.getBoundingClientRect();
    if (!viewport) return { missingViewport: true };
    const offenders = [...document.querySelectorAll(".widget-preview-card")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "widget",
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top,
        };
      })
      .filter(
        (rect) =>
          rect.left < viewport.left - 1 ||
          rect.top < viewport.top - 1 ||
          rect.right > viewport.right + 1 ||
          rect.bottom > viewport.bottom + 1,
      );
    return {
      offenders,
      viewport: { bottom: viewport.bottom, left: viewport.left, right: viewport.right, top: viewport.top },
    };
  });
  if (result.missingViewport) {
    throw new Error(`${label} is missing runtime viewport`);
  }
  if (result.offenders?.length) {
    throw new Error(`${label} has widgets outside viewport: ${JSON.stringify(result.offenders)}`);
  }
}

async function assertNoFrameOverlap(page, label) {
  const overlaps = await page.evaluate(() => {
    const frames = [...document.querySelectorAll(".widget-preview-card")].map((element) => ({
      id: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "widget",
      rect: element.getBoundingClientRect(),
    }));
    const collisions = [];
    for (let outer = 0; outer < frames.length; outer += 1) {
      for (let inner = outer + 1; inner < frames.length; inner += 1) {
        const a = frames[outer];
        const b = frames[inner];
        const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (width > 2 && height > 2) {
          collisions.push({ a: a.id, b: b.id, height, width });
        }
      }
    }
    return collisions;
  });
  if (overlaps.length > 0) {
    throw new Error(`${label} has overlapping widget frames: ${JSON.stringify(overlaps)}`);
  }
}

async function assertVisibleBox(page, selector, options) {
  const boxes = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    }),
  );
  if (boxes.length === 0) {
    throw new Error(`${options.label} is missing (${selector})`);
  }
  const usable = boxes.some((box) => box.height >= (options.minHeight ?? 1) && box.width >= (options.minWidth ?? 1));
  if (!usable) {
    throw new Error(`${options.label} is too small: ${JSON.stringify(boxes)}`);
  }
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
