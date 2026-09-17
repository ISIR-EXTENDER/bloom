/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ConfigurationBundle, ScreenConfig } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderInspector } from "./BuilderInspector";
import { BuilderWorkspace } from "./BuilderWorkspace";
import { useBuilderScreenDraft } from "./useBuilderScreenDraft";

const explorer = (structuredClone(explorerManagerConfiguration) as unknown as ConfigurationBundle)
  .applications[0] as ApplicationConfig;
const bench = explorer.screens.find((candidate) => candidate.id === "manager_drive_bench") as ScreenConfig;
const shrunkGripper = {
  ...bench,
  widgets: bench.widgets.map((widget) =>
    widget.id === "drive-gripper" ? { ...widget, layout: { ...widget.layout, height: 96, width: 202 } } : widget,
  ),
};
const gripper = shrunkGripper.widgets.find((widget) => widget.id === "drive-gripper");

describe("the builder canvas", () => {
  afterEach(cleanup);

  it("tags an undersized widget, draws reserved regions, and chips the selection with its glass size", () => {
    render(
      <BuilderCanvas
        onCommitWidgetLayout={vi.fn()}
        onPreviewWidgetLayout={vi.fn()}
        onSelectWidget={vi.fn()}
        screen={shrunkGripper}
        selectedWidgetId="drive-gripper"
      />,
    );

    const frame = screen.getByRole("article", { name: "Gripper toggle widget" });
    expect(within(frame).getByText("Too small")).toBeTruthy();
    expect(within(frame).getByText("202×96 · 45 px glass")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toBe("Reserved STOP");
  });

  it("refuses a move into a reserved region", () => {
    const onCommitWidgetLayout = vi.fn();
    const onPreviewWidgetLayout = vi.fn();
    render(
      <BuilderCanvas
        onCommitWidgetLayout={onCommitWidgetLayout}
        onPreviewWidgetLayout={onPreviewWidgetLayout}
        onSelectWidget={vi.fn()}
        screen={bench}
        selectedWidgetId={null}
      />,
    );
    const handle = screen.getByRole("button", { name: "Select and move Max linear speed widget" });

    // From 928,146 down into STOP at 928,410.
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 300 });
    fireEvent.pointerUp(window);

    expect(onPreviewWidgetLayout).not.toHaveBeenCalled();
    const [, start, final] = onCommitWidgetLayout.mock.calls[0] ?? [];
    expect(final).toEqual(start);
  });

  it.each([
    ["Select and move Max linear speed widget", { clientX: 0, clientY: 96 }, "top", "146px"],
    ["Resize Max angular speed widget", { clientX: 0, clientY: 8 }, "height", "120px"],
  ] as const)(
    "puts a refused %s back where it started, not at its last legal preview",
    (name, legal, property, start) => {
      render(<DraftCanvas source={bench} />);
      const frameOf = () => screen.getByRole("button", { name }).closest("article") as HTMLElement;

      fireEvent.pointerDown(screen.getByRole("button", { name }), { button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(window, legal);
      expect(frameOf().style[property]).not.toBe(start);
      fireEvent.pointerMove(window, { clientX: 0, clientY: 300 });
      fireEvent.pointerUp(window);

      expect(frameOf().style[property]).toBe(start);
      expect(screen.getByTestId("can-undo").textContent).toBe("false");
    },
  );
});

describe("the builder workspace", () => {
  afterEach(cleanup);

  it("refuses to add a widget when nothing on the canvas is clear of the reserved regions", () => {
    const walled: ScreenConfig = {
      ...bench,
      reserved_regions: [{ id: "wall", owner: "runtime-chrome", x: 0, y: 0, width: 1280, height: 676 }],
    };
    renderWorkspace(walled);

    fireEvent.click(screen.getByRole("button", { name: /^Add Label widget/ }));

    expect(screen.getByRole("alert").textContent).toContain("A Label does not fit anywhere on this canvas");
    expect(screen.queryByRole("article", { name: "Label label widget" })).toBeNull();
  });
});

function renderWorkspace(source: ScreenConfig) {
  const application = { ...explorer, screens: [source] };
  return render(
    <BuilderWorkspace
      configurations={[
        {
          id: "explorer-manager",
          bundle: { ...(explorerManagerConfiguration as unknown as ConfigurationBundle), applications: [application] },
        },
      ]}
      onBackToAppConfig={vi.fn()}
      onBackToBuilderHome={vi.fn()}
      onSaveScreenDraft={vi.fn()}
      runtimeCapabilities={null}
      selection={{ appId: application.id, configId: "explorer-manager", screenId: source.id }}
    />,
  );
}

function DraftCanvas({ source }: { source: ScreenConfig }) {
  const draft = useBuilderScreenDraft(source);
  return (
    <>
      <BuilderCanvas
        onCommitWidgetLayout={draft.commitWidgetLayout}
        onPreviewWidgetLayout={draft.previewWidgetLayout}
        onSelectWidget={() => undefined}
        screen={draft.draftScreen}
        selectedWidgetId={null}
      />
      <output data-testid="can-undo">{String(draft.canUndo)}</output>
    </>
  );
}

describe("the builder inspector", () => {
  afterEach(cleanup);

  it("explains a shortfall, offers the exact resize, and marks glass below the touch floor", () => {
    if (!gripper) throw new Error("Missing gripper.");
    const onResizeWidget = vi.fn();
    const { container } = render(
      <BuilderInspector
        availableWidgetDefinitions={[]}
        glassScale={0.7}
        onAddWidget={vi.fn()}
        onDuplicateWidget={vi.fn()}
        onRemoveWidget={vi.fn()}
        onResizeWidget={onResizeWidget}
        onSelectWidget={vi.fn()}
        onUpdateWidgetSettings={vi.fn(() => null)}
        onUpdateWidgetTitle={vi.fn()}
        runtimeCapabilities={null}
        selectedWidget={gripper}
        widgetCount={shrunkGripper.widgets.length}
        widgets={shrunkGripper.widgets}
      />,
    );

    expect(screen.getByRole("region", { name: "Below minimum size" }).textContent).toContain("needs 200×120");
    fireEvent.click(screen.getByRole("button", { name: "Resize to 202×120" }));
    expect(onResizeWidget).toHaveBeenCalledWith("drive-gripper", { ...gripper.layout, height: 120 });

    const glass = [...container.querySelectorAll(".builder-inspector-grid div")].find((cell) =>
      cell.textContent?.startsWith("Glass at fit 0.70"),
    );
    expect(glass?.getAttribute("data-error")).toBe("true");
    expect(glass?.textContent).toContain("39 px");
    expect(screen.getAllByText("Too small")).toHaveLength(1);
  });
});
