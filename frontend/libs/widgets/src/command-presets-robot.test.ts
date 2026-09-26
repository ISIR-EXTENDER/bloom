import { describe, expect, it } from "vitest";
import { getRosMessageCommandPresetsByCategory } from "./settings/presets";

const presetIds = (robotName?: string) =>
  [...getRosMessageCommandPresetsByCategory(robotName).values()].flat().map((preset) => preset.id);

describe("command preset library per robot", () => {
  it("offers Send Home on the Explorer and hides it on the Kinova until cartesian_manager#10", () => {
    expect(presetIds("explorer")).toContain("manager-joint-target-home");
    expect(presetIds()).toContain("manager-joint-target-home");
    expect(presetIds("Kinova Gen3")).not.toContain("manager-joint-target-home");
    expect(presetIds("kinova")).toContain("manager-cancel-behaviour");
  });
});
