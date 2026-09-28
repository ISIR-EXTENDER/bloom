import { describe, expect, it } from "vitest";

import { getWidgetSettingsContract, normalizeWidgetSettings } from "./settings";

describe("a navigation button's target screen", () => {
  it("is part of the command button contract, so the Builder can offer it", () => {
    expect(getWidgetSettingsContract("command-button").fields.find((field) => field.key === "targetScreenId")).toEqual(
      expect.objectContaining({ label: "Opens screen", required: false }),
    );
  });

  it("must be text", () => {
    expect(normalizeWidgetSettings("command-button", { command: "navigate_screen", targetScreenId: 3 }).success).toBe(
      false,
    );
    expect(
      normalizeWidgetSettings("command-button", { command: "navigate_screen", targetScreenId: "home" }).success,
    ).toBe(true);
  });
});
