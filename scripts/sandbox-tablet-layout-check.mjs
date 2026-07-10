#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dashboardRoot = resolve(repoRoot, "frontend/apps/bloom-dashboard");
const outputDir = process.env.BLOOM_TABLET_LAYOUT_OUTPUT_DIR ?? resolve("/tmp", "bloom-sandbox-tablet-layout");
const port = Number(process.env.BLOOM_TABLET_LAYOUT_PORT ?? "5179");
const baseUrl = `http://127.0.0.1:${port}`;
const sandboxConfiguration = JSON.parse(
  await readFile(resolve(repoRoot, "tests/fixtures/sandbox-v0-configuration-bundle.json"), "utf8"),
);

const checks = [
  {
    name: "control-panel",
    screen: "Control Panel",
    assertions: async (page) => {
      await assertFramesInsideViewport(page, "Control Panel");
      await assertNoFrameOverlap(page, "Control Panel");
      await assertVisibleBox(page, ".bloom-slider-widget[data-binding='z'] .bloom-slider-track", {
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
      await assertVisibleBox(page, ".bloom-topic-plot-widget", {
        label: "Visual-servoing plots",
        minHeight: 40,
        minWidth: 80,
      });
    },
  },
];

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
    const page = await browser.newPage({ viewport: { height: 600, width: 1024 } });
    await mockApi(page);
    await mockRuntimeWebSocket(page);

    for (const check of checks) {
      await showSandboxRuntimeScreen(page, check.screen);
      await assertNoHorizontalOverflow(page, check.screen);
      await check.assertions(page);
      await page.screenshot({
        fullPage: false,
        path: resolve(outputDir, `${check.name}-1024x600.png`),
      });
      console.log(`ok: ${check.screen} tablet layout`);
    }
    await page.close();
  } finally {
    await browser.close();
  }
} finally {
  await stopServer();
}

console.log(`Sandbox tablet layout screenshots captured in ${outputDir}`);

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
    if (serverExitError) throw serverExitError;
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer() {
  if (!server.pid || server.killed) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    return;
  }
  await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 500));
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    // The server already stopped after SIGTERM.
  }
}

async function mockApi(page) {
  await page.route("**/api/v1/configurations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { configuration_ids: ["sandbox"] },
      status: 200,
    });
  });
  await page.route("**/api/v1/configurations/sandbox", async (route) => {
    await route.fulfill({ contentType: "application/json", json: sandboxConfiguration, status: 200 });
  });
  await page.route("**/api/v1/ros/topics/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        topics: [
          {
            message_type: "extender_msgs/msg/TeleopCommand",
            name: "/teleop_cmd",
            publisher_count: 1,
            subscription_count: 1,
          },
          {
            message_type: "geometry_msgs/msg/TwistStamped",
            name: "/visual_servoing/velocity_command",
            publisher_count: 1,
            subscription_count: 0,
          },
        ],
      },
      status: 200,
    });
  });
}

async function mockRuntimeWebSocket(page) {
  await page.addInitScript(() => {
    class BloomTabletLayoutWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readyState = BloomTabletLayoutWebSocket.CONNECTING;

      constructor(url) {
        super();
        this.url = url;
        window.setTimeout(() => {
          this.readyState = BloomTabletLayoutWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
        }, 0);
      }

      close() {
        this.readyState = BloomTabletLayoutWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent("close"));
      }

      send(data) {
        const message = parseRuntimeCommand(data);
        if (message?.type !== "subscribe_topic") return;
        window.setTimeout(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({
                detail: `Subscribed to ${message.topic}.`,
                payload: {
                  field_path: message.field_path ?? "",
                  message_type: message.message_type ?? "",
                  topic: message.topic,
                  widget_id: message.widget_id,
                },
                type: "subscription_ack",
              }),
            }),
          );
        }, 0);
      }
    }

    function parseRuntimeCommand(data) {
      if (typeof data !== "string") return null;
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }

    window.WebSocket = BloomTabletLayoutWebSocket;
  });
}

async function showSandboxRuntimeScreen(page, screenName) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: "Launch Sandbox V0.0 runtime" }).click();
  await page
    .getByRole("navigation", { name: "Switch runtime screen" })
    .getByRole("button", { exact: true, name: screenName })
    .click();
  await page.locator(".runtime-active-screen-label", { hasText: screenName }).waitFor();
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  const bodyOverflow = overflow.bodyScrollWidth - overflow.bodyClientWidth;
  const documentOverflow = overflow.documentScrollWidth - overflow.documentClientWidth;
  if (bodyOverflow > 2 || documentOverflow > 2) {
    throw new Error(`${label} has horizontal overflow: body=${bodyOverflow}px, document=${documentOverflow}px`);
  }
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
