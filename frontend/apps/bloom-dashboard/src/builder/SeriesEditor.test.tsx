/**
 * @vitest-environment jsdom
 */
import type { WidgetConfig } from "@bloom/api-client";
import { normalizeWidgetSettings } from "@bloom/widgets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
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
    <SeriesEditor
      onUpdateSettings={(next) => {
        const result = normalizeWidgetSettings("plot-board", next);
        if (!result.success) return result.errors.map((error) => error.message).join(" ");
        setSettings(result.settings);
        return null;
      }}
      widget={widget}
    />
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
});
