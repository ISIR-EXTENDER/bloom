import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dashboardRoot = resolve(repoRoot, "frontend/apps/bloom-dashboard");
const configurationFixturePaths = {
  "bloom-debug": resolve(repoRoot, "backend/seed/applications/bloom-debug.json"),
  "explorer-manager": resolve(repoRoot, "backend/seed/applications/explorer-manager.json"),
  sandbox: resolve(repoRoot, "backend/seed/applications/sandbox.json"),
};
const outputDir = process.env.BLOOM_VISUAL_OUTPUT_DIR ?? resolve("/tmp", "bloom-visual-smoke");
const port = Number(process.env.BLOOM_VISUAL_PORT ?? "5178");
const baseUrl = `http://127.0.0.1:${port}`;

// The three panels Bloom is actually deployed on. 1280x720 and 1820x720 are
// the sizes the design references are drawn at; 1024x600 is the smallest
// tablet in the field.
const viewports = [
  { name: "tablet-native", width: 1024, height: 600 },
  { name: "tablet-720", width: 1280, height: 720 },
  { name: "tablet-wide-720", width: 1820, height: 720 },
];

const routes = [
  { name: "landing", setup: showLanding },
  { name: "builder", setup: showBuilder },
  { name: "app-config", setup: showAppConfig },
  { name: "builder-review", setup: showBuilderReview },
  { name: "runtime", setup: showRuntime },
  { name: "supervisor-mirror", setup: showSupervisorMirror },
  { name: "runtime-tour", setup: showRuntimeTour },
  { name: "runtime-sandbox-teleop-config", setup: (page) => showSandboxRuntimeScreen(page, "Teleop Configuration") },
  { name: "runtime-control-panel", setup: (page) => showSandboxRuntimeScreen(page, "Control Panel") },
  { name: "runtime-snake-control", setup: (page) => showSandboxRuntimeScreen(page, "Snake Control") },
  { name: "runtime-visual-servoing", setup: (page) => showSandboxRuntimeScreen(page, "Visual Servoing") },
  {
    name: "runtime-visual-servoing-monitor",
    setup: (page) => showSandboxRuntimeScreen(page, "Visual Servoing Monitor"),
  },
  { name: "debug-runtime", setup: showDebugRuntime },
  { name: "explorer-drive", setup: (page) => showExplorerRuntimeScreen(page, null) },
  { name: "explorer-positions", setup: (page) => showExplorerRuntimeScreen(page, "Positions") },
  { name: "explorer-feedback", setup: (page) => showExplorerRuntimeScreen(page, "Robot feedback") },
  { name: "explorer-sources", setup: (page) => showExplorerRuntimeScreen(page, "Command sources") },
  { name: "explorer-joystick-lab", setup: (page) => showExplorerRuntimeScreen(page, "Joystick lab") },
];

/**
 * Where "STOP covers nothing" holds today. Drive and Joystick Lab leave the
 * bottom-right corner free; Positions, Robot feedback and Command sources each
 * run a widget into it, and STOP covers about 128x115 of one at 1024x600.
 * Sandbox's legacy screens do the same and their echoes grow as samples
 * arrive, so asserting there measures the fixture. The fix is a decision, not
 * a nudge: reserve STOP a lane in the shell and every screen loses fit, or
 * re-author four screens. Measured and tracked in
 * docs/ux-design-review-2-plan.md.
 */
const ROUTES_GUARANTEEING_CLEAR_CHROME = new Set(["explorer-drive", "explorer-joystick-lab"]);

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
        if (ROUTES_GUARANTEEING_CLEAR_CHROME.has(route.name)) {
          await assertRuntimeChromeCoversNothing(page, `${viewport.name}:${route.name}`);
        }
        await assertNothingIsClipped(page, `${viewport.name}:${route.name}`);
        if (route.name === "supervisor-mirror") {
          await assertSupervisorTopicsFit(page, viewport.name);
        }
        await page.screenshot({
          fullPage: false,
          path: resolve(outputDir, `${viewport.name}-${route.name}.png`),
        });
      }

      await assertBrowserHistoryAffordance(page, viewport.name);
      await page.close();
    }

    await captureRuntimeLocales(browser);
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

  await page.route("**/api/v1/ros/topics/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        topics: [
          {
            name: "/joystick_cartesian_command",
            message_type: "geometry_msgs/msg/TwistStamped",
            publisher_count: 1,
            subscription_count: 1,
          },
          {
            name: "/mode_request",
            message_type: "std_msgs/msg/String",
            publisher_count: 1,
            subscription_count: 1,
          },
          {
            name: "/joint_states",
            message_type: "sensor_msgs/msg/JointState",
            publisher_count: 1,
            subscription_count: 0,
          },
          {
            name: "/cartesian_command",
            message_type: "geometry_msgs/msg/TwistStamped",
            publisher_count: 1,
            subscription_count: 0,
          },
          {
            name: "/visual_servoing/velocity_command",
            message_type: "geometry_msgs/msg/TwistStamped",
            publisher_count: 1,
            subscription_count: 0,
          },
        ],
      },
      status: 200,
    });
  });

  await page.route("**/api/v1/runtime/stop", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { detail: "Runtime stop is not engaged.", engaged_at: "", stopped: false },
      status: 200,
    });
  });

  await page.route("**/api/v1/runtime/control", async (route) => {
    const sessionId = route.request().headers()["x-bloom-runtime-session"] ?? "";
    await route.fulfill({
      contentType: "application/json",
      json: {
        active_sessions: 1,
        detail: sessionId ? "This runtime session owns robot control." : "Another runtime session owns robot control.",
        is_owner: sessionId !== "",
        owner_present: true,
        session_id: sessionId,
      },
      status: 200,
    });
  });
}

async function mockRuntimeDebugApi(page) {
  await page.route("**/api/v1/ros/topics/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        topics: [
          {
            name: "/joystick_cartesian_command",
            message_type: "geometry_msgs/msg/TwistStamped",
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
          { name: "/joystick_cartesian_command", message_type: "geometry_msgs/msg/TwistStamped" },
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
        this.sessionId = `visual-smoke-${Date.now()}-${Math.random()}`;
        window.setTimeout(() => {
          this.readyState = BloomVisualSmokeWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          window.setTimeout(() => {
            this.dispatchEvent(
              new MessageEvent("message", {
                data: JSON.stringify({
                  active_sessions: 1,
                  payload: {
                    active_sessions: 1,
                    is_owner: false,
                    owner_present: false,
                    session_id: this.sessionId,
                  },
                  session_id: this.sessionId,
                  type: "session_connected",
                }),
              }),
            );
          }, 0);
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

        if (message.type === "claim_control") {
          this.acknowledgeControl(true);
          return;
        }

        if (message.type === "release_control") {
          this.acknowledgeControl(false);
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

      acknowledgeControl(isOwner) {
        const detail = isOwner ? "This runtime session owns robot control." : "No runtime session owns robot control.";
        window.setTimeout(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({
                detail,
                payload: {
                  active_sessions: 1,
                  is_owner: isOwner,
                  owner_present: isOwner,
                  session_id: this.sessionId,
                },
                session_id: this.sessionId,
                type: "control_state",
              }),
            }),
          );
        }, 0);
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

async function showBuilderReview(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("button", { exact: true, name: "Apps" }).click();
  await page.getByRole("button", { name: "Open Explorer Manager app" }).click();
  await page.getByRole("button", { name: "Review checklist" }).click();
  await page.getByRole("region", { name: "Builder review checklist" }).waitFor();
}

async function showRuntime(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: "Launch Sandbox V0.0 runtime" }).click();
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
}

async function showRuntimeTour(page) {
  await showExplorerRuntimeScreen(page, null);
  await holdForMaintenance(page);
  await page.getByRole("button", { name: "Practice tour" }).click();
  await page.getByRole("region", { name: "Practice this app" }).waitFor();
}

async function showSupervisorMirror(page) {
  await mockRuntimeWebSocket(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: "Open Explorer Manager supervisor mirror" }).click();
  await page.getByRole("region", { name: "Supervisor mirror" }).waitFor();
  await page.getByText("Operator retains control").waitFor();
}

async function showSandboxRuntimeScreen(page, screenName) {
  await mockRuntimeWebSocket(page);
  await showRuntime(page);

  // Screen switching moved behind the maintenance hold when the runtime became
  // a kiosk: a stray tap on a tab used to swap every control under a moving
  // arm. The smoke run has to hold too, and there is no active-screen label in
  // the bar any more, so arrival is confirmed by the overlay closing.
  await holdForMaintenance(page);
  await page
    .getByRole("navigation", { name: "Switch runtime screen" })
    .getByRole("button", { exact: true, name: screenName })
    .click();
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor({ state: "detached" });
}

async function showExplorerRuntimeScreen(page, screenName) {
  await mockRuntimeWebSocket(page);
  await mockSavedPositions(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { name: "Launch Explorer Manager runtime" }).click();
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
  if (screenName === null) {
    return;
  }
  await holdForMaintenance(page);
  await page
    .getByRole("navigation", { name: "Switch runtime screen" })
    .getByRole("button", { exact: true, name: screenName })
    .click();
  await page.getByRole("dialog", { name: "Maintenance" }).waitFor({ state: "detached" });
}

async function mockSavedPositions(page) {
  const positions = [
    { name: "home", joint_names: ["joint_1", "joint_2"], positions: [2.5, 0.3], description: "" },
    { name: "table-reach", joint_names: ["joint_1", "joint_2"], positions: [1.2, -0.4], description: "" },
  ];
  await page.route("**/api/v1/runtime/positions", async (route) => {
    await route.fulfill({ json: { positions }, status: 200 });
  });
}

async function holdForMaintenance(page) {
  const button = page.getByRole("button", {
    name: /Hold to open maintenance|Mantener para abrir mantenimiento|Maintenir pour ouvrir la maintenance/,
  });
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await page.getByRole("dialog", { name: /Maintenance|Mantenimiento/ }).waitFor();
}

async function captureRuntimeLocales(browser) {
  const locales = [
    { code: "en", language: "Language", settings: "Settings" },
    { code: "es", language: "Idioma", settings: "Ajustes" },
    { code: "fr", language: "Langue", settings: "Réglages" },
  ];

  for (const locale of locales) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await mockConfigurationApi(page);
    await showExplorerRuntimeScreen(page, null);
    await holdForMaintenance(page);
    await page.locator(".runtime-maintenance-languages button").filter({ hasText: locale.code.toUpperCase() }).click();
    await page.getByRole("button", { exact: true, name: locale.settings }).click();
    await page.getByRole("button", { exact: true, name: locale.language }).click();
    await assertNoHorizontalOverflow(page, `runtime-settings-${locale.code}`);
    await assertPreviewControlsFit(page, `runtime-settings-${locale.code}`);
    await page.screenshot({ path: resolve(outputDir, `runtime-settings-${locale.code}-1280x720.png`) });

    if (locale.code === "en") {
      await page.evaluate(() => {
        const walker = document.createTreeWalker(document.querySelector(".runtime-settings"), NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const value = node.textContent?.trim() ?? "";
          if (value && !/^[+\-\d.\s%xym]+$/i.test(value)) {
            node.textContent = `[${value}${"~".repeat(Math.ceil(value.length * 0.4))}]`;
          }
          node = walker.nextNode();
        }
      });
      await assertNoHorizontalOverflow(page, "runtime-settings-pseudo");
      await assertPreviewControlsFit(page, "runtime-settings-pseudo");
      await page.screenshot({ path: resolve(outputDir, "runtime-settings-pseudo-1280x720.png") });
    }
    await page.close();
  }
}

async function assertPreviewControlsFit(page, label) {
  const clipped = await page.locator(".runtime-settings-try").evaluate((container) => {
    const bounds = container.getBoundingClientRect();
    return [...container.querySelectorAll("button, output")]
      .map((element) => ({ label: element.textContent?.trim(), rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < bounds.left - 2 || rect.right > bounds.right + 2)
      .map(({ label: elementLabel, rect }) => ({ elementLabel, left: rect.left, right: rect.right }));
  });

  if (clipped.length > 0) {
    throw new Error(`${label} has clipped preview controls: ${JSON.stringify(clipped)}`);
  }
}

/**
 * STOP is chrome drawn over the artboard. It may cover empty canvas; it must
 * never cover a widget, because the reading a supervisor needs disappears
 * under it without any sign that it is there.
 */
async function assertRuntimeChromeCoversNothing(page, label) {
  const covered = await page.evaluate(() => {
    const chrome = [...document.querySelectorAll(".runtime-stop-control, .runtime-switch-bar")];
    const widgetCount = document.querySelectorAll(".widget-preview-card").length;
    if (chrome.length > 0 && widgetCount === 0) {
      return [{ chrome: "selector", widget: "none matched", overlap: { height: 0, width: 0 } }];
    }
    if (chrome.length === 0) return [];
    const widgets = [...document.querySelectorAll(".widget-preview-card")];
    const overlaps = [];
    for (const piece of chrome) {
      const a = piece.getBoundingClientRect();
      if (a.width === 0 || a.height === 0) continue;
      for (const widget of widgets) {
        const b = widget.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapWidth > 2 && overlapHeight > 2) {
          overlaps.push({
            chrome: piece.className,
            overlap: { height: Math.round(overlapHeight), width: Math.round(overlapWidth) },
            widget: widget.getAttribute("aria-label"),
          });
        }
      }
    }
    return overlaps;
  });

  if (covered.length > 0) {
    throw new Error(`${label} has runtime chrome covering widgets: ${JSON.stringify(covered)}`);
  }
}

/**
 * Text cut off by its own container reads as a design choice; it is a loss.
 *
 * Width only. A line box is a couple of pixels taller wherever the runtime
 * font is not installed, which is every CI runner, and failing on that says
 * "clipped" about a machine without Atkinson Hyperlegible rather than about
 * the layout.
 */
async function assertNothingIsClipped(page, label) {
  const clipped = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll(".widget-preview-card strong, .widget-preview-card output")];
    return candidates
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.overflow === "visible" && style.textOverflow !== "ellipsis") return false;
        return element.scrollWidth - element.clientWidth > 2;
      })
      .slice(0, 8)
      .map((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        text: element.textContent?.trim().slice(0, 40),
      }));
  });

  if (clipped.length > 0) {
    throw new Error(`${label} clips widget text: ${JSON.stringify(clipped)}`);
  }
}

async function assertSupervisorTopicsFit(page, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const result = await page.evaluate(() => {
    const list = document.querySelector(".supervisor-workspace .runtime-robot-topic-list");
    if (!list) return { missingList: true };
    const bounds = list.getBoundingClientRect();
    const clipped = [...list.children]
      .map((element) => ({ label: element.textContent?.trim(), rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < bounds.left - 2 || rect.right > bounds.right + 2)
      .map(({ label: topicLabel, rect }) => ({ left: rect.left, right: rect.right, topicLabel }));
    const panel = list.closest(".runtime-robot-status")?.getBoundingClientRect();
    const workspace = list.closest(".supervisor-workspace")?.getBoundingClientRect();
    return {
      clipped,
      panelBottom: panel?.bottom ?? 0,
      panelHeight: panel?.height ?? 0,
      panelTop: panel?.top ?? 0,
      scrollY: window.scrollY,
      viewportHeight: document.documentElement.clientHeight,
      workspaceBottom: workspace?.bottom ?? 0,
    };
  });

  if (
    result.missingList ||
    result.clipped.length > 0 ||
    result.panelBottom > result.viewportHeight + 2 ||
    result.workspaceBottom > result.viewportHeight + 2
  ) {
    throw new Error(`${label} has clipped supervisor status: ${JSON.stringify(result)}`);
  }
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
  await page.getByLabel("Topic catalog").getByText("/joystick_cartesian_command").waitFor();
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
