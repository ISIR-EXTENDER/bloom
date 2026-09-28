import { describe, expect, it } from "vitest";

import { COMMAND_PURPOSES, commandPurposeOf } from "./command-purposes";
import { isModeRequestTopic, parseModeRequest, readModeRequestData } from "./mode-request";

describe("the mode-request grammar, as the backend parses it", () => {
  it.each([
    ["geometric/both", "geometric/both"],
    ["Geometric/JACO", "geometric/jaco"],
    ["behaviour/passthrough", "behaviour/passthrough"],
    ["behaviour/joint-target/home", "behaviour/joint_target/home"],
    ["behaviour/pose_target/ready", "behaviour/pose_target/ready"],
  ])("takes %s", (raw, normalized) => {
    expect(parseModeRequest(raw)).toEqual({ normalized, ok: true });
  });

  it.each([
    ["", /empty/],
    ["geometric", /two segments/],
    ["geometric//both", /empty path segment/],
    ["geometric/snek", /unknown geometric mode 'snek'/],
    ["geometric/both/x", /exactly one name/],
    ["behaviour/passthrough/x", /no extra segment/],
    ["behaviour/joint_target", /needs a target name/],
    ["behaviour/pose_target/a/b", /needs a target name/],
    ["behaviour/dance", /unknown behaviour/],
    ["navigate_screen", /two segments/],
    ["mode/both", /unknown mode family/],
  ])("refuses %s", (raw, pattern) => {
    const parsed = parseModeRequest(raw);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.error).toMatch(pattern);
  });

  it("reads the data of an object, JSON or ROS-text payload", () => {
    expect(readModeRequestData({ data: "geometric/both" })).toBe("geometric/both");
    expect(readModeRequestData('{"data": "geometric/jaco"}')).toBe("geometric/jaco");
    expect(readModeRequestData("{data: 'geometric/snake'}")).toBe("geometric/snake");
    expect(readModeRequestData("data: geometric/both")).toBe("geometric/both");
    expect(readModeRequestData({ data: 1 })).toBeNull();
    expect(readModeRequestData("")).toBeNull();
  });

  it("matches any topic ending in mode_request", () => {
    expect(isModeRequestTopic("/mode_request")).toBe(true);
    expect(isModeRequestTopic("/arm/mode_request")).toBe(true);
    expect(isModeRequestTopic("/ui/navigation")).toBe(false);
  });
});

describe("the Open a screen purpose", () => {
  it("carries the navigation command and no topic, and a named screen reads as it", () => {
    const navigate = COMMAND_PURPOSES.find((purpose) => purpose.id === "navigate");
    expect(navigate?.settings()).toEqual({ button_label: "Open screen", command: "navigate_screen" });
    expect(commandPurposeOf({ command: "navigate_screen" })).toBe("navigate");
    expect(commandPurposeOf({ targetScreenId: "other" })).toBe("navigate");
  });
});
