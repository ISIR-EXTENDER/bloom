import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  BLOOM_THEME_PRESETS,
  BloomButton,
  BloomCard,
  BloomNavBar,
  BloomPanel,
  BloomTag,
  BloomThemeProvider,
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

function getRelativeLuminance([red, green, blue]: [number, number, number]): number {
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}
