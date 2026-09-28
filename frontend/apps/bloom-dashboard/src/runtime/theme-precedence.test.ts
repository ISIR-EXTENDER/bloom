// ADR 0143: this tablet's palette, then the role's, then the app's, with every retired id read as its replacement,
// whichever layer stored it. The table below is every combination the three layers can hold.
import {
  BLOOM_THEME_PRESET_ALIASES,
  BLOOM_THEME_PRESET_ORDER,
  BLOOM_THEME_PRESETS,
  canonicalBloomThemePresetId,
  isBloomThemePresetId,
  normalizeBloomThemePresetId,
  normalizeRoleThemePresetId,
} from "@bloom/ui";
import { describe, expect, it } from "vitest";
import { normalizeRuntimeProfileOverrides } from "./runtime-profile-overrides";
import {
  applyRuntimeProfileOverrides,
  readProfileThemePresetId,
  resolveRuntimeProfile,
  resolveRuntimeThemePresetId,
} from "./runtimeProfile";

const application = (presetId: string) => ({ theme: { preset_id: presetId } }) as never;
const role = (appThemePresetId: string) =>
  resolveRuntimeProfile(
    {
      profiles: [
        {
          app_theme_preset_id: appThemePresetId,
          display_preset: "comfort",
          font_scale: 1,
          id: "operator",
          motor_accessibility_preset: "default",
          name: "Operator",
          preferred_control_layout_id: "default",
        },
      ],
    } as never,
    { height: 800, width: 1280 },
  );

function sessionPalette(app: string, roleId: string, tablet: unknown) {
  const overrides = normalizeRuntimeProfileOverrides(tablet === undefined ? {} : { themePresetId: tablet });
  return resolveRuntimeThemePresetId(application(app), applyRuntimeProfileOverrides(role(roleId), overrides));
}

describe("the session's palette across the three layers", () => {
  it.each([
    // app, role, tablet, expected
    ["bloom", "", undefined, "bloom"],
    ["dark", "", undefined, "dark"],
    ["clinical", "", undefined, "bloom"],
    ["aurora", "", undefined, "bloom"],
    ["dark", "bloom-default", undefined, "dark"],
    ["dark", "extender", undefined, "extender-ui"],
    ["dark", "aurora", undefined, "dark"],
    ["dark", "pastel", undefined, "pastel"],
    ["dark", "pastel", "colour-safe", "colour-safe"],
    ["dark", "", "colour-safe", "colour-safe"],
    ["clinical", "high-visibility", "high-contrast", "high-contrast"],
    ["dark", "pastel", "extender", "pastel"],
    ["dark", "pastel", "aurora", "pastel"],
    ["dark", "pastel", "", "pastel"],
    ["dark", "pastel", 4, "pastel"],
    ["extender", "", null, "extender-ui"],
  ])("app %s, role %s, tablet %s reads as %s", (app, roleId, tablet, expected) => {
    expect(sessionPalette(app, roleId, tablet)).toBe(expected);
  });

  it("keeps a tablet's stored choice only when it is a vetted id, never a retired one", () => {
    expect(normalizeRuntimeProfileOverrides({ themePresetId: "extender" })).toEqual({});
    expect(normalizeRuntimeProfileOverrides({ themePresetId: "extender-ui" })).toEqual({
      themePresetId: "extender-ui",
    });
  });
});

describe("the alias table, both ways", () => {
  it("maps every retired id to a vetted palette, and leaves every vetted id as it is", () => {
    for (const [retired, replacement] of Object.entries(BLOOM_THEME_PRESET_ALIASES)) {
      expect(isBloomThemePresetId(retired)).toBe(false);
      expect(isBloomThemePresetId(replacement)).toBe(true);
      expect(canonicalBloomThemePresetId(retired)).toBe(replacement);
      expect(normalizeBloomThemePresetId(retired)).toBe(replacement);
    }
    for (const vetted of BLOOM_THEME_PRESET_ORDER) {
      expect(canonicalBloomThemePresetId(vetted)).toBe(vetted);
      expect(normalizeBloomThemePresetId(vetted)).toBe(vetted);
      expect(BLOOM_THEME_PRESETS[vetted].id).toBe(vetted);
    }
  });

  it("keeps an id from a newer Bloom on the app so it is not lost on save, but shows it as Bloom Garden", () => {
    expect(canonicalBloomThemePresetId("aurora")).toBe("aurora");
    expect(normalizeBloomThemePresetId("aurora")).toBe("bloom");
    expect(normalizeBloomThemePresetId(undefined)).toBe("bloom");
    expect(normalizeBloomThemePresetId(["dark"])).toBe("bloom");
  });

  it("reads a role's retired id as its replacement, and anything else as following the app", () => {
    expect(normalizeRoleThemePresetId("high-visibility")).toBe("high-contrast");
    expect(normalizeRoleThemePresetId("bloom-default")).toBe("");
    expect(normalizeRoleThemePresetId("clinical")).toBe("bloom");
    expect(normalizeRoleThemePresetId("aurora")).toBe("");
    expect(normalizeRoleThemePresetId(7)).toBe("");
    expect(readProfileThemePresetId("petanque-play")).toBe("bloom");
    expect(readProfileThemePresetId(undefined)).toBeNull();
  });
});
