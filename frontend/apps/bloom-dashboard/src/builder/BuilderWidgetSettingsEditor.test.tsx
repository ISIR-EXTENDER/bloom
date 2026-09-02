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
