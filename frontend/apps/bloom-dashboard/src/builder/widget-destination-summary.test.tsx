/**
 * @vitest-environment jsdom
 */
import type { WidgetConfig } from "@bloom/api-client";
import { resolveWidgetDestination } from "@bloom/widgets";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetDestinationSummary } from "./BuilderWidgetSummaries";

afterEach(cleanup);

const joystick: WidgetConfig = {
  id: "stick",
  kind: "joystick",
  title: "Stick",
  layout: { x: 0, y: 0, width: 200, height: 200 },
  settings: {
    runtime_binding: { adapter: "teleop", target: "translation", value_mapping: { target_topic: "/tablet_cmd" } },
  },
};

function summary(serverTeleopTargets?: string[]) {
  render(
    <WidgetDestinationSummary
      allowedTeleopTargets={["/tablet_cartesian_command", "/tablet_cmd"]}
      destination={resolveWidgetDestination(joystick.kind, joystick.settings)}
      serverTeleopTargets={serverTeleopTargets}
      widget={joystick}
    />,
  );
}

describe("the inspector on a joystick's topic", () => {
  it("warns when nothing on the robot takes the topic, and names what the manager listens on", () => {
    summary(["/tablet_cartesian_command"]);
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).toContain("Nothing on this robot takes a joystick on /tablet_cmd");
    expect(alert).toContain("The manager listens on /tablet_cartesian_command");
  });

  it("stays quiet when the server allows it, or has not said", () => {
    summary(["/tablet_cartesian_command", "/tablet_cmd"]);
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    summary(undefined);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
