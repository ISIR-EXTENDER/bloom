import type { ApplicationConfig, ConfigurationBundle, ReservedRegion, ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import bloomDebugConfiguration from "../../../../../backend/seed/applications/bloom-debug.json";
import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import kinovaManagerConfiguration from "../../../../../backend/seed/applications/kinova-manager.json";
import {
  findUndersizedWidgets,
  glassPx,
  overlapsRegion,
  placeClearOfRegions,
  refuseReservedRegion,
  resolveBuilderPanel,
  resolveNewScreenCanvas,
  resolvePrimaryTarget,
  reviewScreens,
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

    expect(limits.map((widget) => widget.title)).toEqual(["Max linear speed", "Max angular speed"]);
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
    expect(refuseReservedRegion(intoStop, start, bench.reserved_regions)).toBe(start);
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
