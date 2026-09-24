/**
 * @vitest-environment jsdom
 */
import type { RuntimeCapability } from "@bloom/api-client";
import { createDefaultWidgetRegistry } from "@bloom/widgets";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderInspector } from "./BuilderInspector";

/**
 * A colleague reviewing Bloom pointed out that the palette should only offer
 * widgets with a real connection behind them. Without ROS attached a joystick
 * places happily and moves nothing, and a plot waits forever on a sample that
 * cannot come.
 */
const WITHOUT_ROS: RuntimeCapability[] = [
  { id: "command-dispatcher", available: false, detail: "" },
  { id: "data-source", available: false, detail: "" },
  { id: "teleop-adapter", available: false, detail: "" },
];
const WITH_ROS: RuntimeCapability[] = WITHOUT_ROS.map((capability) => ({ ...capability, available: true }));

function renderPalette(capabilities: readonly RuntimeCapability[] | null, deviceClass?: "desktop" | "tablet") {
  render(
    <BuilderInspector
      deviceClass={deviceClass}
      availableWidgetDefinitions={Array.from(createDefaultWidgetRegistry().values()).filter(
        (definition) => definition.kind !== "unknown",
      )}
      runtimeCapabilities={capabilities}
      onAddWidget={vi.fn()}
      onDuplicateWidget={vi.fn()}
      onRemoveWidget={vi.fn()}
      onSelectWidget={vi.fn()}
      onUpdateWidgetSettings={vi.fn(() => null)}
      onUpdateWidgetTitle={vi.fn()}
      selectedWidget={null}
      widgets={[]}
      widgetCount={0}
    />,
  );
}

const paletteButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^Add ${name} widget`) });

describe("with no ROS attached", () => {
  afterEach(cleanup);

  it("marks a joystick as not connected and says what it needs", () => {
    renderPalette(WITHOUT_ROS);

    const button = paletteButton("Joystick");
    expect(button.getAttribute("data-readiness")).toBe("unavailable");
    expect(button.getAttribute("aria-label")).toMatch(/teleop connection/);
  });

  it("still offers it, because screens get built before the robot is on", () => {
    renderPalette(WITHOUT_ROS);

    expect(paletteButton("Joystick")).toBeTruthy();
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
  });

  it("leaves widgets that need no backend alone", () => {
    renderPalette(WITHOUT_ROS);

    for (const name of ["Label", "Camera"]) {
      expect(paletteButton(name).getAttribute("data-readiness")).toBeNull();
    }
  });
});

describe("with ROS attached", () => {
  afterEach(cleanup);

  it("flags nothing as disconnected", () => {
    renderPalette(WITH_ROS);

    expect(screen.queryByText("Not connected")).toBeNull();
  });

  it("refuses the 3D robot view on a tablet screen, and says why", () => {
    renderPalette(WITH_ROS, "tablet");

    const button = paletteButton("3D robot view");
    expect(button.getAttribute("data-readiness")).toBe("unavailable");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-label")).toMatch(/Desktop screens only/);
    expect(paletteButton("Joystick").hasAttribute("disabled")).toBe(false);
  });

  it("offers the 3D robot view on a desktop screen", () => {
    renderPalette(WITH_ROS, "desktop");

    expect(paletteButton("3D robot view").hasAttribute("disabled")).toBe(false);
  });

  it("marks the 3D robot view ready now that the API serves the robot's own description", () => {
    // A palette without a class is a tablet screen's; the view is ready where it belongs.
    renderPalette(WITH_ROS, "desktop");

    // A ready card carries no readiness badge at all.
    expect(paletteButton("3D robot view").getAttribute("data-readiness")).toBeNull();
  });
});

describe("before the backend has answered", () => {
  afterEach(cleanup);

  it("does not accuse any widget of being broken", () => {
    renderPalette(null);

    expect(screen.queryByText("Not connected")).toBeNull();
    expect(paletteButton("Joystick").getAttribute("data-readiness")).toBe("unknown");
  });
});

describe("how the palette is grouped", () => {
  afterEach(cleanup);

  it("puts every offered widget under a heading, so none can go missing", () => {
    // The headings are a hand-written list. A widget whose category is not on it would vanish from
    // the palette without a word, which is exactly the failure this grouping was meant to end.
    const offered = Array.from(createDefaultWidgetRegistry().values()).filter(
      (definition) => definition.availability.editor && definition.kind !== "unknown",
    );
    renderPalette(WITH_ROS);

    for (const definition of offered) {
      expect(paletteButton(definition.displayName), definition.kind).toBeTruthy();
    }
  });

  it("names the groups in the order someone builds a screen", () => {
    renderPalette(WITH_ROS);

    const headings = screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent);

    expect(headings).toEqual(["Drive the robot", "Send a command", "See what it is doing", "Read the data", "Devices"]);
  });
});
