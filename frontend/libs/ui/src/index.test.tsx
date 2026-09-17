import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import designSystemPage from "../../../../docs/design/design-system.html?raw";
import {
  BLOOM_SERIES_RAMP,
  BLOOM_THEME_PRESETS,
  BloomButton,
  BloomCard,
  BloomNavBar,
  BloomPanel,
  BloomTag,
  BloomThemeProvider,
  createBloomThemeStyle,
  seriesStyle,
} from "./index";

describe("BloomNavBar", () => {
  it("renders a standard product navigation with an active item", () => {
    render(
      <BloomNavBar
        activeItemId="home"
        brand={{ imageSrc: "/favicon.png", label: "Bloom" }}
        items={[
          { id: "home", label: "Home" },
          { id: "builder", label: "Builder", description: "Compose screens" },
        ]}
        onItemSelect={() => undefined}
      />,
    );

    expect(screen.getByRole("link", { name: "Bloom" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Builder: Compose screens" })).toBeVisible();
  });

  it("notifies when a nav item is selected", () => {
    const onItemSelect = vi.fn();
    render(
      <BloomNavBar
        activeItemId="home"
        brand={{ label: "Bloom" }}
        items={[
          { id: "home", label: "Home" },
          { id: "runtime", label: "Runtime" },
        ]}
        onItemSelect={onItemSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Runtime" }));

    expect(onItemSelect).toHaveBeenCalledWith("runtime");
  });

  it("renders reusable design system primitives", () => {
    render(
      <>
        <BloomButton tone="primary">Save</BloomButton>
        <BloomCard tone="canvas">Canvas card</BloomCard>
        <BloomPanel labelledBy="panel-title">
          <h2 id="panel-title">Panel</h2>
        </BloomPanel>
        <BloomTag tone="primary">Runtime</BloomTag>
      </>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("bloom-button-primary");
    expect(screen.getByText("Canvas card")).toHaveClass("bloom-card-canvas");
    expect(screen.getByRole("region", { name: "Panel" })).toHaveClass("bloom-panel");
    expect(screen.getByText("Runtime")).toHaveClass("bloom-tag-primary");
  });

  it("applies application theme tokens through css variables", () => {
    render(
      <BloomThemeProvider theme={BLOOM_THEME_PRESETS["petanque-play"]}>
        <div data-testid="themed-app">Petanque</div>
      </BloomThemeProvider>,
    );

    const root = screen.getByTestId("themed-app").parentElement;

    expect(root).toHaveStyle({ "--bloom-color-accent": "#f1a340" });
    expect(root).toHaveStyle({ "--bloom-color-secondary": "#f1a340" });
    expect(root).toHaveStyle({ "--bloom-primary": "#345444" });
    expect(BLOOM_THEME_PRESETS["petanque-play"].description).toContain("playful");
  });

  it("uses the Bloom palette as the default theme", () => {
    // The default is what someone sees before any application loads, and
    // whenever the backend is unreachable. It used to be the blue Extender UI
    // preset, so a fresh clone looked like a different product than the one
    // everybody here works in.
    render(
      <BloomThemeProvider>
        <div data-testid="themed-app">Bloom</div>
      </BloomThemeProvider>,
    );

    const root = screen.getByTestId("themed-app").parentElement;

    expect(root).toHaveStyle({ "--bloom-color-primary": BLOOM_THEME_PRESETS.bloom.tokens.primary });
    expect(root).toHaveStyle({ "--bloom-color-secondary": BLOOM_THEME_PRESETS.bloom.tokens.secondary });
  });

  it("ships the series ramp the design system documents, in order", () => {
    const documented = [...designSystemPage.matchAll(/series-(\d)<\\u002Fdiv><div[^>]*>(#[0-9a-f]{6})/g)].map(
      ([, position, hex]) => [Number(position), hex],
    );

    expect(documented).toEqual(BLOOM_SERIES_RAMP.map((hex, index) => [index + 1, hex]));
    expect(seriesStyle(0)).toEqual({ color: "var(--bloom-series-1)", dashed: false });
    expect(seriesStyle(8)).toEqual({ color: "var(--bloom-series-1)", dashed: true });
  });

  it("keeps every preset's sage a sage", () => {
    const documented = designSystemPage.match(/>sage<\\u002Fdiv><div[^>]*>(#[0-9a-f]{6})/)?.[1];
    expect(documented).toBe(BLOOM_THEME_PRESETS.bloom.tokens.sage);

    // Sage names live motion, so a preset that puts a blue here restores the blue knob.
    const offHue = Object.values(BLOOM_THEME_PRESETS)
      .map((preset) => [preset.id, hueOf(preset.tokens.sage)] as const)
      .filter(([, hue]) => hue < 90 || hue > 150);

    expect(offHue).toEqual([]);
  });

  it("carries alias tokens with the theme instead of freezing them at the root", () => {
    const style = createBloomThemeStyle(BLOOM_THEME_PRESETS["extender-ui"]) as Record<string, string>;

    expect(style["--bloom-accent"]).toBe(BLOOM_THEME_PRESETS["extender-ui"].tokens.secondary);
    expect(style["--bloom-border"]).toBe(BLOOM_THEME_PRESETS["extender-ui"].tokens.outline);
    expect(style["--bloom-muted"]).toBe(BLOOM_THEME_PRESETS["extender-ui"].tokens.muted);
  });

  it("keeps every theme preset above minimum readable contrast for semantic text pairs", () => {
    const contrastPairs = [
      ["primary", "onPrimary"],
      ["primaryContainer", "onPrimaryContainer"],
      ["secondary", "onSecondary"],
      ["secondaryContainer", "onSecondaryContainer"],
      ["surface", "onSurface"],
      ["surfaceContainer", "onSurface"],
      ["surfaceContainerHigh", "onSurface"],
      ["surfaceContainerLow", "onSurface"],
      ["error", "onError"],
      ["errorContainer", "onErrorContainer"],
      // Finding 8: muted text was used on every surface and tested on none.
      ["surface", "muted"],
      ["surfaceContainer", "muted"],
      ["surfaceContainerHigh", "muted"],
      ["surfaceContainerLow", "muted"],
      ["surface", "onSurfaceMuted"],
      ["surfaceContainerHigh", "onSurfaceMuted"],
    ] as const;

    for (const preset of Object.values(BLOOM_THEME_PRESETS)) {
      for (const [backgroundToken, foregroundToken] of contrastPairs) {
        const contrast = getContrastRatio(preset.tokens[backgroundToken], preset.tokens[foregroundToken]);
        expect(contrast, `${preset.id}: ${foregroundToken} on ${backgroundToken}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

function getContrastRatio(background: string, foreground: string): number {
  const backgroundLuminance = getRelativeLuminance(parseHexColor(background));
  const foregroundLuminance = getRelativeLuminance(parseHexColor(foreground));
  const lighter = Math.max(backgroundLuminance, foregroundLuminance);
  const darker = Math.min(backgroundLuminance, foregroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function parseHexColor(color: string): [number, number, number] {
  if (!color.startsWith("#")) {
    throw new Error(`Contrast tests only support hex colors, received "${color}".`);
  }

  const raw = color.slice(1);
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : raw;

  if (normalized.length !== 6) {
    throw new Error(`Invalid hex color "${color}".`);
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

/** The colour's hue in degrees; green sits near 120, cyan near 190. */
function hueOf(color: string): number {
  const [red, green, blue] = parseHexColor(color).map((channel) => channel / 255) as [number, number, number];
  const highest = Math.max(red, green, blue);
  const delta = highest - Math.min(red, green, blue);
  if (delta === 0) {
    return 0;
  }
  const sector =
    highest === red
      ? ((green - blue) / delta) % 6
      : highest === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return (sector * 60 + 360) % 360;
}

function getRelativeLuminance([red, green, blue]: [number, number, number]): number {
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}
