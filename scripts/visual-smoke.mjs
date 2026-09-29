import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertNoHorizontalOverflow,
  installConfigurationMocks,
  installRuntimeWebSocketMock,
  launchBrowser,
  loadSeedConfigurationsByPath,
  pushCommandState,
  repoRoot,
  startDashboardServer,
  TABLET_EMULATION,
  withThemePreset,
} from "./lib/runtime-harness.mjs";
import { STACK } from "./lib/stack-topics.mjs";

const configurationFixturePaths = {
  "bloom-debug": resolve(repoRoot, "backend/seed/applications/bloom-debug.json"),
  "explorer-manager": resolve(repoRoot, "backend/seed/applications/explorer-manager.json"),
  sandbox: resolve(repoRoot, "backend/seed/applications/sandbox.json"),
};
const outputDir = process.env.BLOOM_VISUAL_OUTPUT_DIR ?? resolve("/tmp", "bloom-visual-smoke");
const port = Number(process.env.BLOOM_VISUAL_PORT ?? "5178");
// A slider named after a long topic must keep its size and its centred knob.
const LONG_TOPIC = "/cartesian_manager/some/very/long/topic_name";

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
  { name: "runtime-library", setup: showRuntimeLibrary },
  { name: "runtime", setup: showRuntime },
  { name: "supervisor-mirror", setup: showSupervisorMirror },
  { name: "runtime-tour", setup: showRuntimeTour },
  // The teleop config screen left with the sandbox rebase: its knobs are cartesian_manager
  // parameters now, which Bloom cannot set until it has a parameter seam.
  { name: "runtime-control-panel", setup: (page) => showSandboxRuntimeScreen(page, "Control Panel") },
  { name: "runtime-snake-control", setup: (page) => showSandboxRuntimeScreen(page, "Snake Control") },
  { name: "runtime-visual-servoing", setup: (page) => showSandboxRuntimeScreen(page, "Visual Servoing") },
  {
    name: "runtime-visual-servoing-monitor",
    setup: (page) => showSandboxRuntimeScreen(page, "Visual Servoing Monitor"),
  },
  { name: "explorer-drive", setup: (page) => showExplorerRuntimeScreen(page, null) },
  { name: "explorer-positions", setup: (page) => showExplorerRuntimeScreen(page, "Positions") },
  { name: "explorer-feedback", setup: (page) => showExplorerRuntimeScreen(page, "Robot feedback") },
  { name: "explorer-sources", setup: (page) => showExplorerRuntimeScreen(page, "Command sources") },
  { name: "explorer-joystick-lab", setup: (page) => showExplorerRuntimeScreen(page, "Joystick lab") },
  {
    name: "explorer-maintenance",
    setup: async (page) => {
      await showExplorerRuntimeScreen(page, null);
      await holdForMaintenance(page);
    },
  },
];

/** ADR 0143: each vetted palette, on the tablet, on the screens an operator and an author use most. */
const PALETTES = ["bloom", "extender-ui", "high-contrast", "dark", "colour-safe", "pastel"];
const PALETTE_ROUTES = [
  { name: "runtime", setup: showRuntime },
  { name: "explorer-drive", setup: (page) => showExplorerRuntimeScreen(page, null) },
  {
    name: "explorer-maintenance",
    setup: async (page) => {
      await showExplorerRuntimeScreen(page, null);
      await holdForMaintenance(page);
    },
  },
  {
    name: "settings",
    setup: async (page) => {
      await showExplorerRuntimeScreen(page, null);
      await holdForMaintenance(page);
      await page.getByRole("button", { exact: true, name: "Settings" }).click();
      await page.getByRole("region", { name: "Settings" }).waitFor();
    },
  },
  { name: "app-config", setup: showAppConfig },
  {
    name: "app-theme",
    setup: async (page) => {
      await showAppConfig(page);
      await page.getByRole("heading", { name: "App theme" }).scrollIntoViewIfNeeded();
    },
  },
  { name: "runtime-library", setup: showRuntimeLibrary },
];

/**
 * Every operator screen Bloom ships. STOP is chrome drawn in each screen's
 * reserved region, so no widget may sit under it. Sandbox's lab screens still
 * tile into the corner STOP, and their topic echoes grow as samples arrive, so
 * asserting there would measure the fixture.
 */
const ROUTES_GUARANTEEING_CLEAR_CHROME = new Set([
  "explorer-drive",
  "explorer-feedback",
  "explorer-joystick-lab",
  "explorer-positions",
  "explorer-sources",
]);

const configurations = await loadSeedConfigurationsByPath(configurationFixturePaths);
await mkdir(outputDir, { recursive: true });

const server = startDashboardServer(port);
const baseUrl = server.baseUrl;

try {
  await server.ready();
  const browser = await launchBrowser();

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        ...TABLET_EMULATION,
      });
      await installConfigurationMocks(page, configurations);
      await installRuntimeWebSocketMock(page);

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

    await assertTwoFingerDrive(browser);
    await assertSliderKnobStaysCentred(browser);
    await captureRuntimeLocales(browser);
    await capturePracticeOffer(browser);
    await captureDesktopDebug(browser);
    await captureBuilderCanvas(browser);
    await capturePalettes(browser);
  } finally {
    await browser.close();
  }
} finally {
  await server.stop();
}

console.log(`Bloom visual smoke screenshots captured in ${outputDir}`);

async function mockRuntimeDebugApi(page) {
  await page.route("**/api/v1/ros/topics/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        topics: [
          {
            name: STACK.twist,
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
          { name: STACK.twist, message_type: "geometry_msgs/msg/TwistStamped" },
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

async function showLanding(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /give the gesture back/i }).waitFor();
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

async function showRuntimeLibrary(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
}

async function showRuntime(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await openRuntimeApp(page, "Sandbox V0.0");
  await page.getByRole("region", { name: "Runtime application" }).waitFor();
}

async function showRuntimeTour(page) {
  await showExplorerRuntimeScreen(page, null);
  await holdForMaintenance(page);
  await page.getByRole("button", { exact: true, name: "Practice" }).click();
  await page.getByRole("region", { name: "Practice this app" }).waitFor();
}

async function showSupervisorMirror(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("button", { exact: true, name: "Explorer Manager" }).click();
  await page.getByRole("button", { name: "Open Explorer Manager supervisor mirror" }).click();
  await page.getByRole("region", { name: "Supervisor mirror" }).waitFor();
  await page.getByText("Operator retains control").waitFor();
}

async function showSandboxRuntimeScreen(page, screenName) {
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
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await openRuntimeApp(page, "Explorer Manager");
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

async function holdForMaintenance(page) {
  const button = page.locator(".runtime-kiosk-maintenance");
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await page.getByRole("dialog", { name: /Maintenance|Mantenimiento/ }).waitFor();
}

/** The tablet drives with two thumbs: one on Translation and one on Rotation must reach the twist together. */
async function assertTwoFingerDrive(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ...TABLET_EMULATION });
  try {
    await installConfigurationMocks(page, configurations);
    await installRuntimeWebSocketMock(page);
    await showExplorerRuntimeScreen(page, null);
    const centre = async (name) => {
      const box = await page.getByRole("application", { name }).boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, r: Math.min(box.width, box.height) / 2 };
    };
    const translation = await centre("Translation");
    const rotation = await centre("Rotation");
    const fingers = (reach) => [
      { id: 1, x: translation.x, y: translation.y - reach * translation.r },
      { id: 2, x: rotation.x + reach * rotation.r, y: rotation.y },
    ];
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      window.__bloomTeleopSent = [];
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(0) });
    for (let step = 1; step <= 8; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(step / 10) });
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(400);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    const sent = await page.evaluate(() => window.__bloomTeleopSent ?? []);
    const norm = (vector) => Math.hypot(vector?.x ?? 0, vector?.y ?? 0, vector?.z ?? 0);
    const together = sent.filter((message) => norm(message.linear) > 0.1 && norm(message.angular) > 0.1);
    const last = sent.at(-1);
    if (together.length === 0 || !last || norm(last.linear) + norm(last.angular) !== 0) {
      throw new Error(
        `Two fingers did not drive together: ${together.length} of ${sent.length} twists carried both, last ${JSON.stringify(last)}`,
      );
    }
  } finally {
    await page.close();
  }
}

async function captureRuntimeLocales(browser) {
  const locales = [
    { code: "en", settings: "Settings" },
    { code: "es", settings: "Ajustes" },
    { code: "fr", settings: "Réglages" },
  ];

  for (const locale of locales) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ...TABLET_EMULATION });
    await installConfigurationMocks(page, configurations);
    await installRuntimeWebSocketMock(page);
    await showExplorerRuntimeScreen(page, null);
    await holdForMaintenance(page);
    await page.locator(".runtime-maintenance-languages button").filter({ hasText: locale.code.toUpperCase() }).click();
    await page.getByRole("button", { exact: true, name: locale.settings }).click();
    await page.getByRole("region", { name: locale.settings }).waitFor();
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

/**
 * The first-entry practice offer on both tablet panels, in English and in the longer French, with and without
 * the manager's behaviour chip: the sentence is the first thing to give way, the buttons and ⋯ never move.
 */
async function capturePracticeOffer(browser) {
  for (const language of ["en", "fr"]) {
    for (const viewport of viewports.filter((candidate) => candidate.width <= 1280)) {
      for (const behaviour of [null, "shared_control"]) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          ...TABLET_EMULATION,
        });
        await installConfigurationMocks(page, configurations);
        await installRuntimeWebSocketMock(page);
        await showExplorerRuntimeScreen(page, null);
        // The language is switched from the sheet, as an operator would; opening it leaves the offer in place.
        if (language !== "en") {
          await holdForMaintenance(page);
          await page
            .locator(".runtime-maintenance-languages button")
            .filter({ hasText: language.toUpperCase() })
            .click();
          await page.locator(".runtime-maintenance-return").click();
          await page.getByRole("dialog").waitFor({ state: "detached" });
        }
        if (behaviour) {
          await pushCommandState(page, { [`${behaviour}:active`]: true });
          await page.locator(`.runtime-kiosk-behaviour[data-behaviour="${behaviour}"]`).waitFor();
        }
        const label = `practice-offer-${language}-${behaviour ? "assist-" : ""}${viewport.name}`;
        await assertNoHorizontalOverflow(page, label);
        await assertPracticeOfferFits(page, label, viewport.width > 1100 && behaviour === null, behaviour !== null);
        await page.screenshot({ fullPage: false, path: resolve(outputDir, `${label}.png`) });
        await page.close();
      }
    }
  }
}

/**
 * The offer sits inside the bar and clear of everything else in it, its two buttons take the bar's full 44 px
 * and at least 48 px of width, and the sentence shows on the wide panel and folds away on the narrow one. With a
 * chip in the bar the screen title, the word that says where the operator is, must still read whole.
 */
async function assertPracticeOfferFits(page, label, sentenceShown, titleWhole = false) {
  const result = await page.evaluate(() => {
    const bar = document.querySelector(".runtime-kiosk-bar");
    const offer = bar?.querySelector(".runtime-kiosk-tour-offer");
    if (!bar || !offer) return { missing: { bar: !bar, offer: !offer } };
    const box = (element) => element.getBoundingClientRect();
    const barBox = box(bar);
    // Bar controls take the bar's full 44 px, which its 1 px bottom border sits under: that border is the tolerance.
    const give = Number.parseFloat(getComputedStyle(bar).borderBottomWidth) || 1;
    const inside = (element) => {
      const rect = box(element);
      return (
        rect.left >= barBox.left - give &&
        rect.right <= barBox.right + give &&
        rect.top >= barBox.top - give &&
        rect.bottom <= barBox.bottom + give
      );
    };
    const offerBox = box(offer);
    const overlaps = [...bar.children]
      .filter((element) => element !== offer && !element.classList.contains("runtime-kiosk-spacer"))
      .map((element) => ({ className: element.className, rect: box(element) }))
      .filter(({ rect }) => rect.width > 0)
      .filter(({ rect }) => Math.min(offerBox.right, rect.right) - Math.max(offerBox.left, rect.left) > 0.5)
      .map(({ className }) => className);
    const outside = [
      ".runtime-kiosk-role",
      ".runtime-kiosk-maintenance",
      ".runtime-kiosk-tour-offer",
      ".runtime-kiosk-behaviour",
      ".runtime-kiosk-screen",
    ]
      .map((selector) => bar.querySelector(selector))
      .filter((element) => element && !inside(element))
      .map((element) => element.className);
    const sentence = offer.querySelector("p");
    const title = bar.querySelector(".runtime-kiosk-screen");
    return {
      titleClipped: Boolean(title) && title.scrollWidth > title.clientWidth,
      buttons: [...offer.querySelectorAll("button")].map((button) => ({
        height: box(button).height,
        name: button.getAttribute("aria-label") ?? button.textContent.trim(),
        width: box(button).width,
      })),
      outside,
      overlaps,
      sentenceVisible: Boolean(sentence) && getComputedStyle(sentence).display !== "none" && box(sentence).width > 0,
    };
  });
  const smallTargets = (result.buttons ?? []).filter((button) => button.height < 44 || button.width < 48);
  if (
    result.missing ||
    result.outside.length > 0 ||
    result.overlaps.length > 0 ||
    result.buttons.length !== 2 ||
    smallTargets.length > 0 ||
    (titleWhole && result.titleClipped) ||
    result.sentenceVisible !== sentenceShown
  ) {
    throw new Error(`${label}: the practice offer does not fit the bar: ${JSON.stringify(result)}`);
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
        if (element.closest(".sr-only")) return false;
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
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await openRuntimeApp(page, "Bloom Debug");
  await page.getByRole("heading", { name: "Bloom Debug" }).waitFor();
  await page.getByRole("button", { name: "Refresh topics" }).click();
  await page
    .getByLabel("Topic catalog")
    .getByText(/topics · \d+ to record/)
    .waitFor();
  await page
    .getByLabel("Robot preflight")
    .getByText(/of \d+ ready/)
    .waitFor();
  await page.getByRole("button", { name: "Refresh audit" }).click();
  await page.getByRole("article", { name: /Joint states/i }).waitFor();
  await page.getByRole("article", { name: /Jacobian/i }).waitFor();
}

async function capturePalettes(browser) {
  for (const palette of PALETTES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ...TABLET_EMULATION });
    await page.addInitScript(installTokenProbe);
    await installConfigurationMocks(page, withThemePreset(configurations, palette));
    await installRuntimeWebSocketMock(page);
    for (const route of PALETTE_ROUTES) {
      const label = `palette-${palette}:${route.name}`;
      await route.setup(page);
      await assertPaletteApplied(page, palette, label);
      await assertNoHorizontalOverflow(page, label);
      if (route.name === "explorer-drive" || route.name === "runtime") {
        await assertStopFollowsPalette(page, label);
        await assertUnavailableIsDashed(page, label);
        await assertFocusAndScanRings(page, label);
      }
      await page.screenshot({
        fullPage: false,
        path: resolve(outputDir, `palette-${palette}-tablet-720-${route.name}.png`),
      });
    }
    await page.close();
  }
}

async function assertPaletteApplied(page, palette, label) {
  const applied = await page.evaluate(() => document.documentElement.dataset.bloomTheme ?? "");
  if (applied !== palette) {
    throw new Error(`${label}: the page shows the "${applied}" palette`);
  }
}

/** Runs in the page: a token as the browser resolves it, so it compares with a computed colour. */
function installTokenProbe() {
  window.__bloomToken = (element, name) => {
    const probe = document.createElement("span");
    probe.style.color = getComputedStyle(element).getPropertyValue(name).trim();
    element.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  };
}

async function assertStopFollowsPalette(page, label) {
  const result = await page.evaluate(() => {
    const token = window.__bloomToken;
    const stop = document.querySelector(".runtime-stop-control");
    if (!stop) return { missing: true };
    return { actual: getComputedStyle(stop).backgroundColor, expected: token(stop, "--bloom-stop") };
  });
  if (result.missing || result.actual !== result.expected) {
    throw new Error(`${label}: STOP is not drawn in the stop token: ${JSON.stringify(result)}`);
  }
}

async function assertUnavailableIsDashed(page, label) {
  const cards = await page.evaluate(() => {
    const token = window.__bloomToken;
    return [...document.querySelectorAll('.widget-preview-card[data-runtime-unavailable="true"]')].map((card) => {
      const style = getComputedStyle(card);
      return {
        color: style.outlineColor,
        expected: token(card, "--bloom-unavailable-outline"),
        style: style.outlineStyle,
        width: style.outlineWidth,
      };
    });
  });
  const wrong = cards.filter((card) => card.style !== "dashed" || card.width !== "2px" || card.color !== card.expected);
  if (wrong.length > 0) {
    throw new Error(`${label}: unavailable cards lost their dashed outline: ${JSON.stringify(wrong)}`);
  }
}

async function assertFocusAndScanRings(page, label) {
  await page.keyboard.press("Shift");
  const rings = await page.evaluate(() => {
    const token = window.__bloomToken;
    const stop = document.querySelector(".runtime-stop-control");
    const target = document.querySelector(".widget-preview-card button, .widget-preview-card [role='slider']");
    if (!stop || !target) return { missing: { stop: !stop, target: !target } };
    stop.focus();
    const focus = getComputedStyle(stop);
    target.setAttribute("data-scan-lit", "");
    const scan = getComputedStyle(target);
    const result = {
      focusWidth: Number.parseFloat(focus.outlineWidth),
      scanColor: scan.outlineColor,
      scanExpected: token(target, "--bloom-primary"),
      scanWidth: Number.parseFloat(scan.outlineWidth),
    };
    target.removeAttribute("data-scan-lit");
    stop.blur();
    return result;
  });
  if (rings.missing) {
    throw new Error(`${label}: no STOP or scan target to check the rings on: ${JSON.stringify(rings.missing)}`);
  }
  if (rings.focusWidth < 3 || rings.scanWidth < 4 || rings.scanColor !== rings.scanExpected) {
    throw new Error(`${label}: focus or scan ring too faint: ${JSON.stringify(rings)}`);
  }
}

/** The builder canvas (design 7a) is a desktop surface: the panel on its desk, regions and minimum-size tags. */
async function captureBuilderCanvas(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await installConfigurationMocks(page, configurations);
  await installRuntimeWebSocketMock(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("button", { exact: true, name: "Apps" }).click();
  await page.getByRole("button", { name: "Open Explorer Manager app" }).click();
  await page.getByRole("button", { name: "Open Drive · Operator screen builder" }).click();
  await page.getByRole("heading", { level: 2, name: "Drive · Operator" }).waitFor();
  await page.locator(".builder-widget-list-items button", { hasText: "Gripper" }).click();
  await assertNoHorizontalOverflow(page, "desktop-1080:builder-canvas");
  await page.screenshot({ fullPage: false, path: resolve(outputDir, "desktop-1080-builder-canvas.png") });
  await page.close();
}

/** Where a slider card's knob rests and whether its content stays inside the card, in px from the card. */
async function measureSliderCard(card) {
  return card.evaluate((frame) => {
    const box = (element) => element?.getBoundingClientRect();
    const f = box(frame);
    const knob = box(frame.querySelector('[role="slider"]'));
    const track = box(frame.querySelector(".bloom-axis-track, .bloom-limit-track"));
    const content = box(frame.querySelector(".bloom-slider-widget"));
    return {
      contentBottom: content.bottom - f.top,
      frameHeight: f.height,
      knobX: knob.left + knob.width / 2 - f.left,
      knobY: knob.top + knob.height / 2 - f.top,
      trackX: track.left + track.width / 2 - f.left,
      trackY: track.top + track.height / 2 - f.top,
    };
  });
}

function assertSliderRestsCentred(label, before, after) {
  const off = (a, b) => Math.abs(a - b) > 1;
  if (off(after.knobX, after.trackX) || off(after.knobY, after.trackY)) {
    throw new Error(`${label}: the knob at rest is off the track centre (${JSON.stringify(after)}).`);
  }
  if (off(after.knobX, before.knobX) || off(after.knobY, before.knobY)) {
    throw new Error(`${label}: a long title or topic moved the knob (${JSON.stringify({ before, after })}).`);
  }
  if (after.contentBottom > after.frameHeight + 1 || after.frameHeight > before.frameHeight + 1) {
    throw new Error(
      `${label}: a long title or topic grew the card past its size (${JSON.stringify({ before, after })}).`,
    );
  }
}

/**
 * Robin, 2026-09-29: a slider given a long topic, and named after it, grew past its minimum and its knob left the
 * centre. Both directions and the limit slider, in the Builder canvas and at runtime, on both tablets.
 */
async function assertSliderKnobStaysCentred(browser) {
  for (const viewport of viewports.filter((entry) => entry.width <= 1280)) {
    const page = await browser.newPage({ viewport, ...TABLET_EMULATION });
    await installConfigurationMocks(page, configurations);
    await installRuntimeWebSocketMock(page);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Builder: Compose screens" }).click();
    await page.getByRole("button", { exact: true, name: "Apps" }).click();
    await page.getByRole("button", { name: "Open Explorer Manager app" }).click();
    await page.getByRole("button", { name: "Open Drive · Operator screen builder" }).click();
    await page.getByRole("heading", { level: 2, name: "Drive · Operator" }).waitFor();
    await page
      .getByRole("button", { name: /^Add Slider widget/ })
      .first()
      .click();
    const placed = page.locator(".builder-widget-frame.is-selected");
    await placed.waitFor();
    const placedId = await placed.getAttribute("data-widget-id");
    for (const id of ["drive-z", "drive-rz", placedId]) {
      const card = page.locator(`.builder-widget-frame[data-widget-id="${id}"]`);
      await card.locator(".builder-widget-selector").click();
      const before = await measureSliderCard(card);
      const title = page.locator(".builder-settings-editor input").first();
      await title.fill(LONG_TOPIC);
      await title.press("Tab");
      if (id === placedId) {
        const topic = page.getByLabel("Output topic");
        if (!(await topic.isVisible())) {
          await page.locator("details.builder-settings-advanced > summary").click();
        }
        await topic.fill(LONG_TOPIC);
        await topic.press("Tab");
      }
      await page.waitForTimeout(150);
      assertSliderRestsCentred(`${viewport.name}:builder:${id}`, before, await measureSliderCard(card));
    }
    await page.screenshot({ path: resolve(outputDir, `${viewport.name}-builder-slider-long-topic.png`) });
    await page.close();
  }

  const renamed = structuredClone(configurations);
  for (const screen of renamed["explorer-manager"].applications[0].screens) {
    for (const widget of screen.widgets) {
      if (widget.kind === "slider") {
        widget.title = LONG_TOPIC;
        widget.settings = { ...widget.settings, topic: LONG_TOPIC };
      }
    }
  }
  for (const viewport of viewports.filter((entry) => entry.width <= 1280)) {
    const measureRuntime = async (bundle, renamedTo) => {
      const page = await browser.newPage({ viewport, ...TABLET_EMULATION });
      await installConfigurationMocks(page, bundle);
      await installRuntimeWebSocketMock(page);
      await showExplorerRuntimeScreen(page, null);
      const found = {};
      for (const [id, direction] of [
        ["drive-z", "vertical"],
        ["drive-rz", "horizontal"],
      ]) {
        const surface = `.bloom-slider-widget[data-slider-kind="motion"][data-direction="${direction}"]`;
        found[id] = await measureSliderCard(
          page.locator(".widget-preview-card", { has: page.locator(surface) }).first(),
        );
      }
      if (renamedTo) {
        await page.screenshot({ path: resolve(outputDir, `${viewport.name}-runtime-slider-long-topic.png`) });
      }
      await page.close();
      return found;
    };
    const before = await measureRuntime(configurations, null);
    const after = await measureRuntime(renamed, LONG_TOPIC);
    for (const id of Object.keys(before)) {
      assertSliderRestsCentred(`${viewport.name}:runtime:${id}`, before[id], after[id]);
    }
  }
}

/** Bloom Debug is desktop-only (device-classes.md): authored at 1920×1080, checked at 1440×900. */
async function captureDesktopDebug(browser) {
  for (const viewport of [
    { name: "desktop-1080", width: 1920, height: 1080 },
    { name: "desktop-900", width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    await installConfigurationMocks(page, configurations);
    await installRuntimeWebSocketMock(page);
    await showDebugRuntime(page);
    const label = `${viewport.name}:debug-runtime`;
    await assertNoHorizontalOverflow(page, label);
    await assertRuntimeChromeCoversNothing(page, label);
    await assertNothingIsClipped(page, label);
    await page.screenshot({ fullPage: false, path: resolve(outputDir, `${viewport.name}-debug-runtime.png`) });
    await page.close();
  }
}

async function assertBrowserHistoryAffordance(page, label) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Builder: Compose screens" }).click();
  await page.getByRole("heading", { name: "Choose what to build." }).waitFor();

  await page.getByRole("button", { name: "Runtime: Operate and inspect" }).click();
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();

  await page.goBack({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Choose what to build." }).waitFor();
  await assertNoHorizontalOverflow(page, `${label}:browser-back`);

  await page.goForward({ waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "Runtime library" }).waitFor();
  await assertNoHorizontalOverflow(page, `${label}:browser-forward`);
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
