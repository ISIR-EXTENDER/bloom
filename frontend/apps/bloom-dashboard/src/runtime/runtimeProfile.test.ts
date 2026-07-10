import { describe, expect, it } from "vitest";

import { resolveRuntimeProfile } from "./runtimeProfile";

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
      displayPreset: "high-visibility",
      fontScale: 1.25,
      id: "tablet",
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
      displayPreset: "default",
      fontScale: 1,
      id: "default",
      motorAccessibilityPreset: "default",
      name: "Default",
    });
  });
});
