import type {
  ApplicationConfig,
  CanvasPresetId,
  ConfigurationBundle,
  ReservedRegion,
  ScreenConfig,
  WidgetConfig,
} from "@bloom/api-client";
import { DEFAULT_WIDGET_DEFINITIONS, INTERACTIVE_WIDGET_KINDS, minSizeFor } from "@bloom/widgets";
import { describe, expect, it } from "vitest";

import bloomDebugConfiguration from "../../../../../backend/seed/applications/bloom-debug.json";
import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import kinovaManagerConfiguration from "../../../../../backend/seed/applications/kinova-manager.json";
import {
  defaultStopRegion,
  explainLayoutRefusal,
  findUndersizedWidgets,
  glassPx,
  overlapsRegion,
  placeClearOfRegions,
  placeClearOfWidgets,
  resolveBuilderPanel,
  resolveDeviceClass,
  resolveNewScreenCanvas,
  resolvePrimaryTarget,
  reviewScreens,
  switchScreenDevice,
  TOUCH_FLOOR_PX,
} from "./builder-geometry";

const explorer = (structuredClone(explorerManagerConfiguration) as unknown as ConfigurationBundle)
  .applications[0] as ApplicationConfig;
const screenById = (id: string) => explorer.screens.find((screen) => screen.id === id) as ScreenConfig;

describe("builder geometry", () => {
  it("reaches the glass at the tablet class's smallest panel", () => {
    const operator = screenById("manager_drive_operator");
    const panel = resolveBuilderPanel(operator);

    expect(panel.artboard).toEqual({ width: 1280, height: 676 });
    expect(panel.deviceClass).toBe("tablet");
    expect(panel.glassScale).toBeCloseTo(0.8);
    const gripper = operator.widgets.find((widget) => widget.id === "drive-gripper");
    if (!gripper) throw new Error("Missing gripper.");
    expect(glassPx(gripper, panel.glassScale)).toBe(44);
  });

  it("gives the bench speed limits a thumb that survives the tablet fit scale", () => {
    const bench = screenById("manager_drive_bench");
    const panel = resolveBuilderPanel(bench);
    const limits = bench.widgets.filter(
      (widget) => widget.kind === "slider" && widget.settings.variant !== "segments" && !widget.settings.returnToCenter,
    );

    // Snake gain is a parameter slider (ADR 0139): same thumb, same floor, no topic.
    expect(limits.map((widget) => widget.title)).toEqual(["Max linear speed", "Max angular speed", "Snake gain"]);
    for (const limit of limits) {
      expect(resolvePrimaryTarget(limit)).toBe(56);
      expect(glassPx(limit, panel.glassScale)).toBe(TOUCH_FLOOR_PX);
    }
  });

  it("floors glass px so a target just under the touch floor fails it", () => {
    const button = {
      id: "b",
      kind: "command-button" as const,
      layout: { x: 0, y: 0, width: 200, height: 120 },
      settings: {},
      title: "B",
    };
    expect(glassPx(button, 43.5 / 56)).toBe(43);
    expect(glassPx(button, 0.8)).toBe(44);
  });

  it("flags the shipped undersized gripper and nothing on the corrected seed", () => {
    const operator = screenById("manager_drive_operator");
    expect(findUndersizedWidgets(operator)).toEqual([]);

    const shrunk = {
      ...operator,
      widgets: operator.widgets.map((widget) =>
        widget.id === "drive-gripper" ? { ...widget, layout: { ...widget.layout, height: 96 } } : widget,
      ),
    };
    expect(findUndersizedWidgets(shrunk).map(({ shortfall, widget }) => [widget.id, shortfall.minimum])).toEqual([
      ["drive-gripper", [200, 120]],
    ]);
  });

  it("classifies every 720-tall preset as tablet, including the lab's wide display", () => {
    const classOf = (preset_id: CanvasPresetId) => resolveDeviceClass({ canvas: { preset_id, runtime_mode: "fit" } });

    const presets: CanvasPresetId[] = ["hd", "native-1280x720", "wide-tablet", "tablet", "full-hd", "local-screen"];

    expect(presets.map(classOf)).toEqual(["tablet", "tablet", "tablet", "tablet", "desktop", "desktop"]);
  });

  it("starts a new screen on the tablet 1280×720 panel unless the app is a desktop one", () => {
    const desktop: ScreenConfig = { ...explorer.screens[0], canvas: { preset_id: "full-hd", runtime_mode: "center" } };
    const legacyTablet: ScreenConfig = { ...explorer.screens[0], canvas: { preset_id: "tablet", runtime_mode: "fit" } };
    const tablet = { preset_id: "native-1280x720", runtime_mode: "fit" };

    expect(resolveNewScreenCanvas({ screens: [] })).toEqual(tablet);
    expect(resolveNewScreenCanvas({ screens: [legacyTablet] })).toEqual(tablet);
    expect(resolveNewScreenCanvas({ screens: [desktop] })).toEqual({ preset_id: "full-hd", runtime_mode: "center" });
  });

  it("refuses a drop into a reserved region and places new widgets clear of it", () => {
    const bench = screenById("manager_drive_bench");
    const start = { x: 590, y: 14, width: 300, height: 120 };
    const intoStop = { x: 940, y: 420, width: 300, height: 120 };

    expect(overlapsRegion(intoStop, bench.reserved_regions)?.id).toBe("stop");
    // The canvas and the inspector both ask this, and it says why rather than just refusing.
    expect(explainLayoutRefusal(intoStop, bench)).toContain("STOP");
    expect(explainLayoutRefusal(start, bench)).toBeNull();
    expect(overlapsRegion(placeClearOfRegions(intoStop, bench) ?? intoStop, bench.reserved_regions)).toBeNull();
  });

  it("places a widget above a region that fills the canvas below it, and refuses when nothing fits", () => {
    const bench = screenById("manager_drive_bench");
    const floor: ReservedRegion = { id: "floor", owner: "runtime-chrome", x: 0, y: 300, width: 1280, height: 376 };
    const tall = { x: 928, y: 500, width: 300, height: 120 };

    const placed = placeClearOfRegions(tall, { ...bench, reserved_regions: [floor] });
    expect(placed).toEqual({ x: 0, y: 20, width: 300, height: 120 });
    expect(placeClearOfRegions(tall, { ...bench, reserved_regions: [{ ...floor, y: 0, height: 676 }] })).toBeNull();
    expect(placeClearOfRegions({ ...tall, width: 1400 }, { ...bench, reserved_regions: [] })).toBeNull();
  });

  it("names which of a pad row's three agreements broke, and stays quiet on one pad", () => {
    const bench = screenById("manager_drive_bench");
    const padRule = (screen: ScreenConfig) =>
      reviewScreens({ ...explorer, screens: [screen] }).find((rule) => rule.id === "pads");
    const editRotation = (change: (widget: WidgetConfig) => WidgetConfig) => ({
      ...bench,
      widgets: bench.widgets.map((widget) => (widget.id === "drive-rotation" ? change(widget) : widget)),
    });

    expect(padRule(bench)).toMatchObject({ passed: true });
    expect(
      padRule({ ...bench, widgets: bench.widgets.filter((widget) => widget.id !== "drive-rotation") }),
    ).toMatchObject({ passed: true });

    // The card, the square the renderer draws inside it, and the centre line, in that order.
    expect(padRule(editRotation((widget) => ({ ...widget, layout: { ...widget.layout, width: 380 } })))?.detail).toBe(
      "Rotation on Drive · Bench is a different card size from the first pad.",
    );
    expect(
      padRule(editRotation((widget) => ({ ...widget, settings: { ...widget.settings, show_details: true } })))?.detail,
    ).toBe("Rotation on Drive · Bench yields a different pad square from the first pad.");
    expect(padRule(editRotation((widget) => ({ ...widget, layout: { ...widget.layout, y: 158 } })))?.detail).toBe(
      "Rotation on Drive · Bench sits on a different centre line from the first pad.",
    );
  });

  it("refuses a desktop-only kind on a tablet screen", () => {
    const tabletScreen = explorer.screens.find((screen) => screen.id === "manager_drive_operator");
    if (!tabletScreen) throw new Error("no operator screen");
    const withView: ApplicationConfig = {
      ...explorer,
      screens: explorer.screens.map((screen) =>
        screen.id === tabletScreen.id
          ? {
              ...screen,
              widgets: [
                ...screen.widgets,
                {
                  id: "view",
                  kind: "robot-3d",
                  title: "Robot",
                  layout: { x: 14, y: 570, width: 546, height: 420 },
                  settings: { jointStateTopic: "/joint_states", showAxes: true },
                },
              ],
            }
          : screen,
      ),
    };
    const rule = reviewScreens(withView).find((candidate) => candidate.id === "device-class");
    expect(rule?.passed).toBe(false);
    expect(rule?.detail).toBe("Robot on Drive · Operator runs on desktop screens only.");
  });

  it("passes the review rules on the manager seed and names the first failure", () => {
    expect(reviewScreens(explorer).filter((rule) => !rule.passed)).toEqual([]);

    const broken: ApplicationConfig = {
      ...explorer,
      profiles: explorer.profiles.map((profile) =>
        profile.id === "bench" ? { ...profile, preferred_control_layout_id: "manager_drive_gone" } : profile,
      ),
      screens: explorer.screens.map((screen) =>
        screen.id === "manager_drive_bench"
          ? {
              ...screen,
              widgets: screen.widgets.map((widget) =>
                widget.id === "drive-rotation" ? { ...widget, layout: { ...widget.layout, height: 360 } } : widget,
              ),
            }
          : screen,
      ),
    };
    const failed = Object.fromEntries(
      reviewScreens(broken)
        .filter((rule) => !rule.passed)
        .map((rule) => [rule.id, rule.detail]),
    );

    expect(Object.keys(failed).sort()).toEqual(["pads", "profiles", "symmetry"]);
    expect(failed.profiles).toBe("Bench names manager_drive_gone, which is not a screen.");
  });

  it("compares a paired desktop app's policy, and stays inert without one", () => {
    expect(reviewScreens(explorer).find((rule) => rule.id === "pairs")?.detail).toBe(
      "No paired desktop app yet; the check starts when one is added.",
    );
    const desktop = {
      ...explorer,
      id: "explorer-manager-desktop",
      name: "Explorer Manager desktop",
      runtime_policy: { ...explorer.runtime_policy, allowed_publish_topics: ["/elsewhere"] },
    };
    const pairs = reviewScreens(explorer, [desktop]).find((rule) => rule.id === "pairs");
    expect(pairs).toMatchObject({ passed: false, detail: "Explorer Manager desktop differs in publish topics." });
  });
});

describe("shipped design screens", () => {
  it("keep every control on the touch floor of the class's smallest panel", () => {
    const belowFloor = [explorerManagerConfiguration, kinovaManagerConfiguration, bloomDebugConfiguration].flatMap(
      (bundle) =>
        (bundle as unknown as ConfigurationBundle).applications.flatMap((application) =>
          application.screens.flatMap((screen) => {
            const { glassScale } = resolveBuilderPanel(screen);
            return screen.widgets
              .filter((widget) => INTERACTIVE_WIDGET_KINDS.has(widget.kind))
              .filter((widget) => glassPx(widget, glassScale) < TOUCH_FLOOR_PX)
              .map((widget) => `${application.id}/${screen.id}/${widget.id}`);
          }),
        ),
    );

    expect(belowFloor).toEqual([]);
  });

  it("keep every widget at or above its kind's minimum", () => {
    const undersized = [explorerManagerConfiguration, kinovaManagerConfiguration, bloomDebugConfiguration].flatMap(
      (bundle) =>
        (bundle as unknown as ConfigurationBundle).applications.flatMap((application) =>
          application.screens.flatMap((screen) =>
            findUndersizedWidgets(screen).map(({ widget }) => `${application.id}/${screen.id}/${widget.id}`),
          ),
        ),
    );

    expect(undersized).toEqual([]);
  });
});

describe("where a new widget lands", () => {
  /**
   * The builder-e2e harness clicked five palette entries the way an author would and got a heap in
   * the corner: placement stepped 24 px per widget, which for a 280 px joystick overlaps almost
   * completely.
   */
  it("keeps a widget added from the palette clear of the ones already there", () => {
    const roomy: ScreenConfig = {
      ...screenById("manager_drive_bench"),
      reserved_regions: [],
      widgets: [
        {
          ...(screenById("manager_drive_bench").widgets[0] as ScreenConfig["widgets"][number]),
          layout: { x: 32, y: 32, width: 300, height: 300 },
        },
      ],
    };
    const placed = placeClearOfWidgets({ x: 32, y: 32, width: 280, height: 332 }, roomy);
    if (!placed) throw new Error("nothing was placed");

    for (const widget of roomy.widgets) {
      const overlaps =
        placed.x < widget.layout.x + widget.layout.width &&
        widget.layout.x < placed.x + placed.width &&
        placed.y < widget.layout.y + widget.layout.height &&
        widget.layout.y < placed.y + placed.height;
      expect(overlaps, `${widget.id} at ${widget.layout.x},${widget.layout.y}`).toBe(false);
    }
  });

  it("still places on a full canvas rather than refusing to add anything", () => {
    // Refusing because the screen is busy would be worse than an overlap the author can drag apart.
    const full: ScreenConfig = {
      ...screenById("manager_drive_bench"),
      reserved_regions: [],
      widgets: [
        {
          ...(screenById("manager_drive_bench").widgets[0] as ScreenConfig["widgets"][number]),
          layout: { x: 0, y: 0, width: 1280, height: 676 },
        },
      ],
    };

    expect(placeClearOfWidgets({ x: 0, y: 0, width: 280, height: 332 }, full)).not.toBeNull();
  });
});

describe("what the resize handle allows", () => {
  /**
   * Robin, 2026-09-23: "erreur de taille minimale 632x288 (c'est très grand)". The numbers read as
   * absurd because the handle and the inspector consulted different tables: a joystick could be
   * dragged to 160x160 and the inspector would then ask for 280x332.
   */
  it("offers a new widget at a size its own contract accepts", () => {
    // Placing one already too small is the same contradiction seen from the other end.
    for (const definition of DEFAULT_WIDGET_DEFINITIONS) {
      const contract = minSizeFor(definition.kind, definition.defaultSettings);
      if (!contract) continue;
      expect(definition.defaultLayout.width, definition.kind).toBeGreaterThanOrEqual(contract[0]);
      expect(definition.defaultLayout.height, definition.kind).toBeGreaterThanOrEqual(contract[1]);
    }
  });
});

describe("switching a screen between tablet and desktop", () => {
  const widget = (id: string, x: number, y: number, width: number, height: number): WidgetConfig =>
    ({ id, kind: "label", title: id, layout: { x, y, width, height }, settings: {} }) as WidgetConfig;
  const desktopScreen = (widgets: WidgetConfig[], stop: ReservedRegion): ScreenConfig => ({
    id: "s",
    title: "S",
    canvas: { preset_id: "full-hd", runtime_mode: "fit" },
    reserved_regions: [stop],
    widgets,
  });

  it("scales every widget by one factor, so the composition holds", () => {
    const stop = defaultStopRegion({ preset_id: "full-hd", runtime_mode: "fit" });
    const result = switchScreenDevice(desktopScreen([widget("a", 30, 60, 600, 300)], stop), "tablet");

    expect(result.refusal).toBeUndefined();
    expect(result.screen?.canvas.preset_id).toBe("native-1280x720");
    expect(result.screen?.widgets[0]?.layout).toEqual({ x: 20, y: 40, width: 400, height: 200 });
  });

  it("never leaves STOP smaller than the new canvas's own, and keeps its corner", () => {
    const stop = defaultStopRegion({ preset_id: "full-hd", runtime_mode: "fit" });
    const tabletStop = defaultStopRegion({ preset_id: "native-1280x720", runtime_mode: "fit" });
    const moved = switchScreenDevice(desktopScreen([], stop), "tablet").screen?.reserved_regions?.[0];

    expect(moved?.width).toBeGreaterThanOrEqual(tabletStop.width);
    expect(moved?.height).toBeGreaterThanOrEqual(tabletStop.height);
    expect(moved && moved.x + moved.width).toBeLessThanOrEqual(1280);
    expect(moved && moved.y + moved.height).toBeLessThanOrEqual(720);
  });

  it("refuses rather than put STOP over a control", () => {
    const stop = defaultStopRegion({ preset_id: "full-hd", runtime_mode: "fit" });
    // Flush against STOP's left edge: once STOP grows to the tablet floor it would cover this.
    const neighbour = widget("gripper", stop.x - 200, stop.y, 196, stop.height);
    const result = switchScreenDevice(desktopScreen([neighbour], stop), "tablet");

    expect(result.screen).toBeUndefined();
    expect(result.refusal).toMatch(/STOP would cover gripper/);
  });

  it("goes back up to desktop without shrinking anything", () => {
    const stop = defaultStopRegion({ preset_id: "native-1280x720", runtime_mode: "fit" });
    const tablet: ScreenConfig = {
      id: "t",
      title: "T",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      reserved_regions: [stop],
      widgets: [widget("a", 20, 40, 400, 200)],
    };
    const result = switchScreenDevice(tablet, "desktop");

    expect(result.screen?.canvas.preset_id).toBe("full-hd");
    expect(result.screen?.widgets[0]?.layout).toEqual({ x: 30, y: 60, width: 600, height: 300 });
  });
});

describe("placing on a busy screen", () => {
  const tablet = { preset_id: "native-1280x720", runtime_mode: "fit" } as ScreenConfig["canvas"];
  const block = (id: string, x: number, width: number): WidgetConfig =>
    ({ id, kind: "label", title: id, layout: { x, y: 0, width, height: 676 }, settings: {} }) as WidgetConfig;

  it("tries the kind's minimum size before landing on another widget", () => {
    // 300 px free on the right: a 340 px slider does not fit, its 260 px minimum does.
    const busy: ScreenConfig = {
      id: "b",
      title: "B",
      canvas: tablet,
      reserved_regions: [],
      widgets: [block("a", 0, 980)],
    };
    const placed = placeClearOfWidgets({ x: 0, y: 0, width: 340, height: 132 }, busy, [260, 104]);

    expect(placed).toMatchObject({ width: 260, height: 104 });
    expect(placed && placed.x >= 980).toBe(true);
  });

  it("fails the review while one widget sits on another", () => {
    const application = {
      ...explorer,
      screens: [
        {
          id: "b",
          title: "Busy",
          canvas: tablet,
          reserved_regions: [],
          widgets: [block("a", 0, 600), block("b", 300, 600)],
        },
      ],
    } as ApplicationConfig;

    const rule = reviewScreens(application).find((candidate) => candidate.id === "overlap");
    expect(rule?.passed).toBe(false);
    expect(rule?.detail).toMatch(/b covers a on Busy/);
  });
});
