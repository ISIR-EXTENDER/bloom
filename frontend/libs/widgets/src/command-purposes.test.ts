import { describe, expect, it } from "vitest";
import { COMMAND_PURPOSES, commandPurposeOf, commandPurposesFor } from "./command-purposes";

describe("shared control purposes", () => {
  it.each([
    ["shared-control", "behaviour/shared_control"],
    ["shared-control-reset", "behaviour/shared_control/reset"],
    ["intent-scaling", "behaviour/intent_scaling"],
  ])("%s requests %s and is recognised again", (id, command) => {
    const settings = COMMAND_PURPOSES.find((purpose) => purpose.id === id)?.settings() ?? {};
    expect(settings).toMatchObject({ topic: "/mode_request", command, payload: { data: command } });
    expect(commandPurposeOf(settings)).toBe(id);
  });

  it("is offered on both arms", () => {
    for (const robot of ["explorer", "kinova"]) {
      expect(commandPurposesFor(robot).map((purpose) => purpose.id)).toEqual(
        expect.arrayContaining(["shared-control", "shared-control-reset", "intent-scaling"]),
      );
    }
  });
});
