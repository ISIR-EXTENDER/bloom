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
import { hueOf } from "./test-support/color-contrast";

// Vitest empties imported CSS, so the stylesheet is read from disk; the package has no Node types.
type NodeFs = { readFileSync: (path: string, encoding: "utf8") => string };
const nodeProcess = (globalThis as unknown as { process: { cwd: () => string } }).process;
const readRootStyles = async () =>
  ((await import(/* @vite-ignore */ `node:${"fs"}`)) as NodeFs).readFileSync(
    `${nodeProcess.cwd()}/src/styles.css`,
    "utf8",
  );

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
      <BloomThemeProvider theme={BLOOM_THEME_PRESETS["colour-safe"]}>
        <div data-testid="themed-app">Colour-safe</div>
      </BloomThemeProvider>,
    );

    const root = screen.getByTestId("themed-app").parentElement;

    const { tokens } = BLOOM_THEME_PRESETS["colour-safe"];
    expect(root).toHaveStyle({ "--bloom-color-accent": tokens.accent });
    expect(root).toHaveStyle({ "--bloom-color-secondary": tokens.secondary });
    expect(root).toHaveStyle({ "--bloom-primary": tokens.primary });
    expect(root).toHaveStyle({ "--bloom-stop": tokens.stop });
    expect(root).toHaveStyle({ "--bloom-series-1": tokens.series1 });
    expect(root).toHaveAttribute("data-bloom-theme", "colour-safe");
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

  it("documents Bloom Garden's stop, success, error and unavailable outline as shipped", () => {
    for (const [name, token] of [
      ["stop", "stop"],
      ["success", "success"],
      ["error", "error"],
      ["unavailable-outline", "unavailableOutline"],
    ] as const) {
      const documented = designSystemPage.match(new RegExp(`>${name}<\\\\u002Fdiv><div[^>]*>(#[0-9a-f]{6})`))?.[1];
      expect(documented, name).toBe(BLOOM_THEME_PRESETS.bloom.tokens[token]);
    }
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
    expect(style["--bloom-danger"]).toBe(BLOOM_THEME_PRESETS["extender-ui"].tokens.error);
    expect(style["--bloom-danger-container"]).toBe(BLOOM_THEME_PRESETS["extender-ui"].tokens.errorContainer);
    expect(style["--bloom-axis-rotation"]).toBe(BLOOM_THEME_PRESETS["extender-ui"].tokens.series3);
  });

  it("gives the dark palette a dark colour scheme and the high-visibility palette its tighter corners", () => {
    expect(createBloomThemeStyle(BLOOM_THEME_PRESETS.dark).colorScheme).toBe("dark");
    expect(createBloomThemeStyle(BLOOM_THEME_PRESETS.bloom).colorScheme).toBe("light");
    const highVisibility = createBloomThemeStyle(BLOOM_THEME_PRESETS["high-contrast"]) as Record<string, string>;
    expect(highVisibility["--bloom-radius-card"]).toBe("12px");
    expect((createBloomThemeStyle(BLOOM_THEME_PRESETS.bloom) as Record<string, string>)["--bloom-radius-card"]).toBe(
      "18px",
    );
  });

  it("mirrors the Bloom palette's new roles at :root, so a page outside any theme root still reads right", async () => {
    const rootStyles = await readRootStyles();
    const style = createBloomThemeStyle(BLOOM_THEME_PRESETS.bloom) as Record<string, string>;
    for (const name of [
      "--bloom-color-stop",
      "--bloom-color-on-stop",
      "--bloom-color-stop-latched",
      "--bloom-color-success",
      "--bloom-color-unavailable-outline",
      "--bloom-color-hairline",
      "--bloom-color-hairline-strong",
      "--bloom-color-shadow",
      "--bloom-color-surface-bright",
      "--bloom-color-command",
    ]) {
      const declared = rootStyles.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
      expect(declared, name).toBe(style[name]);
    }
    BLOOM_SERIES_RAMP.forEach((hex, index) => {
      expect(rootStyles).toContain(`--bloom-series-${index + 1}: ${hex};`);
    });
  });
});
