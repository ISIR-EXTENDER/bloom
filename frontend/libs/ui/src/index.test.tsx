import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BLOOM_THEME_PRESETS, BloomButton, BloomCard, BloomNavBar, BloomPanel, BloomThemeProvider } from "./index";

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
      </>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("bloom-button-primary");
    expect(screen.getByText("Canvas card")).toHaveClass("bloom-card-canvas");
    expect(screen.getByRole("region", { name: "Panel" })).toHaveClass("bloom-panel");
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
});
