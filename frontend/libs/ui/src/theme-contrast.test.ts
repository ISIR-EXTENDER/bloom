import { describe, expect, it } from "vitest";

import {
  colorDifference,
  composite,
  contrastRatio,
  hueDistance,
  parseColor,
  simulateColorVision,
} from "./test-support/color-contrast";
import {
  BLOOM_THEME_PRESET_ORDER,
  BLOOM_THEME_PRESETS,
  type BloomSemanticColorTokenName,
  type BloomThemeTokenName,
  type BloomThemeTokens,
  canonicalBloomThemePresetId,
  createBloomAppPalette,
  normalizeBloomThemePresetId,
  normalizeRoleThemePresetId,
  resolveBloomThemePreset,
} from "./theme";

const presets = BLOOM_THEME_PRESET_ORDER.map((id) => BLOOM_THEME_PRESETS[id]);
const SURFACES = ["surface", "surfaceContainer", "surfaceContainerHigh", "surfaceContainerLow"] as const;

/** SC 1.4.3 asks 4.5:1 for text; the high-visibility palette promises the 7:1 of SC 1.4.6. */
const textFloor = (id: string) => (id === "high-contrast" ? 7 : 4.5);

const toHex = (color: ReturnType<typeof parseColor>) =>
  `#${[color.red, color.green, color.blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;

/** A translucent tint over its surface, as a chip or a tinted card draws it. */
const tint = (tokens: BloomThemeTokens, color: BloomThemeTokenName, percent: number, surface: BloomThemeTokenName) =>
  toHex(composite(withAlpha(tokens[color], percent / 100), tokens[surface]));

function withAlpha(color: string, alpha: number): string {
  const { red, green, blue } = parseColor(color);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

describe("vetted palettes", () => {
  it("offers exactly the six vetted palettes, in order", () => {
    expect(BLOOM_THEME_PRESET_ORDER).toEqual([
      "bloom",
      "extender-ui",
      "high-contrast",
      "dark",
      "colour-safe",
      "pastel",
    ]);
    expect(Object.keys(BLOOM_THEME_PRESETS).sort()).toEqual([...BLOOM_THEME_PRESET_ORDER].sort());
    expect(presets.map((preset) => preset.name)).toEqual([
      "Bloom Garden",
      "Extender",
      "High visibility",
      "Dark",
      "Colour-blind safe",
      "Pastel",
    ]);
  });

  it("reads ids stored by earlier versions as the palette that replaced them", () => {
    expect(normalizeBloomThemePresetId("bloom-default")).toBe("bloom");
    expect(normalizeBloomThemePresetId("clinical")).toBe("bloom");
    expect(normalizeBloomThemePresetId("petanque-play")).toBe("bloom");
    expect(normalizeBloomThemePresetId("high-visibility")).toBe("high-contrast");
    expect(normalizeBloomThemePresetId("extender")).toBe("extender-ui");
    expect(normalizeBloomThemePresetId("dark")).toBe("dark");
    expect(normalizeBloomThemePresetId("no-such-palette")).toBe("bloom");
    expect(normalizeBloomThemePresetId("")).toBe("bloom");
    expect(normalizeBloomThemePresetId(undefined)).toBe("bloom");
    expect(resolveBloomThemePreset("colour-safe")).toBe(BLOOM_THEME_PRESETS["colour-safe"]);
    // An app keeps an id from a newer Bloom; a role falls back to the app on anything it cannot name.
    expect(canonicalBloomThemePresetId("high-visibility")).toBe("high-contrast");
    expect(canonicalBloomThemePresetId("neon-2027")).toBe("neon-2027");
    expect(normalizeRoleThemePresetId("")).toBe("");
    expect(normalizeRoleThemePresetId("bloom-default")).toBe("");
    expect(normalizeRoleThemePresetId("neon-2027")).toBe("");
    expect(normalizeRoleThemePresetId("high-visibility")).toBe("high-contrast");
    expect(normalizeRoleThemePresetId("pastel")).toBe("pastel");
  });

  it("parses every colour token, so no palette ships a value the checks cannot read", () => {
    for (const preset of presets) {
      for (const [name, value] of Object.entries(preset.tokens)) {
        expect(() => parseColor(value), `${preset.id}.${name}`).not.toThrow();
      }
    }
  });

  it("stores a four-colour summary taken from the palette itself", () => {
    const dark = BLOOM_THEME_PRESETS.dark;
    expect(createBloomAppPalette(dark)).toEqual({
      accent: dark.tokens.secondary,
      background: dark.tokens.surfaceContainer,
      primary: dark.tokens.primary,
      surface: dark.tokens.surface,
    });
  });
});

describe.each(presets)("$name palette meets WCAG", (preset) => {
  const { tokens } = preset;
  const floor = textFloor(preset.id);

  it("keeps every text pair readable", () => {
    const pairs: [BloomSemanticColorTokenName, BloomThemeTokenName][] = [
      ["primary", "onPrimary"],
      ["primaryContainer", "onPrimaryContainer"],
      ["secondary", "onSecondary"],
      ["secondaryContainer", "onSecondaryContainer"],
      ["error", "onError"],
      ["errorContainer", "onErrorContainer"],
      ["stop", "onStop"],
      ["stopLatched", "onStopLatched"],
      ["success", "onSuccess"],
      ...SURFACES.flatMap((surface) =>
        (["onSurface", "onSurfaceMuted", "muted", "success", "error"] as const).map(
          (text) => [surface, text] as [BloomSemanticColorTokenName, BloomThemeTokenName],
        ),
      ),
    ];
    for (const [background, foreground] of pairs) {
      expect(
        contrastRatio(tokens[background], tokens[foreground]),
        `${preset.id}: ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });

  it("keeps status chips and the unavailable caption readable over their tints", () => {
    for (const surface of SURFACES) {
      // Ready and missing chips: an 18 % / 16 % tint of the status colour, lettered in that colour.
      expect(
        contrastRatio(tint(tokens, "success", 18, surface), tokens.success),
        `ready chip on ${surface}`,
      ).toBeGreaterThanOrEqual(floor);
      expect(
        contrastRatio(tint(tokens, "error", 16, surface), tokens.error),
        `missing chip on ${surface}`,
      ).toBeGreaterThanOrEqual(floor);
      // A rejected audit row and the Builder's danger notes sit on a 12 % error tint.
      expect(
        contrastRatio(tint(tokens, "error", 12, surface), tokens.error),
        `danger note on ${surface}`,
      ).toBeGreaterThanOrEqual(floor);
    }
    expect(
      contrastRatio(tokens.surfaceContainerHigh, tokens.onSurfaceMuted),
      "unavailable caption",
    ).toBeGreaterThanOrEqual(floor);
    expect(contrastRatio(tokens.errorContainer, tokens.error), "danger on its container").toBeGreaterThanOrEqual(floor);
  });

  it("keeps the focus ring at 3:1 on every surface it lands on, STOP included", () => {
    const { focusRing, focusRingContrast } = tokens;
    const grounds = [...SURFACES, "primary", "secondary", "error", "stop", "stopLatched", "success"] as const;
    for (const ground of grounds) {
      const best = Math.max(contrastRatio(tokens[ground], focusRing), contrastRatio(tokens[ground], focusRingContrast));
      expect(best, `${preset.id}: focus ring on ${ground}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(focusRing, focusRingContrast)).toBeGreaterThanOrEqual(3);
  });

  it("draws the scan ring, dwell ring, unavailable outline and STOP at 3:1 on every surface", () => {
    for (const surface of SURFACES) {
      expect(contrastRatio(tokens[surface], tokens.primary), `scan ring on ${surface}`).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(tokens[surface], tokens.unavailableOutline),
        `unavailable on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(tokens[surface], tokens.stop), `STOP on ${surface}`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(tokens[surface], tokens.stopLatched), `latched STOP on ${surface}`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("keeps unavailable apart from unknown: the dashed outline reads clearly above a hairline", () => {
    for (const surface of SURFACES) {
      const outline = contrastRatio(tokens[surface], tokens.unavailableOutline);
      const hairline = contrastRatio(tokens[surface], tokens.hairline);
      expect(outline - hairline, `${preset.id}: outline vs hairline on ${surface}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps error apart from STOP and from the joystick knobs, and the HELD and DEBUG chips readable", () => {
    expect(colorDifference(tokens.stop, tokens.error), `${preset.id}: STOP vs error`).toBeGreaterThanOrEqual(20);
    for (const knob of ["series2", "series3"] as const) {
      expect(colorDifference(tokens.error, tokens[knob]), `${preset.id}: error vs ${knob}`).toBeGreaterThanOrEqual(25);
    }
    // The kiosk bar's HELD chip is ink on pollen; DEBUG is ink on lilac (design 5b).
    expect(contrastRatio(tokens.pollen, tokens.ink), `${preset.id}: HELD chip`).toBeGreaterThanOrEqual(floor);
    expect(contrastRatio(tokens.lilac, tokens.ink), `${preset.id}: DEBUG chip`).toBeGreaterThanOrEqual(floor);
  });

  it("never paints a joystick knob in STOP's colour", () => {
    // Knobs take series 2 (translation) and 3 (rotation); a red knob next to STOP dilutes it.
    for (const knob of ["series2", "series3"] as const) {
      expect(colorDifference(tokens.stop, tokens[knob]), `${preset.id}: ${knob} vs STOP`).toBeGreaterThanOrEqual(25);
      for (const deficiency of ["protanopia", "deuteranopia"] as const) {
        const difference = colorDifference(
          simulateColorVision(tokens.stop, deficiency),
          simulateColorVision(tokens[knob], deficiency),
        );
        expect(difference, `${preset.id}: ${knob} vs STOP under ${deficiency}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it("makes STOP the most prominent control", () => {
    expect(contrastRatio(tokens.surfaceContainer, tokens.stop)).toBeGreaterThanOrEqual(3);
    for (const other of ["primary", "secondary", "success"] as const) {
      expect(hueDistance(tokens.stop, tokens[other]), `${preset.id}: STOP hue vs ${other}`).toBeGreaterThanOrEqual(40);
    }
    // A red-green deficiency must still tell STOP from the go and ready colours.
    for (const deficiency of ["protanopia", "deuteranopia"] as const) {
      const stop = simulateColorVision(tokens.stop, deficiency);
      for (const other of ["primary", "success"] as const) {
        const difference = colorDifference(stop, simulateColorVision(tokens[other], deficiency));
        expect(difference, `${preset.id}: STOP vs ${other} under ${deficiency}`).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

describe("colour maths", () => {
  it("matches the WCAG reference ratios", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#767676")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#ffffff", "rgba(0, 0, 0, 0)")).toBeCloseTo(1, 5);
  });

  it("composites a translucent colour over its surface", () => {
    expect(toHex(composite("rgba(0, 0, 0, 0.5)", "#ffffff"))).toBe("#808080");
    expect(parseColor("#0000")).toEqual({ red: 0, green: 0, blue: 0, alpha: 0 });
  });

  it("collapses red and green under a red-green deficiency", () => {
    const plain = colorDifference("#d32f2f", "#2e7d32");
    const deutan = colorDifference(
      simulateColorVision("#d32f2f", "deuteranopia"),
      simulateColorVision("#2e7d32", "deuteranopia"),
    );
    expect(deutan).toBeLessThan(plain / 2);
  });
});
