/**
 * @vitest-environment jsdom
 */
import { DEFAULT_APPLICATION_THEME } from "@bloom/api-client";
import { BLOOM_THEME_PRESETS } from "@bloom/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderAppThemePanel } from "./BuilderAppThemePanel";

const renderPanel = (theme = DEFAULT_APPLICATION_THEME, onThemeChange = vi.fn()) =>
  render(
    <BuilderAppThemePanel
      inspirationError=""
      onInspirationChange={() => undefined}
      onMoodboardFile={() => undefined}
      onThemeChange={onThemeChange}
      theme={theme}
    />,
  );

describe("the app theme panel", () => {
  afterEach(cleanup);

  it("offers every vetted palette as a pressed-state card, with no free colour pickers", () => {
    renderPanel();

    const cards = screen.getAllByRole("button");
    expect(cards.map((card) => card.querySelector(".builder-theme-preset-name")?.textContent)).toEqual([
      "Bloom Garden",
      "Extender",
      "High visibility",
      "Dark",
      "Colour-blind safe",
      "Pastel",
    ]);
    expect(screen.getByRole("button", { name: /Bloom Garden/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("primary color")).toBeNull();
    expect(screen.queryByLabelText("Website reference")).toBeNull();
    expect(screen.queryByLabelText("Moodboard image")).toBeNull();
  });

  it("reads a stored legacy id as the palette that replaced it", () => {
    renderPanel({ ...DEFAULT_APPLICATION_THEME, preset_id: "high-visibility" });

    expect(screen.getByRole("button", { name: /High visibility/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("previews each palette in its own tokens: STOP, a dashed unavailable tile beside a solid unknown one", () => {
    renderPanel();

    const dark = screen.getByRole("button", { name: /Dark/ });
    const preview = dark.querySelector("[data-bloom-theme]");
    expect(preview).toHaveAttribute("data-bloom-theme", "dark");
    expect(preview).toHaveStyle({ "--bloom-stop": BLOOM_THEME_PRESETS.dark.tokens.stop });
    expect(dark.querySelector(".bloom-palette-preview-stop")).toHaveTextContent("STOP");
    expect(dark.querySelector(".bloom-palette-preview-unavailable")).not.toBeNull();
    expect(dark.querySelector(".bloom-palette-preview-unknown")).not.toBeNull();
    expect(dark.querySelector(".bloom-palette-preview-surface")).toHaveAttribute("aria-hidden", "true");
  });

  it("does nothing when the pressed card is pressed again, so a no-op never dirties the draft", () => {
    const onThemeChange = vi.fn();
    renderPanel(DEFAULT_APPLICATION_THEME, onThemeChange);

    fireEvent.click(screen.getByRole("button", { name: /Bloom Garden/ }));

    expect(onThemeChange).not.toHaveBeenCalled();
  });

  it("stores the palette id and the four colours derived from it", () => {
    const onThemeChange = vi.fn();
    renderPanel(DEFAULT_APPLICATION_THEME, onThemeChange);

    fireEvent.click(screen.getByRole("button", { name: /Colour-blind safe/ }));

    const { tokens } = BLOOM_THEME_PRESETS["colour-safe"];
    expect(onThemeChange).toHaveBeenCalledWith({
      ...DEFAULT_APPLICATION_THEME,
      palette: {
        accent: tokens.secondary,
        background: tokens.surfaceContainer,
        primary: tokens.primary,
        surface: tokens.surface,
      },
      preset_id: "colour-safe",
    });
  });
});
