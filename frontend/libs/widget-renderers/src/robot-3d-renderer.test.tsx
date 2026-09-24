/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWidgetDescriptor } from "./index";

const robotScreen: ScreenConfig = {
  id: "robot",
  title: "Robot",
  canvas: { preset_id: "hd", runtime_mode: "fit" },
  widgets: [
    {
      id: "view",
      kind: "robot-3d",
      title: "Robot",
      layout: { x: 0, y: 0, width: 546, height: 420 },
      settings: {
        jointStateTopic: "/joint_states",
        markerTopic: "/goal_markers",
        showAxes: true,
        modelSource: "extension",
        robotModelUrl: "",
      },
    },
  ],
};

afterEach(cleanup);

function renderView(options: Parameters<typeof renderWidgetDescriptor>[1]) {
  const descriptor = renderScreenDescriptors(robotScreen, createDefaultWidgetRegistry())[0];
  if (descriptor?.status !== "resolved") {
    throw new Error("the fixture did not resolve");
  }
  return render(renderWidgetDescriptor(descriptor, options));
}

describe("the 3D robot view", () => {
  it("says so when the runtime hands it no robot model source", () => {
    renderView({});
    expect(screen.getByText("No robot model source in this runtime.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Robot 3D view" }).getAttribute("data-model")).toBe("unavailable");
  });

  it("says so when the browser cannot draw 3D, and still names its topics", () => {
    // jsdom has no WebGL, which is exactly the browser the note is for.
    renderView({ robotModel: { asset: async () => null, load: async () => null } });
    expect(screen.getByText("This browser cannot draw 3D.")).toBeTruthy();
    expect(screen.getByText(/markers \/goal_markers/)).toBeTruthy();
  });
});
