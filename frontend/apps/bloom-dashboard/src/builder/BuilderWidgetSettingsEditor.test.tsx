/**
 * @vitest-environment jsdom
 */
import type { WidgetConfig } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";

/**
 * The inspector has to answer "where does this widget publish" without the
 * reader knowing the runtime's precedence rules. It previously showed an
 * editable Output topic beside a runtime binding that overrode it, with nothing
 * indicating which won.
 */
function renderEditor(settings: Record<string, unknown>, kind = "slider") {
  const onUpdateSettings = vi.fn((_settings: Record<string, unknown>) => null);
  const widget = {
    id: "drive-z",
    kind,
    title: "Z",
    layout: { x: 0, y: 0, width: 100, height: 100 },
    settings,
  } as unknown as WidgetConfig;

  render(<BuilderWidgetSettingsEditor onUpdateSettings={onUpdateSettings} onUpdateTitle={vi.fn()} widget={widget} />);
  return onUpdateSettings;
}

const TELEOP_BINDING = {
  adapter: "teleop",
  axis_mapping: { value: { component: "linear_z" } },
  value_mapping: { target_topic: "/joystick_cartesian_command" },
};

describe("widget destination summary", () => {
  afterEach(cleanup);

  it("states the destination for a teleop widget", () => {
    renderEditor({ runtime_binding: TELEOP_BINDING });

    expect(screen.getByText("/joystick_cartesian_command")).toBeTruthy();
    expect(screen.getByText(/One axis of a twist several widgets share/)).toBeTruthy();
    expect(screen.getByText("Publishes to")).toBeTruthy();
  });

  it("says plainly when nothing is configured", () => {
    renderEditor({});

    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.getByText(/publishes nothing/)).toBeTruthy();
  });

  it("names the runtime binding as the source when it overrides Output topic", () => {
    renderEditor({
      topic: "/operator/typed/this",
      runtime_binding: { adapter: "topic", value_mapping: { target_topic: "/from/binding" } },
    });

    expect(screen.getByText("/from/binding")).toBeTruthy();
    expect(screen.getByText(/takes precedence over Output topic/)).toBeTruthy();
  });
});

describe("settings the runtime ignores", () => {
  afterEach(cleanup);

  it("hides an ignored field that is empty, since there is nothing to say", () => {
    renderEditor({ runtime_binding: TELEOP_BINDING });

    expect(screen.queryByLabelText("Output topic")).toBeNull();
    expect(screen.queryByDisplayValue("/operator/typed/this")).toBeNull();
  });

  it("keeps an ignored field visible while it holds a value, and explains why", () => {
    // A stale value that quietly does nothing is exactly what misleads the next
    // person to open this widget.
    renderEditor({ topic: "/operator/typed/this", runtime_binding: TELEOP_BINDING });

    const stale = screen.getByDisplayValue("/operator/typed/this");
    expect(stale.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/shared twist/)).toBeTruthy();
  });

  it("offers a way to clear a stale value", () => {
    const onUpdateSettings = renderEditor({
      topic: "/operator/typed/this",
      runtime_binding: TELEOP_BINDING,
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear it" }));

    expect(onUpdateSettings).toHaveBeenCalled();
    const nextSettings = onUpdateSettings.mock.calls[0][0] as Record<string, unknown>;
    expect(nextSettings.topic).toBe("");
  });

  it("leaves fields the runtime does use fully editable", () => {
    renderEditor({ topic: "/cmd/max_velocity", messageType: "std_msgs/msg/Float64", runtime_binding: {} });

    const editable = screen.getByDisplayValue("/cmd/max_velocity");
    expect(editable.hasAttribute("disabled")).toBe(false);
  });
});

describe("reading widgets in the inspector", () => {
  afterEach(cleanup);

  it("says a topic echo reads, never that it publishes", () => {
    renderEditor({ topic: "/joystick_cartesian_command" }, "topic-echo");

    expect(screen.getByText("Reads from")).toBeTruthy();
    expect(screen.queryByText("Publishes to")).toBeNull();
  });

  it("shows no destination panel for a widget whose flow is not modelled", () => {
    renderEditor({ topic: "/image_raw" }, "camera");

    expect(screen.queryByText("Reads from")).toBeNull();
    expect(screen.queryByText("Publishes to")).toBeNull();
  });
});

describe("slider step follows the range", () => {
  afterEach(cleanup);

  it("retunes step to ~20 increments when maximum changes", () => {
    const onUpdateSettings = renderEditor({ direction: "vertical", max: 1, min: -1, step: 0.01 });

    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "9" } });

    expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ max: 9, min: -1, step: 0.5 }));
  });

  it("retunes step when minimum changes too", () => {
    const onUpdateSettings = renderEditor({ direction: "vertical", max: 1, min: -1, step: 0.1 });

    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "0" } });

    expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ max: 1, min: 0, step: 0.05 }));
  });

  it("leaves a hand-tuned step alone when only the step field is edited", () => {
    const onUpdateSettings = renderEditor({ direction: "vertical", max: 1, min: -1, step: 0.05 });

    fireEvent.change(screen.getByLabelText("Step"), { target: { value: "0.25" } });

    expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ max: 1, min: -1, step: 0.25 }));
  });

  it("keeps retuning while the author types through intermediate ranges", () => {
    // An emptied number field coerces to 0, which is a real range.
    const onUpdateSettings = renderEditor({ direction: "vertical", max: 1, min: -1, step: 0.1 });

    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "" } });

    expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ max: 0, min: -1, step: 0.05 }));
  });
});

describe("editing values mid-way", () => {
  afterEach(cleanup);

  it("keeps half-typed JSON instead of snapping back to the saved value", () => {
    renderEditor({ direction: "vertical", max: 1, min: -1, runtime_binding: TELEOP_BINDING, step: 0.1 });
    const field = screen.getByLabelText("Runtime binding") as HTMLTextAreaElement;
    const halfTyped = `${field.value.slice(0, -2)},\n  "axis_deadzone": `;

    fireEvent.change(field, { target: { value: halfTyped } });

    expect(field.value).toBe(halfTyped);
  });

  it("unsets an emptied optional number instead of storing 0", () => {
    const onUpdateSettings = renderEditor({ fieldPath: "x", topic: "/t", yMax: 2, yMin: 1 }, "topic-plot");

    fireEvent.change(screen.getByLabelText("Y minimum"), { target: { value: "" } });

    const saved = onUpdateSettings.mock.calls.at(-1)?.[0] ?? {};
    expect("yMin" in saved).toBe(false);
    expect(saved.yMax).toBe(2);
  });
});

describe("the on-glass size summary", () => {
  afterEach(cleanup);

  function renderWithCanvas(kind: string, layout: { width: number; height: number }) {
    const widget = {
      id: "probe",
      kind,
      title: "Probe",
      layout: { x: 0, y: 0, ...layout },
      settings: {},
    } as unknown as WidgetConfig;
    render(
      <BuilderWidgetSettingsEditor
        canvas={{ preset_id: "native-1280x720", runtime_mode: "fit" }}
        onUpdateSettings={vi.fn(() => null)}
        onUpdateTitle={vi.fn()}
        widget={widget}
      />,
    );
  }

  it("states what the authored size becomes on the panel", () => {
    // 1280x720 fits 1024x600 at 0.8, times the 0.99 overflow guard.
    renderWithCanvas("toggle", { width: 130, height: 130 });

    expect(screen.getByText("103 × 103 px")).toBeTruthy();
  });

  it("flags an interactive control that lands under the 44px touch floor", () => {
    renderWithCanvas("toggle", { width: 50, height: 50 });

    expect(screen.getByRole("alert").textContent).toContain("44px touch floor");
  });

  it("does not flag display widgets, which nobody has to hit", () => {
    renderWithCanvas("label", { width: 30, height: 20 });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a JSON settings field mid-typing", () => {
  // A permissive field takes whatever JSON.parse cannot read as a plain string, so committing every
  // keystroke replaced an object with something like '{"a": '. The backend accepts it and the runtime
  // then publishes a string where an object belongs.
  it("keeps the half-typed text on screen without applying it", () => {
    const onUpdateSettings = renderEditor({ payload: { a: 1 } }, "command-button");

    const field = screen.getByLabelText(/payload/i);
    fireEvent.change(field, { target: { value: '{"a": ' } });

    expect((field as HTMLTextAreaElement).value).toBe('{"a": ');
    expect(screen.getByText("Not valid JSON yet, so it has not been applied.")).toBeTruthy();
    expect(onUpdateSettings).not.toHaveBeenCalled();
  });

  it("applies it once it parses", () => {
    const onUpdateSettings = renderEditor({ payload: { a: 1 } }, "command-button");

    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: '{"a": 2}' } });

    expect(onUpdateSettings).toHaveBeenCalled();
    expect(screen.queryByText("Not valid JSON yet, so it has not been applied.")).toBeNull();
  });
});
