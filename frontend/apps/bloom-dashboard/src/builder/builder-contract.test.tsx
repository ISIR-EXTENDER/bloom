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

  it("refuses to shrink a widget below its kind's contract", () => {
    // Robin, 2026-09-23, on the minimums reading as absurd: the handle allowed 160x160 for a
    // joystick and the inspector then asked for 280x332. One table now answers both.
    render(<DraftCanvas source={bench} />);
    const handle = screen.getByRole("button", { name: "Resize Translation widget" });
    const frameOf = () => handle.closest("article") as HTMLElement;
    const pixels = (value: string) => Number.parseInt(value, 10);

    for (let step = 0; step < 40; step += 1) {
      fireEvent.keyDown(handle, { key: "ArrowLeft" });
      fireEvent.keyDown(handle, { key: "ArrowUp" });
    }

    expect(pixels(frameOf().style.width)).toBeGreaterThanOrEqual(280);
    expect(pixels(frameOf().style.height)).toBeGreaterThanOrEqual(332);
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

  it("offers STOP in the palette for a screen that has none, and places it", () => {
    // Robin, 2026-09-21: "je ne trouve pas le bouton stop dans le builder". 28 shipped screens carry
    // no stop region and nothing could put one back.
    const withoutStop: ScreenConfig = { ...bench, reserved_regions: [], widgets: [] };
    renderWorkspace(withoutStop);

    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add STOP" }));

    expect(screen.getByRole("button", { name: "Move the STOP region" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "STOP is already on this screen" })).toBeDisabled();
  });

  it("refuses to drop STOP on a control that is already there", () => {
    // Silently reserving the box under a control would leave that control unreachable in the
    // runtime, which draws STOP over it. The bench screen keeps the box clear by construction, so
    // this puts something in the corner on purpose.
    const covered: ScreenConfig = {
      ...bench,
      reserved_regions: [],
      widgets: [
        {
          ...(bench.widgets[0] as ScreenConfig["widgets"][number]),
          title: "Twist",
          layout: { x: 0, y: 0, width: 1280, height: 676 },
        },
      ],
    };
    renderWorkspace(covered);

    fireEvent.click(screen.getByRole("button", { name: "Add STOP" }));

    expect(screen.getByRole("alert").textContent).toContain("STOP would land on Twist");
    expect(screen.getByRole("button", { name: "Add STOP" })).toBeEnabled();
  });

  it("reports the screen's device class without offering to change it", () => {
    renderWorkspace(bench);

    // Not a control, and no longer shaped like one: showing both classes with one filled in read
    // as a switch, so it invited a click that could never do anything.
    expect(screen.queryByRole("button", { name: /Tablet 1280×720|Desktop 1920×1080/ })).toBeNull();
    expect(screen.getByText("Tablet 1280×720")).toBeTruthy();
    expect(screen.queryByText("Desktop 1920×1080")).toBeNull();
  });
});

describe("a draft while a save is in flight", () => {
  // The store replaces the configuration object when a save resolves, which ran the draft's reset
  // effect. Anything authored during the request was discarded, and the history went with it, so the
  // author could not even undo their way back to it.
  it("keeps an edit the author made while the request was out", () => {
    function Harness({ source }: { source: ScreenConfig }) {
      const draft = useBuilderScreenDraft(source);
      const target = bench.widgets[0];
      if (!target) {
        throw new Error("the bench fixture has no widget to nudge");
      }
      return (
        <div>
          <span data-testid="top">{draft.draftScreen.widgets[0]?.layout.y}</span>
          <span data-testid="dirty">{String(draft.isDirty)}</span>
          <button
            onClick={() =>
              draft.commitWidgetLayout(target.id, target.layout, {
                ...target.layout,
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

function renderWorkspace(source: ScreenConfig, overrides: { onBackToBuilderHome?: () => void } = {}) {
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
      onBackToBuilderHome={overrides.onBackToBuilderHome ?? vi.fn()}
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

describe("leaving the builder with unsaved work", () => {
  afterEach(cleanup);

  // The draft lives in the component. Navigating away took it with no trace, which is a bad way for
  // someone authoring without help to learn that Save was a step.
  it("asks before discarding a dirty draft, and stays when refused", () => {
    const onBackToBuilderHome = vi.fn();
    renderWorkspace(bench, { onBackToBuilderHome });
    fireEvent.keyDown(screen.getByRole("button", { name: "Select and move Max linear speed widget" }), {
      key: "ArrowDown",
      shiftKey: true,
    });

    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Builder home" }));
    expect(confirmed).toHaveBeenCalled();
    expect(onBackToBuilderHome).not.toHaveBeenCalled();

    confirmed.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Builder home" }));
    expect(onBackToBuilderHome).toHaveBeenCalled();
    confirmed.mockRestore();
  });

  it("does not ask when nothing is unsaved", () => {
    const onBackToBuilderHome = vi.fn();
    renderWorkspace(bench, { onBackToBuilderHome });

    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Builder home" }));

    expect(confirmed).not.toHaveBeenCalled();
    expect(onBackToBuilderHome).toHaveBeenCalled();
    confirmed.mockRestore();
  });
});
