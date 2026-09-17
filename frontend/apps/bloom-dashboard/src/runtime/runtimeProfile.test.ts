import { describe, expect, it } from "vitest";

import { resolveInitialScreen, resolveNavigableScreens, resolveRuntimeProfile } from "./runtimeProfile";

const profiles = [
  {
    app_theme_preset_id: "bloom-default",
    display_preset: "comfort",
    font_scale: 1.05,
    id: "operator",
    motor_accessibility_preset: "default",
    name: "Operator",
    preferred_control_layout_id: "default",
  },
  {
    app_theme_preset_id: "bloom-default",
    display_preset: "high-visibility",
    font_scale: 1.25,
    id: "tablet",
    motor_accessibility_preset: "large-targets",
    name: "Tablet high visibility",
    preferred_control_layout_id: "tablet",
  },
] as const;

describe("resolveRuntimeProfile", () => {
  it("uses the high visibility profile on small tablet viewports", () => {
    expect(resolveRuntimeProfile({ profiles: [...profiles] }, { height: 600, width: 1024 })).toEqual({
      audioCues: false,
      deadzone: 0,
      dwellEnabled: false,
      dwellMs: 1000,
      repeatGuardMs: 0,
      scanPeriodMs: 1400,
      displayPreset: "high-visibility",
      fontScale: 1.25,
      id: "tablet",
      language: "en",
      motorAccessibilityPreset: "large-targets",
      name: "Tablet high visibility",
    });
  });

  it("uses a comfort profile on medium tablet viewports", () => {
    expect(resolveRuntimeProfile({ profiles: [...profiles] }, { height: 800, width: 1280 })).toMatchObject({
      displayPreset: "comfort",
      id: "operator",
    });
  });

  it("uses the preferred profile before viewport heuristics", () => {
    expect(resolveRuntimeProfile({ profiles: [...profiles] }, { height: 600, width: 1024 }, "operator")).toMatchObject({
      displayPreset: "comfort",
      id: "operator",
    });
  });

  it("falls back to a safe default profile when an app has no profiles", () => {
    expect(resolveRuntimeProfile({ profiles: [] }, { height: 1080, width: 1920 })).toEqual({
      audioCues: false,
      deadzone: 0,
      dwellEnabled: false,
      dwellMs: 1000,
      repeatGuardMs: 0,
      scanPeriodMs: 1400,
      displayPreset: "default",
      fontScale: 1,
      id: "default",
      language: "en",
      motorAccessibilityPreset: "default",
      name: "Default",
    });
  });

  it("clamps the dwell duration to the supported operator range", () => {
    const profile = {
      ...profiles[0],
      dwell_ms: 9000,
      motor_accessibility_preset: "dwell" as const,
    };

    expect(resolveRuntimeProfile({ profiles: [profile] }, { height: 800, width: 1280 }, "operator")).toMatchObject({
      dwellEnabled: true,
      dwellMs: 4000,
      motorAccessibilityPreset: "dwell",
    });
  });

  it("enables dwell independently of the scanning motor preset", () => {
    const profile = {
      ...profiles[0],
      dwell_enabled: true,
      dwell_ms: 850,
      motor_accessibility_preset: "scan" as const,
    };

    expect(resolveRuntimeProfile({ profiles: [profile] }, { height: 800, width: 1280 }, "operator")).toMatchObject({
      dwellEnabled: true,
      dwellMs: 850,
      motorAccessibilityPreset: "scan",
    });
  });

  it("applies and clamps operator overrides after profile normalization", () => {
    expect(
      resolveRuntimeProfile({ profiles: [...profiles] }, { height: 800, width: 1280 }, "operator", {
        audioCues: true,
        deadzone: 9,
        dwellEnabled: true,
        dwellMs: 100,
        motorAccessibilityPreset: "scan",
        repeatGuardMs: -10,
        scanPeriodMs: 9000,
      }),
    ).toMatchObject({
      audioCues: true,
      deadzone: 0.5,
      dwellEnabled: true,
      dwellMs: 400,
      motorAccessibilityPreset: "scan",
      repeatGuardMs: 0,
      scanPeriodMs: 3000,
    });
  });

  it("falls back to English and applies a language override", () => {
    expect(resolveRuntimeProfile({ profiles: [...profiles] }, { height: 800, width: 1280 }, "operator").language).toBe(
      "en",
    );
    expect(
      resolveRuntimeProfile({ profiles: [...profiles] }, { height: 800, width: 1280 }, "operator", { language: "fr" })
        .language,
    ).toBe("fr");
  });
});

describe("profile-selected control layout", () => {
  const screen = (id: string) => ({ id }) as never;
  const application = {
    profiles: [
      { ...profiles[0], id: "bench", preferred_control_layout_id: "drive_bench" },
      { ...profiles[0], id: "operator", preferred_control_layout_id: "drive_operator" },
      { ...profiles[0], id: "legacy", preferred_control_layout_id: "default" },
    ],
    screens: [screen("drive_bench"), screen("drive_operator"), screen("positions")],
  };
  const ids = (screens: readonly { id: string }[]) => screens.map((item) => item.id);

  it("opens the layout the profile names", () => {
    expect(resolveInitialScreen(application, "operator")?.id).toBe("drive_operator");
    expect(resolveInitialScreen(application, "bench")?.id).toBe("drive_bench");
  });

  it("falls back to the first screen for an unknown profile or a layout id naming no screen", () => {
    expect(resolveInitialScreen(application, "")?.id).toBe("drive_bench");
    expect(resolveInitialScreen(application, "legacy")?.id).toBe("drive_bench");
    expect(resolveInitialScreen({ profiles: [], screens: [] }, "operator")).toBeUndefined();
  });

  it("leaves the other role's layout out of navigation", () => {
    expect(ids(resolveNavigableScreens(application, "operator"))).toEqual(["drive_operator", "positions"]);
    expect(ids(resolveNavigableScreens(application, "legacy"))).toEqual(["drive_bench", "positions"]);
  });
});
