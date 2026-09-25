import { describe, expect, it } from "vitest";
import { teleopTargetsTheServerRefuses } from "./BuilderAdapterGuardrailsPanel";

describe("teleop targets the server refuses", () => {
  it("lists the app's topics the server's own list leaves out", () => {
    expect(
      teleopTargetsTheServerRefuses(["/tablet_cartesian_command", "/tablet_cmd"], ["/tablet_cartesian_command"]),
    ).toEqual(["/tablet_cmd"]);
  });

  it("says nothing while the server's list is unknown or open, or for the app's wildcard", () => {
    expect(teleopTargetsTheServerRefuses(["/tablet_cmd"], undefined)).toEqual([]);
    expect(teleopTargetsTheServerRefuses(["/tablet_cmd"], ["*"])).toEqual([]);
    expect(teleopTargetsTheServerRefuses(["*"], ["/tablet_cartesian_command"])).toEqual([]);
  });
});
