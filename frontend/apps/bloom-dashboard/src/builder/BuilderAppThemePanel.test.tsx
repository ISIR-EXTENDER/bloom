/**
 * @vitest-environment jsdom
 */
import { DEFAULT_APPLICATION_THEME } from "@bloom/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BuilderAppThemePanel } from "./BuilderAppThemePanel";

describe("the app theme panel", () => {
  afterEach(cleanup);

  // The pickers only tint the Home card, and nothing reads the moodboard or reference yet.
  it("names the colour pickers for what they change and hides the unused inspiration fields", () => {
    render(
      <BuilderAppThemePanel
        inspirationError=""
        onInspirationChange={() => undefined}
        onMoodboardFile={() => undefined}
        onThemeChange={() => undefined}
        theme={DEFAULT_APPLICATION_THEME}
      />,
    );

    expect(screen.getByRole("group", { name: "App card colours" })).toBeTruthy();
    expect(screen.getByLabelText("primary color")).toBeTruthy();
    expect(screen.queryByLabelText("Website reference")).toBeNull();
    expect(screen.queryByLabelText("Moodboard image")).toBeNull();
  });
});
