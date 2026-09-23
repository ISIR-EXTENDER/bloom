#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  INTERACTIVE_WIDGET_KINDS,
  PROFILE_TARGET_PX,
  primaryTargetFor,
  TOUCH_FLOOR_PX,
} from "../frontend/libs/widgets/src/min-size.ts";
import {
  assertNoHorizontalOverflow,
  installConfigurationMocks,
  installRuntimeWebSocketMock,
  launchBrowser,
  loadSeedConfigurations,
  startDashboardServer,
  TABLET_EMULATION,
} from "./lib/runtime-harness.mjs";

/** device-classes.md: each class authored at one panel, checked at the others. */
const VIEWPORTS = {
  tablet: [
    { name: "tablet-1280x720", width: 1280, height: 720 },
    { name: "tablet-1024x600", width: 1024, height: 600 },
    { name: "tablet-1820x720", width: 1820, height: 720 },
  ],
  desktop: [
    { name: "desktop-1920x1080", width: 1920, height: 1080 },
    { name: "desktop-1440x900", width: 1440, height: 900 },
  ],
};

/** The panel each class is checked at: the tightest one, where a density floor is hardest to hold. */
const TIGHTEST_VIEWPORT = { desktop: "desktop-1440x900", tablet: "tablet-1024x600" };

/** Only the 1920×1080 presets are desktop; `hd` and `wide-tablet` are tablet (builder-geometry.ts). */
const DESKTOP_PRESETS = new Set(["full-hd", "local-screen"]);

/**
 * Debt this sweep found and named rather than guessed a fix for. Each entry is one decision that has
 * to be taken before the screens can move; until then the sweep holds the line where it is. An entry
 * that stops matching anything is reported, so the list shrinks as the decisions land.
 */
const KNOWN_GAPS = [
  {
    apps: ["explorer-manager", "kinova-manager"],
    profiles: ["one-switch"],
    rules: ["touch-floor"],
    reason:
      "the scan profile puts a 100 px SWITCH strip inside the canvas shell, so the same artboard fits at 0.67 instead of 0.80 and every target drops under the floor at 1024x600. Scanning needs its own layout, or a strip that does not take canvas height.",
  },
  {
    apps: ["sandbox", "app-petanque-admin"],
    rules: ["touch-floor", "target-claim", "stop-covers"],
    reason:
      "these screens declare no reserved region, so the canvas carries the 44 px kiosk bar inside its own fit (0.75 at 1024x600, not 0.80) and STOP floats in the corner over whatever is under it. The one fix is to author them full-panel with a reserved STOP region, which is a layout decision per screen.",
  },
  {
    apps: ["app-petanque-admin"],
    rules: ["overlap", "artboard", "clipped-text"],
    reason:
      "rows too tight for the cards they hold: a card grows past its authored height (ADR 0132) into its neighbour or past the artboard. The rebase re-spaced the worst screens (the 74 px Z column, the overlapping plot, the widgets past 1280), and what remains needs re-spacing per screen, not a nudge; the app is off the lab operator path.",
  },
];

const outputDir = process.env.BLOOM_SCREEN_SWEEP_OUTPUT_DIR ?? resolve("/tmp", "bloom-screen-sweep");
const port = Number(process.env.BLOOM_SCREEN_SWEEP_PORT ?? "5180");
const workerCount = Number(process.env.BLOOM_SCREEN_SWEEP_WORKERS ?? "6");
const screenshotEveryVisit = process.env.BLOOM_SCREEN_SWEEP_SCREENSHOTS === "all";

const configurations = await loadSeedConfigurations();
const visits = planVisits(configurations);
await mkdir(outputDir, { recursive: true });

const server = startDashboardServer(port);
const startedAt = Date.now();
const failures = [];
const known = [];
const matchedGaps = new Set();

try {
  await server.ready();
  const browser = await launchBrowser();
  try {
    const queue = visits.slice();
    await Promise.all(
      Array.from({ length: Math.max(1, workerCount) }, async () => {
        for (let visit = queue.shift(); visit; visit = queue.shift()) {
          let problems;
          try {
            problems = await runVisit(browser, server.baseUrl, visit);
          } catch (error) {
            problems = [{ rule: "visit", detail: error.message }];
          }
          for (const problem of problems) {
            const gap = findKnownGap(visit, problem);
            if (gap) {
              matchedGaps.add(gap);
              known.push(`${visit.label}: [${problem.rule}] ${problem.detail}`);
            } else {
              failures.push(`${visit.label}: [${problem.rule}] ${problem.detail}`);
            }
          }
        }
      }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await server.stop();
}

report();

function report() {
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nBloom screen sweep: ${visits.length} screen visits at their maintained viewports in ${seconds}s.`);

  if (known.length > 0) {
    console.log(`\n${known.length} known gap(s), see KNOWN_GAPS in this script:`);
    for (const entry of known.slice(0, 12)) {
      console.log(`  ~ ${entry}`);
    }
    if (known.length > 12) {
      console.log(`  ~ …and ${known.length - 12} more`);
    }
  }

  const stale = KNOWN_GAPS.filter((gap) => !matchedGaps.has(gap));
  for (const gap of stale) {
    console.log(`\nKNOWN_GAPS entry for ${gap.apps.join(", ")} matched nothing; drop it: ${gap.reason}`);
  }

  if (failures.length === 0) {
    console.log(`\nNo new problem. Screenshots of anything flagged are in ${outputDir}.`);
    return;
  }

  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exitCode = 1;
}

function findKnownGap(visit, problem) {
  return KNOWN_GAPS.find(
    (gap) =>
      gap.apps.includes(visit.application.id) &&
      gap.rules.includes(problem.rule) &&
      (!gap.screens || gap.screens.includes(visit.screen.id)) &&
      (!gap.profiles || gap.profiles.includes(visit.role.profileId)),
  );
}

/**
 * Every screen of every shipped app, at the maintained viewports of its device class. A role that
 * only raises the density floor is sampled at the tightest panel of that class instead of all of
 * them: the wider panels would re-measure the same layout at a kinder scale.
 */
function planVisits(bundlesByConfigId) {
  const planned = [];
  for (const [configId, bundle] of Object.entries(bundlesByConfigId)) {
    for (const application of bundle.applications) {
      for (const role of resolveRoles(application)) {
        for (const screen of navigableScreens(application, role.profileId)) {
          const deviceClass = DESKTOP_PRESETS.has(screen.canvas.preset_id) ? "desktop" : "tablet";
          const viewports = role.layoutRole
            ? VIEWPORTS[deviceClass]
            : VIEWPORTS[deviceClass].filter((viewport) => viewport.name === TIGHTEST_VIEWPORT[deviceClass]);
          for (const viewport of viewports) {
            planned.push({
              application,
              configId,
              deviceClass,
              label: `${application.id}/${role.profileId || "default"}/${screen.id}@${viewport.name}`,
              role,
              screen,
              viewport,
            });
          }
        }
      }
    }
  }
  return planned;
}

/**
 * One entry per profile, plus the runtime default for an app that declares none. A profile whose
 * layout another profile already opens carries density only, so it is not a layout role.
 */
function resolveRoles(application) {
  if (application.profiles.length === 0) {
    return [{ displayPreset: "default", layoutRole: true, motorPreset: "default", profileId: "" }];
  }
  const seenLayouts = new Set();
  return application.profiles.map((profile) => {
    const layoutRole = !seenLayouts.has(profile.preferred_control_layout_id);
    seenLayouts.add(profile.preferred_control_layout_id);
    return {
      displayPreset: profile.display_preset,
      layoutRole,
      motorPreset: profile.motor_accessibility_preset,
      profileId: profile.id,
    };
  });
}

/** resolveNavigableScreens: another role's layout is reached by switching role, not by navigating. */
function navigableScreens(application, profileId) {
  const layoutIds = new Set(application.profiles.map((profile) => profile.preferred_control_layout_id));
  const activeLayoutId =
    application.profiles.find((profile) => profile.id === profileId)?.preferred_control_layout_id ?? "";
  const active = application.screens.find((screen) => screen.id === activeLayoutId) ?? application.screens[0];
  return application.screens.filter((screen) => screen.id === active?.id || !layoutIds.has(screen.id));
}

/** Seeding both stores and opening `#/runtime/app` lands on one screen as one role, without the library. */
async function runVisit(browser, baseUrl, visit) {
  const context = await browser.newContext({
    viewport: { width: visit.viewport.width, height: visit.viewport.height },
    ...(visit.deviceClass === "tablet" ? TABLET_EMULATION : {}),
  });
  try {
    const selection = { appId: visit.application.id, configId: visit.configId, screenId: visit.screen.id };
    const preferences = visit.role.profileId
      ? { profilePreferences: { [`${visit.configId}:${visit.application.id}`]: visit.role.profileId } }
      : {};
    await context.addInitScript(
      ([storedSelection, storedPreferences]) => {
        window.sessionStorage.setItem("bloom.runtime-session-selection.v1", JSON.stringify(storedSelection));
        window.localStorage.setItem("bloom.runtime-user-preferences.v1", JSON.stringify(storedPreferences));
      },
      [selection, preferences],
    );
    await installRuntimeWebSocketMock(context);
    await installConfigurationMocks(context, configurations);
    // Camera widgets point at a robot that is not on this bench; an unanswered stream would hang the load.
    await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());

    const page = await context.newPage();
    await page.goto(`${baseUrl}/#/runtime/app`, { waitUntil: "domcontentloaded" });
    await page.locator(`.runtime-app-artboard[data-screen-id="${visit.screen.id}"]`).waitFor({ timeout: 20_000 });
    await page.locator(".widget-preview-card").first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(150);

    const measured = await measureScreen(page, visit.screen.id);
    const rendered = checkRendered(visit, measured);
    if (rendered.length > 0) {
      return rendered;
    }

    // Every rule runs: one visit reports everything wrong with the screen, not the first thing.
    const problems = [
      ...(await checkNoHorizontalOverflow(page, visit)),
      ...checkInsideArtboard(visit, measured),
      ...checkNothingOverlaps(visit, measured),
      ...checkTextNotClipped(measured),
      ...checkStopIsPresentAndOnTop(visit, measured),
      ...checkTargetsMeetTheFloor(visit, measured),
    ];

    if (screenshotEveryVisit || problems.length > 0) {
      await page.screenshot({ path: resolve(outputDir, `${visit.label.replace(/[/@]/g, "-")}.png`) });
    }
    return problems;
  } finally {
    await context.close();
  }
}

/** One pass over the rendered screen; every rule below reads this, so a visit costs one round trip. */
function measureScreen(page, screenId) {
  return page.evaluate((expectedScreenId) => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top };
    };
    const artboard = document.querySelector(`.runtime-app-artboard[data-screen-id="${expectedScreenId}"]`);
    const stop = document.querySelector(".runtime-stop-control");
    const bar = document.querySelector(".runtime-kiosk-bar");
    const cards = [...document.querySelectorAll(".widget-preview-card")].map((card) => ({
      box: box(card),
      kind: card.getAttribute("data-widget-kind") ?? "",
      label: card.getAttribute("aria-label") ?? "widget",
    }));

    const clipped = [...document.querySelectorAll(".widget-preview-card *, .runtime-kiosk-bar *")]
      .filter((element) => {
        if (element.closest(".sr-only") || element.children.length > 0) return false;
        if ((element.textContent ?? "").trim() === "") return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (style.overflowX === "auto" || style.overflowX === "scroll") return false;
        // A nowrap line with an ellipsis is an authored truncation that shows itself. What is left is
        // text cut with no sign it was cut, which an operator reads as the whole value.
        if (style.whiteSpace === "nowrap" && style.textOverflow === "ellipsis") return false;
        return element.scrollWidth - element.clientWidth > 2;
      })
      .slice(0, 6)
      .map((element) => ({
        clientWidth: element.clientWidth,
        owner: element.closest(".widget-preview-card")?.getAttribute("aria-label") ?? "kiosk bar",
        scrollWidth: element.scrollWidth,
        text: (element.textContent ?? "").trim().slice(0, 40),
      }));

    let stopOnTop = null;
    if (stop) {
      const rect = stop.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      stopOnTop = hit !== null && (hit === stop || stop.contains(hit));
    }

    return {
      artboard: artboard ? box(artboard) : null,
      bar: bar ? box(bar) : null,
      cards,
      clipped,
      // The artboard is the authored size under `transform: scale()`, so this is the scale it reached the glass at.
      scale: artboard ? artboard.getBoundingClientRect().height / artboard.offsetHeight : 0,
      screenId: artboard?.getAttribute("data-screen-id") ?? "",
      stop: stop ? { box: box(stop), placement: stop.getAttribute("data-placement") ?? "" } : null,
      stopOnTop,
    };
  }, screenId);
}

function checkRendered(visit, measured) {
  if (measured.screenId !== visit.screen.id) {
    return [{ detail: `rendered ${measured.screenId || "no screen"} instead of ${visit.screen.id}`, rule: "render" }];
  }
  if (measured.cards.length !== visit.screen.widgets.length) {
    return [
      {
        detail: `rendered ${measured.cards.length} widget cards, the screen authors ${visit.screen.widgets.length}`,
        rule: "render",
      },
    ];
  }
  return [];
}

async function checkNoHorizontalOverflow(page, visit) {
  try {
    await assertNoHorizontalOverflow(page, visit.label);
  } catch (error) {
    return [{ detail: error.message, rule: "page-scroll" }];
  }
  return [];
}

/** The artboard clips, so a card outside it loses its reading with nothing on screen to say so. */
function checkInsideArtboard(visit, measured) {
  const bounds = measured.artboard;
  return cardsWithIds(visit, measured)
    .filter(
      ({ box }) =>
        box.left < bounds.left - 1 ||
        box.top < bounds.top - 1 ||
        box.right > bounds.right + 1 ||
        box.bottom > bounds.bottom + 1,
    )
    .map(({ box, id }) => ({
      detail: `${id} reaches ${Math.round(box.right)},${Math.round(box.bottom)} of the ${Math.round(bounds.right)},${Math.round(bounds.bottom)} artboard`,
      rule: "artboard",
    }));
}

/** Widget cards render in the screen's authoring order, so the seed ids name what the DOM measured. */
function cardsWithIds(visit, measured) {
  return measured.cards.map((card, index) => ({ ...card, id: visit.screen.widgets[index]?.id ?? card.label }));
}

function checkNothingOverlaps(visit, measured) {
  const cards = cardsWithIds(visit, measured);
  const problems = [];
  for (const [index, left] of cards.entries()) {
    for (const right of cards.slice(index + 1)) {
      const area = intersect(left.box, right.box);
      if (area && (INTERACTIVE_WIDGET_KINDS.has(left.kind) || INTERACTIVE_WIDGET_KINDS.has(right.kind))) {
        problems.push({ detail: `${left.id} over ${right.id} (${area.width}×${area.height})`, rule: "overlap" });
      }
    }
  }
  for (const chrome of [
    { box: measured.stop?.box, name: "STOP", rule: "stop-covers" },
    { box: measured.bar, name: "the kiosk bar", rule: "bar-covers" },
  ]) {
    if (!chrome.box) {
      continue;
    }
    for (const card of cards) {
      const area = intersect(chrome.box, card.box);
      if (area) {
        problems.push({ detail: `${chrome.name} over ${card.id} (${area.width}×${area.height})`, rule: chrome.rule });
      }
    }
  }
  return problems;
}

function intersect(left, right) {
  const width = Math.min(left.right, right.right) - Math.max(left.left, right.left);
  const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
  return width > 2 && height > 2 ? { height: Math.round(height), width: Math.round(width) } : null;
}

/**
 * Width only. A line box is a couple of pixels taller wherever the runtime font is not installed,
 * which is every CI runner, and failing on that says "clipped" about a missing font.
 */
function checkTextNotClipped(measured) {
  return measured.clipped.map((entry) => ({
    detail: `${entry.owner} "${entry.text}" needs ${entry.scrollWidth} px in ${entry.clientWidth}`,
    rule: "clipped-text",
  }));
}

function checkStopIsPresentAndOnTop(visit, measured) {
  if (!screenCanCommandAnArm(visit)) {
    return [];
  }
  if (!measured.stop) {
    return [{ detail: "no STOP on a screen that can command an arm", rule: "stop-missing" }];
  }
  const problems = [];
  if (measured.stop.box.width < 1 || measured.stop.box.height < 1) {
    problems.push({
      detail: `STOP renders ${measured.stop.box.width}×${measured.stop.box.height}`,
      rule: "stop-missing",
    });
  }
  if (measured.stopOnTop !== true) {
    problems.push({ detail: "STOP is covered at its centre", rule: "stop-buried" });
  }
  const reserved = (visit.screen.reserved_regions ?? []).some(
    (region) => region.id === "stop" && region.owner === "runtime-chrome",
  );
  if (reserved && measured.stop.placement !== "region") {
    problems.push({
      detail: `STOP ignores its reserved region and sits in the ${measured.stop.placement}`,
      rule: "stop-buried",
    });
  }
  return problems;
}

function screenCanCommandAnArm(visit) {
  const policy = visit.application.runtime_policy;
  const commands =
    (policy.allowed_publish_topics ?? []).length > 0 ||
    (policy.allowed_service_calls ?? []).length > 0 ||
    (policy.allowed_teleop_targets ?? []).length > 0;
  return commands && visit.screen.widgets.some((widget) => INTERACTIVE_WIDGET_KINDS.has(widget.kind));
}

/**
 * Two readings of one promise. The canvas target is what the role's tagline claims; the glass target
 * is what the hand actually meets once the canvas is fit to this panel.
 */
function checkTargetsMeetTheFloor(visit, measured) {
  const claimed = PROFILE_TARGET_PX[visit.role.displayPreset] ?? PROFILE_TARGET_PX.default;
  const problems = [];

  for (const widget of visit.screen.widgets) {
    if (!INTERACTIVE_WIDGET_KINDS.has(widget.kind)) {
      continue;
    }
    const target = primaryTargetFor(widget.kind, widget.settings, widget.layout);
    if (target === null) {
      continue;
    }
    if (target < claimed) {
      problems.push({
        detail: `${widget.id} offers ${target} canvas px, the ${visit.role.displayPreset} role claims ${claimed}`,
        rule: "target-claim",
      });
    }
    // Floored, so a 43.5 px target reads 43 and fails the floor instead of rounding up to pass.
    const glass = Math.floor(target * measured.scale + 1e-9);
    if (glass < TOUCH_FLOOR_PX) {
      problems.push({
        detail: `${widget.id} is ${glass} px of glass, the floor is ${TOUCH_FLOOR_PX}`,
        rule: "touch-floor",
      });
    }
  }

  return problems;
}
