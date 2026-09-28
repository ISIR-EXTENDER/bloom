import { describe, expect, it } from "vitest";
import { commandPurposesFor } from "./command-purposes";
import { getRosMessageCommandPresetsByCategory } from "./settings/presets";

const presetIds = (robotName?: string) =>
  [...getRosMessageCommandPresetsByCategory(robotName).values()].flat().map((preset) => preset.id);

describe("command preset library per robot", () => {
  it("offers Send Home on every arm, the Kinova included since cartesian_manager#11", () => {
    for (const robot of ["explorer", undefined, "Kinova Gen3"]) {
      expect(presetIds(robot)).toContain("manager-joint-target-home");
    }
    expect(presetIds("kinova")).toContain("manager-cancel-behaviour");
  });

  it("offers the Go home purpose on the Kinova", () => {
    expect(commandPurposesFor("Kinova Gen3").map((purpose) => purpose.id)).toContain("go-home");
  });
});
