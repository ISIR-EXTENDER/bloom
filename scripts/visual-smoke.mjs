import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dashboardRoot = resolve(repoRoot, "frontend/apps/bloom-dashboard");
const configurationFixturePaths = {
  "bloom-debug": resolve(repoRoot, "tests/fixtures/bloom-debug-configuration.json"),
  sandbox: resolve(repoRoot, "tests/fixtures/sandbox-v0-configuration-bundle.json"),
};
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
  { name: "runtime-sandbox-teleop-config", setup: (page) => showSandboxRuntimeScreen(page, "Teleop Configuration") },
  { name: "runtime-control-panel", setup: (page) => showSandboxRuntimeScreen(page, "Control Panel") },
  { name: "runtime-snake-control", setup: (page) => showSandboxRuntimeScreen(page, "Snake Control") },
  { name: "runtime-visual-servoing", setup: (page) => showSandboxRuntimeScreen(page, "Visual Servoing") },
  {
    name: "runtime-visual-servoing-monitor",
    setup: (page) => showSandboxRuntimeScreen(page, "Visual Servoing Monitor"),
  },
  { name: "debug-runtime", setup: showDebugRuntime },
];

const configurations = Object.fromEntries(
  await Promise.all(
    Object.entries(configurationFixturePaths).map(async ([id, fixturePath]) => [
      id,
      JSON.parse(await readFile(fixturePath, "utf8")),
    ]),
  ),
);
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
      json: { configuration_ids: Object.keys(configurations) },
      status: 200,
    });
  });

  for (const [configurationId, configuration] of Object.entries(configurations)) {
    await page.route(`**/api/v1/configurations/${configurationId}`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: configuration,
        status: 200,
      });
    });
  }
}

async function mockRuntimeDebugApi(page) {
  await page.route("**/api/v1/ros/topics/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        topics: [
          {
            name: "/teleop_cmd",
            message_type: "extender_msgs/msg/TeleopCommand",
            publisher_count: 1,
            subscription_count: 1,
          },
          {
            name: "/cmd/max_velocity",
            message_type: "std_msgs/msg/Float64",
            publisher_count: 1,
            subscription_count: 0,
          },
        ],
      },
      status: 200,
    });
  });

  await page.route("**/api/v1/ros/topics", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        topics: [
          { name: "/teleop_cmd", message_type: "extender_msgs/msg/TeleopCommand" },
          { name: "/cmd/max_velocity", message_type: "std_msgs/msg/Float64" },
        ],
      },
      status: 200,
    });
  });

  await page.route("**/api/v1/runtime/audit**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { records: [] },
      status: 200,
    });
  });
}

async function mockRuntimeWebSocket(page) {
  await page.addInitScript(() => {
    class BloomVisualSmokeWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readyState = BloomVisualSmokeWebSocket.CONNECTING;

      constructor(url) {
        super();
        this.url = url;
        window.setTimeout(() => {
          this.readyState = BloomVisualSmokeWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
        }, 0);
      }

      close() {
        this.readyState = BloomVisualSmokeWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent("close"));
      }

      send(data) {
        const message = parseRuntimeCommand(data);
        if (!message) {
          return;
        }

        if (message.type === "subscribe_topic") {
          this.acknowledgeSubscription(message);
          return;
        }

        if (message.type === "teleop_cmd") {
          this.acknowledgeTeleopCommand(message);
        }
      }

      acknowledgeSubscription(message) {
        window.setTimeout(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "subscription_ack",
                detail: `Subscribed to ${message.topic}.`,
                payload: {
                  field_path: message.field_path ?? "",
                  message_type: message.message_type ?? "",
                  topic: message.topic,
                  widget_id: message.widget_id,
                },
              }),
            }),
          );
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "topic_sample",
                detail: `Sample received from ${message.topic}.`,
                payload: {
                  message_type: message.message_type ?? "",
                  received_at: new Date().toISOString(),
                  topic: message.topic,
                  value: createSampleValue(message.field_path),
                },
              }),
            }),
          );
        }, 0);
      }

      acknowledgeTeleopCommand(message) {
        window.setTimeout(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "teleop_ack",
                detail: "Teleop command accepted by visual smoke runtime.",
                payload: {
                  angular: message.angular,
                  linear: message.linear,
                  mode: message.mode,
                  seq: message.seq,
                  status: "simulated",
                  target: message.target,
                },
              }),
            }),
          );
        }, 0);
      }
    }

    function createSampleValue(fieldPath) {
      if (fieldPath === "twist.linear.x") {
        return { twist: { linear: { x: 0.12 }, angular: { z: 0 } } };
      }
      if (fieldPath === "data") {
        return { data: 0.12 };
      }
      return { data: "visual-smoke-sample" };
    }

    function parseRuntimeCommand(data) {
      if (typeof data !== "string") {
        return null;
      }
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }

    window.WebSocket = BloomVisualSmokeWebSocket;
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
  await page.getByRole("button", { name: "Open Sandbox V0.0 app" }).click();
  await page.getByRole("heading", { name: "Sandbox V0.0" }).waitFor();
}

async function showRuntime(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: "Launch Sandbox V0.0 runtime" }).click();
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
}

async function showSandboxRuntimeScreen(page, screenName) {
  await mockRuntimeWebSocket(page);
  await showRuntime(page);
  await page.getByLabel("Open runtime menu").click();
  await page.getByRole("button", { exact: true, name: screenName }).click();
  await page.locator(".runtime-active-screen-label", { hasText: screenName }).waitFor();
  await page.getByLabel("Open runtime menu").click();
}

async function showDebugRuntime(page) {
  await mockRuntimeDebugApi(page);
  await mockRuntimeWebSocket(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: "Launch Bloom Debug runtime" }).click();
  await page.getByRole("heading", { name: "Bloom Debug" }).waitFor();
  await page.getByRole("heading", { name: "Inspect, record, and audit runtime topics." }).waitFor();
  await page.getByRole("button", { name: "Refresh topics" }).click();
  await page.getByLabel("Topic catalog").getByText("/teleop_cmd").waitFor();
  await page.getByLabel("Robot preflight").getByText("Ready").first().waitFor();
  await page.getByRole("button", { name: "Refresh audit" }).click();
  await page.getByRole("article", { name: /Teleop command echo/i }).waitFor();
  await page.getByRole("article", { name: /Velocity command X/i }).waitFor();
  await page.getByRole("heading", { name: "Topic catalog" }).waitFor();
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
