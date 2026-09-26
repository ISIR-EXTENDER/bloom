/**
 * @vitest-environment jsdom
 */
import type { WidgetConfig } from "@bloom/api-client";
import { normalizeWidgetSettings } from "@bloom/widgets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeriesEditor } from "./SeriesEditor";

const HAND_Z = { topic: "/ee_pose", field_path: "pose.position.z", label: "Hand z", unit: "m", enabled: true };

// Applies an edit only when the widget contract accepts it, as the builder workspace does.
function Harness({ series }: { series: Record<string, unknown>[] }) {
  const [settings, setSettings] = useState<Record<string, unknown>>({ series });
  const widget = {
    id: "board",
    kind: "plot-board",
    title: "Board",
    layout: { x: 0, y: 0, width: 100, height: 100 },
    settings,
  } as unknown as WidgetConfig;
  return (
    <>
      <SeriesEditor
        onUpdateSettings={(next) => {
          const result = normalizeWidgetSettings("plot-board", next);
          if (!result.success) return result.errors.map((error) => error.message).join(" ");
          setSettings(result.settings);
          return null;
        }}
        widget={widget}
      />
      <button onClick={() => setSettings({ series: [] })} type="button">
        Undo from outside
      </button>
    </>
  );
}

describe("the series editor", () => {
  afterEach(cleanup);

  // Clearing a topic snapped back, since validation wanted every row complete.
  it("lets a topic be cleared, and says the row is not plotted", () => {
    render(<Harness series={[HAND_Z]} />);
    const topic = screen.getByLabelText("Topic") as HTMLInputElement;

    fireEvent.change(topic, { target: { value: "" } });
    expect(topic.value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("Not plotted. Needs a topic starting with /.");
  });

  // Past the six built-in choices the new row is empty, and the refusal dropped it without a word.
  it("adds an empty row once every built-in series is taken", () => {
    render(<Harness series={[HAND_Z]} />);
    const add = screen.getByRole("button", { name: "Add series" });
    for (let count = 0; count < 6; count += 1) fireEvent.click(add);

    expect(screen.getAllByLabelText("Topic")).toHaveLength(7);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses a topic without a leading slash and says why", () => {
    render(<Harness series={[HAND_Z]} />);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "ee_pose" } });

    expect((screen.getByLabelText("Topic") as HTMLInputElement).value).toBe("/ee_pose");
    expect(screen.getByRole("alert").textContent).toContain("a topic starts with /");
  });

  // The refusal outlived an Undo that took the series somewhere else entirely.
  it("drops the refusal when the series changes from outside", () => {
    render(<Harness series={[HAND_Z]} />);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "ee_pose" } });
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo from outside" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the series editor's undo steps", () => {
  afterEach(cleanup);

  // Every keystroke of a typed topic was its own undo step.
  it("keys each row's typed field so its keystrokes coalesce, and a checkbox stands alone", () => {
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>, _title?: string, _key?: string) => null);
    const widget = {
      id: "board",
      kind: "plot-board",
      title: "Board",
      layout: { x: 0, y: 0, width: 100, height: 100 },
      settings: { series: [HAND_Z, { ...HAND_Z, field_path: "pose.position.x" }] },
    } as unknown as WidgetConfig;
    render(<SeriesEditor onUpdateSettings={onUpdateSettings} widget={widget} />);

    const topics = screen.getAllByLabelText("Topic");
    fireEvent.change(topics[0] as HTMLElement, { target: { value: "/ee_pos" } });
    fireEvent.change(topics[1] as HTMLElement, { target: { value: "/ee_pos" } });
    fireEvent.click(screen.getAllByLabelText("Shown")[0] as HTMLElement);

    expect(onUpdateSettings.mock.calls.map((call) => call[2])).toEqual(["series:0:topic", "series:1:topic", undefined]);
  });
});
