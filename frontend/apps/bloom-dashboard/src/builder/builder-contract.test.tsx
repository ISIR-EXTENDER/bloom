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
    expect(within(frame).getByText("202×96 · 44 px glass")).toBeTruthy();
    expect(
      within(frame)
        .getByText(/px glass/)
        .getAttribute("data-inside"),
    ).toBe("true");
    // Robin, 2026-09-21: "je ne trouve pas le bouton stop dans le builder". There is no STOP to place;
    // the region has to say that where the author is looking for one.
    // Placed, never removed: on a bare canvas with no move handler it is still just a note.
    expect(screen.getByRole("note").textContent).toBe("STOP · drawn by the runtime, placed here");
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

    // From 928,134 down into STOP at 928,410.
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 300 });
    fireEvent.pointerUp(window);

    expect(onPreviewWidgetLayout).not.toHaveBeenCalled();
    const [, start, final] = onCommitWidgetLayout.mock.calls[0] ?? [];
    expect(final).toEqual(start);
  });

  it.each([
    ["Select and move Max linear speed widget", { clientX: 0, clientY: 96 }, "top", "134px"],
    // The card now ends flush with the STOP region, so the legal preview is a shrink.
    ["Resize Max angular speed widget", { clientX: 0, clientY: -8 }, "height", "132px"],
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
  it("stops following the pointer when the browser cancels the gesture", () => {
    render(<DraftCanvas source={bench} />);
    const handle = screen.getByRole("button", { name: "Select and move Max linear speed widget" });
    const frameOf = () => handle.closest("article") as HTMLElement;
    const start = frameOf().style.top;

    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 48 });
    fireEvent.pointerCancel(window);
    // A scroll on the tablet ends the drag here; nothing is being held any more.
    fireEvent.pointerMove(window, { clientX: 0, clientY: 96 });

    expect(frameOf().style.top).toBe(start);
    expect(document.body.style.cursor).not.toBe("grabbing");
  });

  // A widget closer to the edge than its kind's minimum: the clamp's lower bound wins and the resize
  // jumps straight past the canvas. The inspector refuses the identical layout, and the backend has no
  // upper bound, so a save persisted a widget hanging off the artboard.
  it("refuses a resize that would run past the artboard, as the inspector does", () => {
    const edged: ScreenConfig = {
      ...bench,
      reserved_regions: [],
      widgets: [
        {
          ...(bench.widgets[0] as ScreenConfig["widgets"][number]),
          layout: { x: 1190, y: 100, width: 70, height: 58 },
        },
      ],
    };
    render(<DraftCanvas source={edged} />);
    const handle = screen.getAllByRole("button", { name: /^Resize / })[0] as HTMLElement;
    const frameOf = () => handle.closest("article") as HTMLElement;
    const before = frameOf().style.width;

    fireEvent.keyDown(handle, { key: "ArrowRight" });

    const right = 1190 + Number.parseInt(frameOf().style.width, 10);
    expect(right).toBeLessThanOrEqual(1280);
    expect(frameOf().style.width).toBe(before);
  });

  it("moves and resizes the selection from the keyboard", () => {
    render(<DraftCanvas source={bench} />);
    const frameOf = () =>
      screen.getByRole("button", { name: "Select and move Max linear speed widget" }).closest("article") as HTMLElement;

    const pixels = (value: string) => Number.parseInt(value, 10);
    const startTop = pixels(frameOf().style.top);
    const startWidth = pixels(frameOf().style.width);

    // Layouts snap to the grid, so the step is a direction, not an exact pixel count.
    fireEvent.keyDown(screen.getByRole("button", { name: "Select and move Max linear speed widget" }), {
      key: "ArrowDown",
      shiftKey: true,
    });
    expect(pixels(frameOf().style.top)).toBeGreaterThan(startTop);

    fireEvent.keyDown(screen.getByRole("button", { name: "Resize Max linear speed widget" }), { key: "ArrowRight" });
    expect(pixels(frameOf().style.width)).toBeGreaterThan(startWidth);
  });
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

  it.each([
    ["drive-max-angular-speed", { y: 286, height: 110 }, "Max angular speed", "reach into the reserved STOP region"],
    ["drive-rz", {}, "Pivot", "run past the 1280×676 canvas"],
  ])("explains instead of resizing %s where the minimum would not fit", (id, move, title, reason) => {
    const detailed = {
      ...bench,
      widgets: bench.widgets.map((widget) =>
        widget.id === id
          ? { ...widget, layout: { ...widget.layout, ...move }, settings: { ...widget.settings, show_details: true } }
          : widget,
      ),
    };
    const { container } = renderWorkspace(detailed);
    fireEvent.click(screen.getByRole("button", { name: `Select and move ${title} widget` }));
    const before = container.querySelector(`[aria-label="${title} slider widget"]`)?.getAttribute("style");

    fireEvent.click(screen.getByRole("button", { name: /^Resize to / }));

    expect(screen.getByRole("alert").textContent).toContain(reason);
    expect(container.querySelector(`[aria-label="${title} slider widget"]`)?.getAttribute("style")).toBe(before);
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
  });

  it("duplicates a widget beside STOP to a place inside the canvas and clear of it", () => {
    const { container } = renderWorkspace(bench);
    fireEvent.click(screen.getByRole("button", { name: "Select and move Max angular speed widget" }));

    fireEvent.click(screen.getByRole("button", { name: "Duplicate widget" }));

    expect(screen.getByRole("heading", { level: 2, name: "Max angular speed copy" })).toBeTruthy();
    const copy = container.querySelector<HTMLElement>('[aria-label="Max angular speed copy slider widget"]');
    expect([copy?.style.left, copy?.style.top]).toEqual(["0px", "326px"]);
  });

  it("reports the screen's device class without offering to change it", () => {
    renderWorkspace(bench);

    expect(screen.queryByRole("button", { name: /Tablet 1280×720|Desktop 1920×1080/ })).toBeNull();
    const current = screen.getByText("Tablet 1280×720");
    expect(current.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Desktop 1920×1080").getAttribute("aria-current")).toBeNull();
  });
});

describe("a draft while a save is in flight", () => {
  // The store replaces the configuration object when a save resolves, which ran the draft's reset
  // effect. Anything authored during the request was discarded, and the history went with it, so the
  // author could not even undo their way back to it.
  it("keeps an edit the author made while the request was out", () => {
    function Harness({ source }: { source: ScreenConfig }) {
      const draft = useBuilderScreenDraft(source);
      return (
        <div>
          <span data-testid="top">{draft.draftScreen.widgets[0]?.layout.y}</span>
          <span data-testid="dirty">{String(draft.isDirty)}</span>
          <button
            onClick={() =>
              draft.commitWidgetLayout(bench.widgets[0]!.id, bench.widgets[0]!.layout, {
                ...bench.widgets[0]!.layout,
                y: 168,
              })
            }
            type="button"
          >
            nudge
          </button>
        </div>
      );
    }

    const { rerender } = render(<Harness source={bench} />);
    fireEvent.click(screen.getByRole("button", { name: "nudge" }));
    expect(screen.getByTestId("top").textContent).toBe("168");

    // The save resolves: same screen, new object, still carrying the pre-edit geometry.
    rerender(<Harness source={structuredClone(bench)} />);

    expect(screen.getByTestId("top").textContent).toBe("168");
    expect(screen.getByTestId("dirty").textContent).toBe("true");
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

describe("the STOP region in the builder", () => {
  afterEach(cleanup);

  // Susana, 2026-09-22: STOP has to be available in the builder. It is placed, never removed: every
  // screen keeps exactly one, and a screen without the region is not a screen without STOP -- the
  // runtime floats it in a corner over whatever is underneath.
  it("moves from the keyboard and refuses to cover a control", () => {
    renderWorkspace(bench);
    const regionAt = () => screen.getByRole("button", { name: "Move the STOP region" }) as HTMLElement;
    const top = () => Number.parseInt(regionAt().style.top, 10);
    const startTop = top();

    // The bench rail boxes STOP in: the stage to its left, the speed card flush above it, the artboard
    // below. Down is the one direction with room, and it clamps at the edge rather than leaving it.
    fireEvent.keyDown(regionAt(), { key: "ArrowDown", shiftKey: true });
    expect(top()).toBeGreaterThan(startTop);

    // Left is the stage, where the controls are. STOP is drawn above everything, so it must not be
    // placed over one: a control under it can be pressed nowhere.
    fireEvent.keyDown(regionAt(), { key: "ArrowLeft", shiftKey: true });

    expect(screen.getByRole("alert").textContent).toContain("STOP cannot go there");
  });
});
