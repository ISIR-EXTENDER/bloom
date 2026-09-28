import type { ApplicationConfig } from "@bloom/api-client";
import { minSizeFor, normalizeWidgetSettings } from "@bloom/widgets";
import { describe, expect, it } from "vitest";

import {
  CREATE_THEME_PRESETS,
  createApplicationFromPlaygroundScreen,
  createGuidedApplication,
  createStarterScreen,
  type StarterScreenId,
} from "./builder-starters";

const STARTERS: StarterScreenId[] = ["blank", "operator-control", "debug-monitor"];

/**
 * A starter screen is what someone authoring without help begins from, so it has to be true.
 */
describe("the starter screens", () => {
  it.each(STARTERS)("reserves STOP's box on %s", (starterId) => {
    const screen = createStarterScreen(starterId, false);

    expect(screen.reserved_regions?.some((region) => region.id === "stop")).toBe(true);
  });

  it("publishes where the operator starter says it does", () => {
    const screen = createStarterScreen("operator-control", false);
    const joystick = screen.widgets.find((widget) => widget.kind === "joystick");
    const normalized = normalizeWidgetSettings("joystick", joystick?.settings ?? {});

    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    const binding = normalized.settings.runtime_binding as { value_mapping?: { target_topic?: string } };
    // Written in camelCase these keys were dropped, and the starter published somewhere it never named.
    expect(binding.value_mapping?.target_topic).toBe("/joystick_cartesian_command");
    expect(Object.keys(joystick?.settings ?? {})).not.toContain("runtimeBinding");
  });
});

describe("what a starter screen greets an author with", () => {
  /**
   * The builder-e2e harness found this on its first real run: creating a guided app and opening it
   * showed "2 widgets below their minimum" before the author had touched anything.
   */
  it("places nothing below its own contract", () => {
    const below: string[] = [];
    for (const starterId of ["blank", "operator-control", "debug-monitor"] as const) {
      for (const widget of createStarterScreen(starterId, true).widgets) {
        const minimum = minSizeFor(widget.kind, widget.settings);
        if (!minimum) continue;
        if (widget.layout.width < minimum[0] || widget.layout.height < minimum[1]) {
          below.push(
            `${starterId}/${widget.id} ${widget.layout.width}x${widget.layout.height} < ${minimum[0]}x${minimum[1]}`,
          );
        }
      }
    }

    expect(below, below.join("\n")).toEqual([]);
  });
});

describe("the wizard's design presets", () => {
  // "Extender light" reused the app default, which is Bloom Garden, so the app opened in the wrong theme.
  it("opens each wizard choice on its own vetted palette", () => {
    expect(Object.keys(CREATE_THEME_PRESETS)).toEqual([
      "bloom",
      "extender-ui",
      "high-contrast",
      "dark",
      "colour-safe",
      "pastel",
    ]);
    for (const [id, theme] of Object.entries(CREATE_THEME_PRESETS)) {
      expect(theme.preset_id).toBe(id);
    }
    expect(CREATE_THEME_PRESETS["extender-ui"].palette.primary).toBe("#1d4ed8");
  });

  // The wizard's id ("high-visibility") used to land in the role, which then named a palette that did not exist.
  it("leaves the first role following the app's palette", () => {
    const application = createGuidedApplication(
      { includeOnboardingSpots: false, name: "Night shift", starterId: "blank", themePresetId: "dark" },
      [],
    );
    expect(application.theme.preset_id).toBe("dark");
    expect(application.profiles[0]?.app_theme_preset_id).toBe("");
  });
});

describe("an app saved from a playground screen", () => {
  // The id was made unique but the name was not, so a second save listed two "Drive Draft" apps.
  it("takes a name no app in any configuration has", () => {
    const screen = { ...createStarterScreen("blank", false), title: "Drive" };
    const source = { id: "play", name: "Playground", profiles: [], screens: [screen] } as unknown as ApplicationConfig;
    const existing = [source, { id: "other-config-app", name: "Drive Draft" } as unknown as ApplicationConfig];

    const created = createApplicationFromPlaygroundScreen(screen, source, existing);

    expect(created.name).toBe("Drive Draft 2");
    expect(created.id).not.toBe("other-config-app");
  });
});
