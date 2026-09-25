import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { STACK } from "./stack-topics.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(__dirname, "../..");
export const dashboardRoot = resolve(repoRoot, "frontend/apps/bloom-dashboard");
export const seedApplicationsDir = resolve(repoRoot, "backend/seed/applications");

/** Every shipped bundle, keyed by the configuration id the API serves it under: the seed file's stem. */
export async function loadSeedConfigurations() {
  const files = (await readdir(seedApplicationsDir)).filter((name) => name.endsWith(".json")).sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(async (name) => [
        name.slice(0, -".json".length),
        JSON.parse(await readFile(resolve(seedApplicationsDir, name), "utf8")),
      ]),
    ),
  );
}

export async function loadSeedConfigurationsByPath(pathsById) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(pathsById).map(async ([id, path]) => [id, JSON.parse(await readFile(path, "utf8"))]),
    ),
  );
}

export async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return chromium.launch();
  }
}

/** The dashboard on its own port, with the API unset so every request falls to the page mocks. */
/** The lab panels are Android tablets, not desktop windows: touch, a dense
 * screen and a tablet UA. The real panel's scale and UA can be set from the
 * environment once measured; these are the defaults until then. */
export const TABLET_EMULATION = {
  deviceScaleFactor: Number(process.env.BLOOM_TABLET_DEVICE_SCALE ?? "2"),
  hasTouch: true,
  isMobile: true,
  userAgent:
    process.env.BLOOM_TABLET_USER_AGENT ??
    "Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

export function startDashboardServer(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: dashboardRoot,
    detached: true,
    env: { ...process.env, VITE_BLOOM_API_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let exitError;
  server.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      exitError = new Error(`Bloom dashboard dev server exited with code ${code}.`);
      return;
    }
    if (signal) {
      exitError = new Error(`Bloom dashboard dev server exited with signal ${signal}.`);
    }
  });
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));

  const ready = async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20_000) {
      if (exitError) {
        throw exitError;
      }
      try {
        const response = await fetch(baseUrl);
        if (response.ok) {
          return;
        }
      } catch {
        // Vite is still starting.
      }
      await new Promise((settle) => setTimeout(settle, 250));
    }
    throw new Error(`Timed out waiting for ${baseUrl}`);
  };

  const stop = async () => {
    if (!server.pid || server.killed) {
      return;
    }
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      return;
    }
    await new Promise((settle) => setTimeout(settle, 500));
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      // The server already stopped after SIGTERM.
    }
  };

  return { baseUrl, ready, stop };
}

export const DEFAULT_TOPIC_STATUS = [
  {
    name: STACK.twist,
    message_type: "geometry_msgs/msg/TwistStamped",
    publisher_count: 1,
    subscription_count: 1,
  },
  { name: STACK.mode, message_type: "std_msgs/msg/String", publisher_count: 1, subscription_count: 1 },
  { name: STACK.jointStates, message_type: "sensor_msgs/msg/JointState", publisher_count: 1, subscription_count: 0 },
  {
    name: "/cartesian_command",
    message_type: "geometry_msgs/msg/TwistStamped",
    publisher_count: 1,
    subscription_count: 0,
  },
  {
    name: STACK.servoVelocity,
    message_type: "geometry_msgs/msg/TwistStamped",
    publisher_count: 1,
    subscription_count: 0,
  },
];

/**
 * What `GET /api/v1/capabilities` answers with every ROS seam wired (capabilities.py). Unrouted, the
 * page gets a 502 and every capability-gated control renders in its unresolved fallback, so a visual
 * check measures the fallback instead of the screen.
 *
 * The frame list is the union the shipped apps name: one deployment drives one arm, but this harness
 * serves Explorer and Kinova bundles from one backend, and a shorter list would draw their frame rows
 * as "not on this robot".
 */
export const DEFAULT_RUNTIME_CAPABILITIES = {
  capabilities: [
    { id: "command-dispatcher", available: true, detail: "Commands are published to ROS." },
    { id: "service-dispatcher", available: true, detail: "ROS services can be called." },
    { id: "data-source", available: true, detail: "Topic subscriptions deliver live samples." },
    { id: "teleop-adapter", available: true, detail: "Teleop commands reach the manager." },
    { id: "camera-frames", available: true, detail: "Camera frames are published to ROS." },
    { id: "recording", available: true, detail: "Runtime recording is available." },
  ],
  command_frame_id: "base_link",
  command_frame_ids: ["base_link", "hybrid_frame", "ft_frame", "effector_frame"],
  // Empty is what a deployment that has not named its arm reports, and this one drives two.
  robot_name: "",
};

export const DEFAULT_SAVED_POSITIONS = [
  { name: "home", joint_names: ["joint_1", "joint_2"], positions: [2.5, 0.3], description: "" },
  { name: "table-reach", joint_names: ["joint_1", "joint_2"], positions: [1.2, -0.4], description: "" },
];

export async function installConfigurationMocks(
  page,
  configurations,
  {
    capabilities = DEFAULT_RUNTIME_CAPABILITIES,
    positions = DEFAULT_SAVED_POSITIONS,
    topics = DEFAULT_TOPIC_STATUS,
  } = {},
) {
  await page.route("**/api/v1/configurations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { configuration_ids: Object.keys(configurations) },
      status: 200,
    });
  });

  for (const [configurationId, configuration] of Object.entries(configurations)) {
    await page.route(`**/api/v1/configurations/${configurationId}`, async (route) => {
      await route.fulfill({ contentType: "application/json", json: configuration, status: 200 });
    });
  }

  await page.route("**/api/v1/capabilities", async (route) => {
    await route.fulfill({ contentType: "application/json", json: capabilities, status: 200 });
  });

  await page.route("**/api/v1/ros/topics/status", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { topics }, status: 200 });
  });

  // The runtime scopes its library to one app, so the path always carries a query: a pattern without
  // the trailing `**` matched nothing and the position library drew its failure state instead.
  await page.route("**/api/v1/runtime/positions**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("/export")) {
      const yaml = ["joint_targets:", ...positions.map((position) => `  ${position.name}: ${position.positions}`)];
      await route.fulfill({
        contentType: "application/json",
        json: { target_names: positions.map((position) => position.name), yaml: yaml.join("\n") },
        status: 200,
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", json: { positions }, status: 200 });
  });

  // A parameter control opens on what the node holds; here nothing does, so it keeps its seed value.
  await page.route("**/api/v1/ros/parameters**", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { parameters: [] }, status: 200 });
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

/** A websocket that answers every request the runtime makes, so widgets settle on data instead of on "waiting". */
export async function installRuntimeWebSocketMock(page) {
  await page.addInitScript(() => {
    class BloomHarnessWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readyState = BloomHarnessWebSocket.CONNECTING;

      constructor(url) {
        super();
        this.url = url;
        this.sessionId = `bloom-harness-${Date.now()}-${Math.random()}`;
        // The camera client assigns onmessage/onclose; an EventTarget only knows addEventListener.
        for (const type of ["close", "error", "message", "open"]) {
          let handler = null;
          Object.defineProperty(this, `on${type}`, {
            get: () => handler,
            set: (next) => {
              if (handler) {
                this.removeEventListener(type, handler);
              }
              handler = next;
              if (next) {
                this.addEventListener(type, next);
              }
            },
          });
        }
        if (String(url).includes("/api/v1/runtime/camera")) {
          this.openAsCameraStream();
          return;
        }
        window.setTimeout(() => {
          this.readyState = BloomHarnessWebSocket.OPEN;
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
        this.readyState = BloomHarnessWebSocket.CLOSED;
        this.dispatchEvent(new CloseEvent("close"));
      }

      /**
       * A camera socket answers with one 4:3 frame, the shape a lab webcam sends: a card that
       * grows with the image instead of holding its box only shows once a frame is on it.
       */
      openAsCameraStream() {
        window.setTimeout(() => {
          this.readyState = BloomHarnessWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          this.reply({ type: "camera_stream_opened", connected: true });
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const context = canvas.getContext("2d");
          context.fillStyle = "#2f8f5b";
          context.fillRect(0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob && this.readyState === BloomHarnessWebSocket.OPEN) {
              this.dispatchEvent(new MessageEvent("message", { data: blob }));
            }
          }, "image/png");
        }, 0);
      }

      send(data) {
        const message = parseRuntimeCommand(data);
        if (!message) {
          return;
        }
        if (message.type === "teleop_cmd") {
          // Kept so a check can read what the runtime would have sent the manager.
          window.__bloomTeleopSent = [...(window.__bloomTeleopSent ?? []), message];
        }
        if (message.type === "claim_control" || message.type === "release_control") {
          this.acknowledgeControl(message.type === "claim_control");
          return;
        }
        if (message.type === "subscribe_topic") {
          this.acknowledgeSubscription(message);
          return;
        }
        if (message.type === "ping") {
          this.reply({ type: "pong", detail: "Runtime session is alive.", payload: {} });
          return;
        }
        if (message.type === "app_context") {
          this.reply({
            type: "app_context_ack",
            detail: "Harness runtime accepted the app context.",
            payload: { app_id: message.app_id, config_id: message.config_id },
          });
          return;
        }
        if (message.type === "unsubscribe_topic") {
          // Replies match requests by position, so every request needs one.
          this.reply({
            type: "unsubscription_ack",
            detail: `Unsubscribed from ${message.topic}.`,
            payload: { removed: true, topic: message.topic, widget_id: message.widget_id },
          });
          return;
        }
        if (message.type === "teleop_cmd") {
          this.reply({
            type: "teleop_ack",
            detail: "Teleop command accepted by the harness runtime.",
            payload: {
              angular: message.angular,
              linear: message.linear,
              mode: message.mode,
              seq: message.seq,
              status: "simulated",
              target: message.target,
            },
          });
        }
      }

      reply(body) {
        window.setTimeout(() => {
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(body) }));
        }, 0);
      }

      acknowledgeControl(isOwner) {
        this.reply({
          detail: isOwner ? "This runtime session owns robot control." : "No runtime session owns robot control.",
          payload: { active_sessions: 1, is_owner: isOwner, owner_present: isOwner, session_id: this.sessionId },
          session_id: this.sessionId,
          type: "control_state",
        });
      }

      acknowledgeSubscription(message) {
        this.reply({
          type: "subscription_ack",
          detail: `Subscribed to ${message.topic}.`,
          payload: {
            field_path: message.field_path ?? "",
            message_type: message.message_type ?? "",
            topic: message.topic,
            widget_id: message.widget_id,
          },
        });
        this.reply({
          type: "topic_sample",
          detail: `Sample received from ${message.topic}.`,
          payload: {
            message_type: message.message_type ?? "",
            received_at: new Date().toISOString(),
            topic: message.topic,
            value: createSampleValue(message.field_path, message.topic),
          },
        });
      }
    }

    function createSampleValue(fieldPath, topic) {
      if (topic === "/joint_states") {
        return {
          name: ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"],
          position: [0.56, 0.34, -0.17, -0.76, -1.08, -0.89],
          velocity: [-0.067, -0.159, -0.176, -0.111, 0.007, 0.121],
          effort: [-0.3, -2.1, -2.1, -0.1, 2, 2.2],
        };
      }
      if (topic === "/ee_jac") {
        return {
          data: Array.from({ length: 36 }, (_, index) => (index % 7 === 0 ? 0.87 : ((index * 37) % 11) / 20 - 0.25)),
        };
      }
      if (topic === "/ee_pose") {
        return { header: { frame_id: "base_link" }, pose: { position: { x: 0.3, y: 0.1, z: 0.32 } } };
      }
      if (fieldPath === "" && /command|velocity/.test(topic ?? "")) {
        return {
          header: { frame_id: "base_link" },
          twist: { linear: { x: 0.27, y: 0.19, z: 0.32 }, angular: { x: 0, y: 0, z: 0.35 } },
        };
      }
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

    window.WebSocket = BloomHarnessWebSocket;
  });
}

export async function assertNoHorizontalOverflow(page, label) {
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
