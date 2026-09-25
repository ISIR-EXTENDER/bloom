/**
 * @vitest-environment jsdom
 */
import { createDefaultWidgetRegistry } from "@bloom/widgets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderInspector, matchesSearch } from "./BuilderInspector";

// Robin looked for the 3D view in a palette of twenty widgets and did not find it.
function renderPalette() {
  render(
    <BuilderInspector
      availableWidgetDefinitions={Array.from(createDefaultWidgetRegistry().values()).filter(
        (definition) => definition.kind !== "unknown",
      )}
      deviceClass="desktop"
      hasStopRegion={false}
      onAddStopRegion={vi.fn()}
      onAddWidget={vi.fn()}
      onDuplicateWidget={vi.fn()}
      onRemoveWidget={vi.fn()}
      onSelectWidget={vi.fn()}
      onUpdateWidgetSettings={vi.fn(() => null)}
      onUpdateWidgetTitle={vi.fn()}
      runtimeCapabilities={null}
      selectedWidget={null}
      widgets={[]}
      widgetCount={0}
    />,
  );
}

const search = (text: string) => fireEvent.change(screen.getByLabelText("Search widgets"), { target: { value: text } });
const addButtons = () => screen.queryAllByRole("button", { name: /^Add / });

describe("searching the widget palette", () => {
  afterEach(cleanup);

  it("finds the 3D view by what someone would type", () => {
    renderPalette();
    const everything = addButtons().length;

    search("3d");

    expect(addButtons().length).toBeLessThan(everything);
    expect(screen.getByRole("button", { name: /^Add 3D robot view widget/ })).toBeTruthy();
  });

  it("keeps STOP findable", () => {
    renderPalette();

    search("stop");

    expect(screen.getByRole("button", { name: "Add STOP" })).toBeTruthy();
  });

  it("says so when nothing matches", () => {
    renderPalette();

    search("zzzz");

    expect(addButtons()).toHaveLength(0);
    expect(screen.getByText(/No widget matches/)).toBeTruthy();
  });

  it("ignores case and accents, and needs every word", () => {
    expect(matchesSearch(["camera"], ["Caméra"])).toBe(true);
    expect(matchesSearch(["robot", "3d"], ["Robot 3D view"])).toBe(true);
    expect(matchesSearch(["robot", "plot"], ["Robot 3D view"])).toBe(false);
  });
});
