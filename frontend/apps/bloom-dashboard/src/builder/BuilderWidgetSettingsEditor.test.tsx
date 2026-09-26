/**
 * @vitest-environment jsdom
 */
import type { CanvasSettings, RuntimeActionPreset, WidgetConfig } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";
import { densityFloorFor, resolveBuilderPanel } from "./builder-geometry";

/**
 * The inspector has to answer "where does this widget publish" without the
 * reader knowing the runtime's precedence rules. It previously showed an
 * editable Output topic beside a runtime binding that overrode it, with nothing
 * indicating which won.
 */
function renderEditor(settings: Record<string, unknown>, kind = "slider", allowedTeleopTargets?: string[]) {
  const onUpdateSettings = vi.fn((_settings: Record<string, unknown>) => null);
  const widget = {
    id: "drive-z",
    kind,
    title: "Z",
    layout: { x: 0, y: 0, width: 100, height: 100 },
    settings,
  } as unknown as WidgetConfig;

  render(
    <BuilderWidgetSettingsEditor
      allowedTeleopTargets={allowedTeleopTargets}
      onUpdateSettings={onUpdateSettings}
      onUpdateTitle={vi.fn()}
      widget={widget}
    />,
  );
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

  it("asks nothing about a command button's action contract, which nothing reads", () => {
    // `action_feedback` and `cancellable` were required, so every command button asked an author two
    // questions with no consequence: the contract they feed is built and never read back.
    renderEditor({ command: "explorer.deploy" }, "command-button");

    expect(screen.queryByLabelText("Action feedback")).toBeNull();
    expect(screen.queryByText("Cancellable")).toBeNull();
  });

  it("says so when a shipped app promised a behaviour that contract cannot give", () => {
    // explorer-user-tests has seven buttons declaring themselves cancellable, including "Deploy
    // robot". Nothing cancels them, and hiding that would leave the promise standing.
    renderEditor({ command: "explorer.deploy", cancellable: true }, "command-button");

    expect(screen.getByText(/no progress or cancel surface/)).toBeTruthy();
  });

  it("offers a frame only on a pad that turns the hand, since only rotation is rotated", () => {
    // Robin, 2026-09-23: "est-il possible de rendre paramétrable le frame_id du message twist ?"
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>) => null);
    const widget = {
      id: "tilt",
      kind: "joystick",
      title: "Rotation",
      layout: { x: 0, y: 0, width: 320, height: 400 },
      settings: {
        runtime_binding: {
          adapter: "teleop",
          axis_mapping: { x: { component: "angular_x" }, y: { component: "angular_y" } },
          value_mapping: { target_topic: "/joystick_cartesian_command" },
        },
      },
    } as unknown as WidgetConfig;

    render(
      <BuilderWidgetSettingsEditor
        allowedCommandFrameIds={["base_link", "effector_frame"]}
        onUpdateSettings={onUpdateSettings}
        onUpdateTitle={vi.fn()}
        widget={widget}
      />,
    );
    fireEvent.change(screen.getByLabelText("Turns in"), { target: { value: "effector_frame" } });

    const next = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect((next.runtime_binding as Record<string, Record<string, unknown>>).value_mapping.frame_id).toBe(
      "effector_frame",
    );
  });

  it("lets the author name the topic a pad publishes to", () => {
    // Robin, 2026-09-24: "est-il possible de rendre paramétrable le nom du topic utilisé ?"
    const onUpdateSettings = renderEditor({ runtime_binding: TELEOP_BINDING }, "slider", [
      "/joystick_cartesian_command",
      "/other_cartesian_command",
    ]);
    const topic = screen.getByLabelText("Topic") as HTMLInputElement;
    expect(topic.value).toBe("/joystick_cartesian_command");

    fireEvent.change(topic, { target: { value: "/other_cartesian_command" } });
    const next = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect((next.runtime_binding as Record<string, Record<string, unknown>>).value_mapping.target_topic).toBe(
      "/other_cartesian_command",
    );

    fireEvent.change(topic, { target: { value: "" } });
    const cleared = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(
      (cleared.runtime_binding as Record<string, Record<string, unknown>>).value_mapping.target_topic,
    ).toBeUndefined();
  });

  it("keeps the frame out of a pad that only translates", () => {
    renderEditor(
      {
        runtime_binding: {
          adapter: "teleop",
          axis_mapping: { value: { component: "linear_z" } },
          value_mapping: { target_topic: "/joystick_cartesian_command" },
        },
      },
      "slider",
    );

    expect(screen.queryByLabelText("Turns in")).toBeNull();
  });

  it("names a teleop target this app will refuse, before the control is live", () => {
    // Robin, 2026-09-23: "lorsque l'on remplace le topic par autre chose, ça ne fonctionne plus."
    // The field is editable; the app's own teleop list is what the runtime narrows the socket to.
    renderEditor(
      { runtime_binding: { ...TELEOP_BINDING, value_mapping: { target_topic: "/my/own_command" } } },
      "slider",
      ["/joystick_cartesian_command"],
    );

    expect(screen.getByRole("alert").textContent).toContain("/my/own_command");
    expect(screen.getByRole("alert").textContent).toContain("Adapter guardrails");
  });

  it("says nothing when the target is one the app allows", () => {
    renderEditor({ runtime_binding: TELEOP_BINDING }, "slider", ["/joystick_cartesian_command"]);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaves fields the runtime does use fully editable", () => {
    renderEditor({ topic: "/cmd/max_velocity", messageType: "std_msgs/msg/Float64", runtime_binding: {} });

    const editable = screen.getByDisplayValue("/cmd/max_velocity");
    expect(editable.hasAttribute("disabled")).toBe(false);
  });
});

describe("a kind Bloom does not know", () => {
  it("names the kind and says where it came from, instead of a settings message", () => {
    // Robin's sheet: "This widget does not expose configuration settings yet", on a Button he could not place.
    renderEditor({}, "rosbag-control");
    expect(screen.getByText(/does not know the kind "rosbag-control"/)).toBeTruthy();
    expect(screen.getByText(/replace it with a widget from the palette/)).toBeTruthy();
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

    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ max: 9, min: -1, step: 0.5 }),
      undefined,
      expect.any(String),
    );
  });

  it("retunes step when minimum changes too", () => {
    const onUpdateSettings = renderEditor({ direction: "vertical", max: 1, min: -1, step: 0.1 });

    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "0" } });

    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ max: 1, min: 0, step: 0.05 }),
      undefined,
      expect.any(String),
    );
  });

  it("leaves a hand-tuned step alone when only the step field is edited", () => {
    const onUpdateSettings = renderEditor({ direction: "vertical", max: 1, min: -1, step: 0.05 });

    fireEvent.change(screen.getByLabelText("Step"), { target: { value: "0.25" } });

    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ max: 1, min: -1, step: 0.25 }),
      undefined,
      expect.any(String),
    );
  });

  it("keeps retuning while the author types through intermediate ranges", () => {
    // Retyping 0.3 as 0.2 passes through "" and "0.": neither is stored, and the field keeps what was typed.
    const onUpdateSettings = renderEditor({ direction: "horizontal", max: 0.3, min: 0, step: 0.015 });
    const maximum = screen.getByLabelText("Maximum") as HTMLInputElement;

    fireEvent.change(maximum, { target: { value: "" } });
    fireEvent.change(maximum, { target: { value: "0." } });
    expect(onUpdateSettings).not.toHaveBeenCalled();
    expect(maximum.value).toBe("0.");

    fireEvent.change(maximum, { target: { value: "0.2" } });
    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ max: 0.2, min: 0, step: 0.01 }),
      undefined,
      expect.any(String),
    );
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

  // Mirrors the inspector: the scale and the panel come from the screen's own device class, so the
  // summary and the inspector's glass reading cannot drift apart.
  function renderWithCanvas(kind: string, layout: { width: number; height: number }) {
    const widget = {
      id: "probe",
      kind,
      title: "Probe",
      layout: { x: 0, y: 0, ...layout },
      settings: {},
    } as unknown as WidgetConfig;
    const canvas = { preset_id: "native-1280x720", runtime_mode: "fit" } as unknown as CanvasSettings;
    const screenConfig = {
      id: "s",
      title: "S",
      canvas,
      reserved_regions: [],
      widgets: [widget],
    } as unknown as Parameters<typeof resolveBuilderPanel>[0];
    const panelInfo = resolveBuilderPanel(screenConfig);
    render(
      <BuilderWidgetSettingsEditor
        canvas={canvas}
        onUpdateSettings={vi.fn(() => null)}
        onUpdateTitle={vi.fn()}
        panel={CHECKED_PANEL_FOR_TEST[panelInfo.deviceClass]}
        widget={widget}
      />,
    );
    return panelInfo;
  }

  const CHECKED_PANEL_FOR_TEST = {
    desktop: { height: 900, width: 1440 },
    tablet: { height: 600, width: 1024 },
  } as const;

  it("states what the authored size becomes on the panel", () => {
    renderWithCanvas("toggle", { width: 130, height: 130 });
    // 1280x720 fits the 1024x600 tablet panel at 0.8, times the 0.99 overflow guard.
    const expected = Math.round(130 * 0.8 * 0.99);

    expect(screen.getByText(`${expected} × ${expected} px`)).toBeTruthy();
    expect(screen.getByText(/On the 1024×600 panel/)).toBeTruthy();
  });

  it("flags an interactive control that lands under the 44px touch floor", () => {
    renderWithCanvas("toggle", { width: 50, height: 50 });

    expect(screen.getByRole("alert").textContent).toContain("44px floor");
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

    const field = screen.getByLabelText("Payload");
    fireEvent.change(field, { target: { value: '{"a": ' } });

    expect((field as HTMLTextAreaElement).value).toBe('{"a": ');
    expect(screen.getByText("Not valid JSON yet, so it has not been applied.")).toBeTruthy();
    expect(onUpdateSettings).not.toHaveBeenCalled();
  });

  it("applies it once it parses", () => {
    const onUpdateSettings = renderEditor({ payload: { a: 1 } }, "command-button");

    fireEvent.change(screen.getByLabelText("Payload"), { target: { value: '{"a": 2}' } });

    expect(onUpdateSettings).toHaveBeenCalled();
    expect(screen.queryByText("Not valid JSON yet, so it has not been applied.")).toBeNull();
  });
});

describe("the glass summary on a screen that is not a tablet", () => {
  afterEach(cleanup);

  // Robin's bench report, 2026-09-21: "Glass retourne toujours une erreur de taille en px trop
  // petite". The summary scaled every screen to 1024x600, so a desktop screen was measured against a
  // panel it will never run on and every control on it read as below the floor.
  it("measures a desktop screen at the panel its own class is checked at", () => {
    const widget = {
      id: "probe",
      kind: "command-button",
      title: "Probe",
      layout: { x: 0, y: 0, width: 240, height: 120 },
      settings: {},
    } as unknown as WidgetConfig;
    const canvas = { preset_id: "full-hd", runtime_mode: "fit" } as unknown as CanvasSettings;
    const screenConfig = { id: "s", title: "S", canvas, reserved_regions: [], widgets: [widget] } as never;
    const panelInfo = resolveBuilderPanel(screenConfig);

    expect(panelInfo.deviceClass).toBe("desktop");

    render(
      <BuilderWidgetSettingsEditor
        canvas={canvas}
        glassScale={panelInfo.glassScale}
        onUpdateSettings={vi.fn(() => null)}
        floorPx={densityFloorFor("desktop")}
        onUpdateTitle={vi.fn()}
        panel={{ height: 900, width: 1440 }}
        widget={widget}
      />,
    );

    expect(screen.getByText(/On the 1440×900 panel/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a toggle that changes message type", () => {
  afterEach(cleanup);

  // Robin's bench report, 2026-09-21: a gripper toggle built in the Builder did not work. The payloads
  // are ROS text, not JSON, and each message type wants a different shape; an author who picks a type
  // and is left to write "{data: [1.1]}" from memory gets a toggle that publishes nothing.
  it("carries the matching payload pair across", () => {
    const onUpdateSettings = renderEditor(
      {
        topic: "/gripper_controller/commands",
        messageType: "std_msgs/msg/Bool",
        onPayload: "{data: true}",
        offPayload: "{data: false}",
        onLabel: "Open",
        offLabel: "Close",
      },
      "toggle",
    );

    fireEvent.change(screen.getByLabelText(/message type/i), {
      target: { value: "std_msgs/msg/Float64MultiArray" },
    });

    const next = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(next.onPayload).toBe("{data: 1.0}");
    expect(next.offPayload).toBe("{data: 0.0}");
  });

  it("leaves a payload the author wrote themselves alone", () => {
    const onUpdateSettings = renderEditor(
      {
        topic: "/gripper_controller/commands",
        messageType: "std_msgs/msg/Bool",
        onPayload: "{data: [1.1]}",
        offPayload: "{data: [0.2]}",
        onLabel: "Open",
        offLabel: "Close",
      },
      "toggle",
    );

    fireEvent.change(screen.getByLabelText(/message type/i), {
      target: { value: "std_msgs/msg/Float64MultiArray" },
    });

    const next = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(next.onPayload).toBe("{data: [1.1]}");
  });
});

describe("what a teleop control moves", () => {
  afterEach(cleanup);

  // Robin, 2026-09-22: "les axes ne sont pas bons mais je n'ai pas essayé de changer les valeurs dans le
  // builder". He could have, but only by hand-writing {"x": {"component": "linear_x"}} into a raw JSON
  // box and knowing the schema. The mapping is a control now.
  it("changes the component an axis drives without editing JSON", () => {
    const widget = {
      id: "drive-translation",
      kind: "joystick",
      title: "Translation",
      layout: { x: 0, y: 0, width: 280, height: 332 },
      settings: {
        runtime_binding: {
          adapter: "teleop",
          value_mapping: { target_topic: "/joystick_cartesian_command" },
          axis_mapping: { x: { component: "linear_x" }, y: { component: "linear_y" } },
        },
      },
    } as unknown as WidgetConfig;
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>) => null);

    render(<BuilderWidgetSettingsEditor onUpdateSettings={onUpdateSettings} onUpdateTitle={vi.fn()} widget={widget} />);

    fireEvent.change(screen.getByLabelText("Forward (Y)"), { target: { value: "linear_z" } });

    const next = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const binding = next.runtime_binding as Record<string, Record<string, { component?: string }>>;
    expect(binding.axis_mapping.y?.component).toBe("linear_z");
    // The axis it did not touch, and the rest of the binding, survive.
    expect(binding.axis_mapping.x?.component).toBe("linear_x");
    expect((next.runtime_binding as Record<string, unknown>).adapter).toBe("teleop");
  });

  it("inverts a direction, which is how Pivot reads left as a left turn", () => {
    const widget = {
      id: "drive-rz",
      kind: "slider",
      title: "Pivot",
      layout: { x: 0, y: 0, width: 384, height: 114 },
      settings: {
        runtime_binding: {
          adapter: "teleop",
          value_mapping: { target_topic: "/joystick_cartesian_command" },
          axis_mapping: { value: { component: "angular_z" } },
        },
      },
    } as unknown as WidgetConfig;
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>) => null);

    render(<BuilderWidgetSettingsEditor onUpdateSettings={onUpdateSettings} onUpdateTitle={vi.fn()} widget={widget} />);

    fireEvent.change(screen.getByLabelText("Invert"), { target: { value: "-1" } });

    const next = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const binding = next.runtime_binding as Record<string, Record<string, { scale?: number }>>;
    expect(binding.axis_mapping.value?.scale).toBe(-1);
  });
});

describe("the command line beside the fields", () => {
  afterEach(cleanup);

  // The single best idea in the old builder: a sentence an author can paste into a terminal to check a
  // control against a real robot, without the app and without asking anyone.
  it("writes both lines for a toggle, from the settings as they stand", () => {
    const widget = {
      id: "gripper",
      kind: "toggle",
      title: "Gripper",
      layout: { x: 0, y: 0, width: 220, height: 120 },
      settings: {
        topic: "/gripper_controller/commands",
        messageType: "std_msgs/msg/Float64MultiArray",
        onPayload: "{data: [0.2]}",
        offPayload: "{data: [1.1]}",
        onLabel: "Open",
        offLabel: "Close",
      },
    } as unknown as WidgetConfig;

    render(
      <BuilderWidgetSettingsEditor onUpdateSettings={vi.fn(() => null)} onUpdateTitle={vi.fn()} widget={widget} />,
    );

    expect(screen.getByText(/ON: ros2 topic pub -1 \/gripper_controller\/commands/)).toBeTruthy();
    expect(screen.getByText(/OFF: .*\{data: \[1.1\]\}/)).toBeTruthy();
  });

  it("says nothing for a control with nothing to send yet", () => {
    const widget = {
      id: "blank",
      kind: "command-button",
      title: "Command",
      layout: { x: 0, y: 0, width: 160, height: 104 },
      settings: { topic: "", messageType: "", payload: "" },
    } as unknown as WidgetConfig;

    render(
      <BuilderWidgetSettingsEditor onUpdateSettings={vi.fn(() => null)} onUpdateTitle={vi.fn()} widget={widget} />,
    );

    expect(screen.queryByText(/ros2 topic pub/)).toBeNull();
  });
});

describe("a mode button's payload", () => {
  afterEach(cleanup);

  const MODE_BUTTON = {
    action_label: "Request geometric/both",
    command: "geometric/both",
    messageType: "std_msgs/msg/String",
    payload: { data: "geometric/both" },
    topic: "/mode_request",
  };

  it("follows its command, so the new mode is the one sent", () => {
    const onUpdate = renderEditor(MODE_BUTTON, "command-button");
    fireEvent.change(screen.getByLabelText(/^Command/), { target: { value: "geometric/snake" } });

    expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({
      command: "geometric/snake",
      payload: { data: "geometric/snake" },
      action_label: "Request geometric/snake",
    });
  });

  it("keeps a payload the author wrote", () => {
    const onUpdate = renderEditor({ ...MODE_BUTTON, payload: { data: "behaviour/passthrough" } }, "command-button");
    fireEvent.change(screen.getByLabelText(/^Command/), { target: { value: "geometric/snake" } });

    expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({ payload: { data: "behaviour/passthrough" } });
  });
});

describe("a palette gripper toggle given another message type", () => {
  afterEach(cleanup);

  it("takes the new type's payloads instead of publishing an array on a Bool", () => {
    const onUpdate = renderEditor(
      {
        messageType: "std_msgs/msg/Float64MultiArray",
        offPayload: "{data: [0.2]}",
        onPayload: "{data: [1.1]}",
        topic: "/gripper_controller/commands",
      },
      "toggle",
    );
    fireEvent.change(screen.getByLabelText(/ROS message type/), { target: { value: "std_msgs/msg/Bool" } });

    expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({ onPayload: "{data: true}", offPayload: "{data: false}" });
  });
});

describe("a plot board's series", () => {
  afterEach(cleanup);

  const HAND_Z = { topic: "/ee_pose", field_path: "pose.position.z", label: "Hand z", unit: "m", enabled: true };

  // Adding one meant writing a JSON array from memory, and a row with a typo vanished at runtime.
  it("are rows an author can add to, edit and remove", () => {
    const onUpdate = renderEditor({ series: [HAND_Z] }, "plot-board");
    const seriesSent = () => (onUpdate.mock.calls.at(-1)?.[0] as { series: unknown[] } | undefined)?.series;
    expect(screen.queryByLabelText(/^Series \(topic/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add series" }));
    expect(seriesSent()).toHaveLength(2);
    // Never one the board already has: the same key twice toggled both rows together.
    expect(seriesSent()?.[1]).toMatchObject({ topic: "/ee_pose", field_path: "pose.position.x" });

    fireEvent.change(screen.getAllByLabelText("Field")[0] as HTMLElement, { target: { value: "pose.position.y" } });
    expect(seriesSent()?.[0]).toMatchObject({ field_path: "pose.position.y", label: "Hand z" });

    fireEvent.click(screen.getByRole("button", { name: "Remove Hand z" }));
    expect(seriesSent()).toEqual([]);
  });

  it("say which row plots nothing, and why", () => {
    renderEditor({ series: [{ ...HAND_Z, topic: "ee_pose" }] }, "value-strip");

    expect(screen.getByRole("status").textContent).toBe("Not plotted. Needs a topic starting with /.");
  });
});

describe("pointing a reading widget at another topic", () => {
  afterEach(cleanup);

  // The palette's PoseStamped stayed after the topic changed, and the backend subscribed with it: the gauge
  // waited forever on /joint_states.
  it("drops the old topic's message type, so the backend reads the new one's", () => {
    const onUpdate = renderEditor(
      { topic: "/ee_pose", messageType: "geometry_msgs/msg/PoseStamped", fieldPath: "pose.position.z", min: 0, max: 1 },
      "gauge",
    );
    fireEvent.change(screen.getByLabelText(/^Input topic/), { target: { value: "/joint_states" } });

    const sent = onUpdate.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(sent.topic).toBe("/joint_states");
    expect(sent.messageType).toBe("sensor_msgs/msg/JointState");
  });

  // Cleared, a type the author typed for a topic nobody publishes yet could not be read back from the graph.
  it("keeps a type the author typed", () => {
    const onUpdate = renderEditor(
      { topic: "/lab/sensor", messageType: "std_msgs/msg/Float32", fieldPath: "data", min: 0, max: 1 },
      "gauge",
    );
    fireEvent.change(screen.getByLabelText(/^Input topic/), { target: { value: "/lab/sensor_2" } });

    expect((onUpdate.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined)?.messageType).toBe(
      "std_msgs/msg/Float32",
    );
  });
});

describe("suggestions where an author types a topic or a field", () => {
  afterEach(cleanup);

  // Topic and field path were typed from memory, with nothing on screen to say what the stack publishes.
  it("offer the stack's topics, and the fields of the one chosen", () => {
    renderEditor({ topic: "/ee_pose", fieldPath: "", min: 0, max: 1 }, "gauge");

    const topic = screen.getByLabelText(/^Input topic/) as HTMLInputElement;
    const topics = [...(topic.list?.options ?? [])].map((option) => option.value);
    expect(topics).toContain("/joint_states");

    const field = screen.getByLabelText(/^Field path/) as HTMLInputElement;
    const fields = [...(field.list?.options ?? [])].map((option) => option.value);
    expect(fields).toContain("pose.position.z");
  });
});

describe("what a slider controls", () => {
  afterEach(cleanup);

  // Height, Pivot and the gain were a runtime_binding written by hand; a new app could not lift the hand.
  it("turns a speed slider into the Manager apps' Height in one choice", () => {
    const onUpdateTitle = vi.fn();
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>, _title?: string) => null);
    render(
      <BuilderWidgetSettingsEditor
        onUpdateSettings={onUpdateSettings}
        onUpdateTitle={onUpdateTitle}
        widget={
          {
            id: "speed",
            kind: "slider",
            title: "Max linear speed",
            layout: { x: 0, y: 0, width: 400, height: 120 },
            settings: {
              topic: "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
              messageType: "std_msgs/msg/Float64",
              min: 0,
              max: 0.3,
              step: 0.015,
              value: 0.15,
              unit: "m/s",
            },
          } as unknown as WidgetConfig
        }
      />,
    );
    const purpose = screen.getByLabelText("What this slider controls") as HTMLSelectElement;
    expect(purpose.value).toBe("linear-speed");

    fireEvent.change(purpose, { target: { value: "height" } });

    const sent = onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(sent.runtime_binding).toMatchObject({
      adapter: "teleop",
      axis_mapping: { value: { component: "linear_z" } },
    });
    expect(sent.topic).toBeUndefined();
    expect(sent.unit).toBeUndefined();
    // The title travels with the settings: two commits from one draft dropped the settings.
    expect(onUpdateSettings.mock.calls.at(-1)?.[1]).toBe("Height");
    expect(onUpdateTitle).not.toHaveBeenCalled();
  });
});

describe("what a command button does", () => {
  afterEach(cleanup);

  const neutral = () => {
    const onUpdateTitle = vi.fn();
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>, _title?: string) => null);
    render(
      <BuilderWidgetSettingsEditor
        onUpdateSettings={onUpdateSettings}
        onUpdateTitle={onUpdateTitle}
        widget={
          {
            id: "mode",
            kind: "command-button",
            title: "Neutral",
            layout: { x: 0, y: 0, width: 220, height: 120 },
            settings: {
              topic: "/mode_request",
              messageType: "std_msgs/msg/String",
              command: "geometric/both",
              payload: { data: "geometric/both" },
              button_label: "Neutral",
            },
          } as unknown as WidgetConfig
        }
      />,
    );
    const choice = screen.getByLabelText("What this button does") as HTMLSelectElement;
    const sent = () => onUpdateSettings.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    return { choice, onUpdateSettings, onUpdateTitle, sent };
  };

  // Anything but Neutral needed the manager's mode string typed from memory.
  it("becomes Go home, with its second press, in one choice", () => {
    const { choice, onUpdateSettings, sent } = neutral();
    expect(choice.value).toBe("neutral");

    fireEvent.change(choice, { target: { value: "go-home" } });

    expect(sent()).toMatchObject({ command: "behaviour/joint_target/home", confirm_press: true });
    expect(onUpdateSettings.mock.calls.at(-1)?.[1]).toBe("Go home");
  });

  it("becomes a frame button, dropping the mode topic it no longer sends on", () => {
    const { choice, sent } = neutral();

    fireEvent.change(choice, { target: { value: "frame-tool" } });

    expect(sent().runtime_binding).toEqual({ adapter: "teleop-frame", frame_id: "effector_frame" });
    expect(sent().topic).toBeUndefined();
  });
});

describe("a publish the app does not allow", () => {
  afterEach(cleanup);

  // Only teleop targets and parameters were checked; a gesture pad on /ui/gesture in a Manager app, whose list
  // has no /ui/, was refused at runtime without a word in the Builder.
  it("is said in the inspector, with where to allow it", () => {
    render(
      <BuilderWidgetSettingsEditor
        allowedPublishTopics={["/mode_request", "/gripper_controller/commands"]}
        onUpdateSettings={vi.fn(() => null)}
        onUpdateTitle={vi.fn()}
        widget={
          {
            id: "gesture",
            kind: "gesture-pad",
            title: "Gesture",
            layout: { x: 0, y: 0, width: 360, height: 300 },
            settings: { topic: "/ui/gesture", messageType: "std_msgs/msg/String" },
          } as unknown as WidgetConfig
        }
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/does not allow publishing on \/ui\/gesture/);
  });
});

describe("the reusable preset picker", () => {
  afterEach(cleanup);

  // A pick is its own undo step: passing the field's key merged two picks into one.
  it("commits a pick without a coalescing key", () => {
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>, _title?: string, _key?: string) => null);
    const preset = { id: "home", name: "Home", kind: "mode", description: "", command: "HOME", topic: "", payload: {} };
    render(
      <BuilderWidgetSettingsEditor
        actionPresets={[preset as unknown as RuntimeActionPreset]}
        onUpdateSettings={onUpdateSettings}
        onUpdateTitle={vi.fn()}
        widget={
          {
            id: "home-button",
            kind: "command-button",
            title: "Home",
            layout: { x: 0, y: 0, width: 100, height: 100 },
            settings: {},
          } as unknown as WidgetConfig
        }
      />,
    );

    fireEvent.change(screen.getByLabelText("Reusable preset"), { target: { value: "home" } });

    expect(onUpdateSettings).toHaveBeenCalled();
    expect(onUpdateSettings.mock.lastCall?.[2]).toBeUndefined();
  });
});
