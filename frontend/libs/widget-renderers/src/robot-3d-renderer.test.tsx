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
  canvas: { preset_id: "full-hd", runtime_mode: "fit" },
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
  it("says whether the runtime is driving, from the twist it carries", () => {
    const descriptor = renderScreenDescriptors(robotScreen, createDefaultWidgetRegistry())[0];
    if (descriptor?.status !== "resolved") {
      throw new Error("the fixture did not resolve");
    }
    const { rerender } = render(
      renderWidgetDescriptor(descriptor, {
        dataByWidgetId: {
          view: {
            receivedAt: "t",
            topic: "/joint_states",
            type: "robot-3d",
            value: undefined,
            command: { angular: { x: 0, y: 0, z: 0 }, linear: { x: 0, y: 0.8, z: 0 } },
          },
        },
      }),
    );
    expect(screen.getByRole("img", { name: "Robot 3D view" }).getAttribute("data-command")).toBe("moving");
    rerender(renderWidgetDescriptor(descriptor, {}));
    expect(screen.getByRole("img", { name: "Robot 3D view" }).getAttribute("data-command")).toBe("still");
  });

  it("draws nothing on a tablet-class screen, whatever the runtime offers", () => {
    const tabletScreen: ScreenConfig = {
      ...robotScreen,
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
    };
    const descriptor = renderScreenDescriptors(tabletScreen, createDefaultWidgetRegistry())[0];
    if (descriptor?.status !== "resolved") {
      throw new Error("the fixture did not resolve");
    }
    render(renderWidgetDescriptor(descriptor, { robotModel: { asset: async () => null, load: async () => null } }));
    expect(screen.getByText("Desktop screens only.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Robot 3D view" }).getAttribute("data-model")).toBe("unavailable");
  });

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
