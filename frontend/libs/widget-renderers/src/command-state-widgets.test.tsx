/**
 * @vitest-environment jsdom
 */
import type { CommandStateEntry, ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCommandStateMessage, resetCommandStateForTests } from "./command-state";
import { renderScreenWidgets } from "./index";
import type { WidgetActionOutcome, WidgetControlState } from "./types";

Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
globalThis.ResizeObserver = class {
  disconnect() {}
  observe() {}
  unobserve() {}
};

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  vi.useRealTimers();
});

let revision = 0;
const snapshot: Record<string, CommandStateEntry> = {};
function write(entries: Record<string, unknown>, by = "me", source: CommandStateEntry["source"] = "commanded") {
  for (const [key, value] of Object.entries(entries)) {
    revision += 1;
    snapshot[key] = { value, source, by, revision, updated_at: "" };
  }
  act(() => applyCommandStateMessage({ type: "command_state", revision, self: "me", snapshot: { ...snapshot } }));
}
afterEach(() => {
  revision = 0;
  for (const key of Object.keys(snapshot)) {
    delete snapshot[key];
  }
});

type Handler = (intent: WidgetActionIntent) => WidgetActionOutcome | Promise<WidgetActionOutcome> | undefined;

function renderWidgets(
  widgets: ScreenConfig["widgets"],
  handler: Handler = () => ({ accepted: true }),
  controlStateByWidgetId?: Record<string, WidgetControlState>,
) {
  const onActionIntent = vi.fn(handler);
  const descriptors = renderScreenDescriptors(
    { id: "s", title: "S", canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, widgets } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  const view = (states?: Record<string, WidgetControlState>, neutralRevision = 0) => (
    <div>{renderScreenWidgets(descriptors, { controlStateByWidgetId: states, neutralRevision, onActionIntent })}</div>
  );
  const utils = render(view(controlStateByWidgetId));
  return { onActionIntent, rerender: (neutral: number) => utils.rerender(view(controlStateByWidgetId, neutral)) };
}

const layout = { x: 0, y: 0, width: 240, height: 120 };
const modeButton = (id: string, mode: string) => ({
  id,
  kind: "command-button" as const,
  title: id,
  layout,
  settings: { topic: "/mode_request", messageType: "std_msgs/msg/String", payload: { data: mode } },
});
const stateOf = (name: RegExp | string) =>
  screen.getByRole("button", { name }).closest("[data-command-state]")?.getAttribute("data-command-state");

describe("mode buttons", () => {
  it("light from the store, and a press shows sending until the store has this screen's write", () => {
    renderWidgets([modeButton("Both", "geometric/both"), modeButton("Jaco", "geometric/jaco")], () => undefined);
    expect(stateOf(/^Both/)).toBe("unknown");

    write({ "manager:shaping": "geometric/both" }, "robot", "reset");
    expect(screen.getByRole("button", { name: /^Both/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /^Jaco/ }));
    expect(stateOf(/^Jaco/)).toBe("sending");
    expect(stateOf(/^Both/)).toBe("selected");

    write({ "manager:shaping": "geometric/jaco" });
    expect(stateOf(/^Jaco/)).toBe("selected");
    expect(stateOf(/^Both/)).toBe("unselected");
  });

  it("show the store after 3 s when nothing answers", () => {
    vi.useFakeTimers();
    renderWidgets([modeButton("Jaco", "geometric/jaco")], () => new Promise(() => undefined));
    write({ "manager:shaping": "geometric/both" }, "robot");
    fireEvent.click(screen.getByRole("button", { name: /^Jaco/ }));
    expect(stateOf(/^Jaco/)).toBe("sending");

    act(() => vi.advanceTimersByTime(3000));
    expect(stateOf(/^Jaco/)).toBe("unselected");
  });

  it("show a refusal's reason beside the store's mode", async () => {
    renderWidgets([modeButton("Jaco", "geometric/jaco")], async () => ({ accepted: false, detail: "STOP is on." }));
    write({ "manager:shaping": "geometric/both" }, "server", "reset");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Jaco/ })));

    expect(screen.getByText("STOP is on.")).toBeInTheDocument();
    expect(stateOf(/^Jaco/)).toBe("unselected");
  });

  it("say not confirmed after a lost reply only until this screen's write shows up", async () => {
    renderWidgets([modeButton("Jaco", "geometric/jaco")], async () => ({ accepted: false, status: "unknown" }));
    write({ "manager:shaping": "geometric/both" }, "robot");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Jaco/ })));
    expect(screen.getByText("Not confirmed by the robot")).toBeInTheDocument();

    write({ "manager:shaping": "geometric/jaco" });
    expect(screen.queryByText("Not confirmed by the robot")).not.toBeInTheDocument();
    expect(stateOf(/^Jaco/)).toBe("selected");
  });

  it("read the runtime's binding for a preset-routed button", () => {
    renderWidgets(
      [{ id: "jaco", kind: "command-button", title: "Jaco", layout, settings: { command: "geometric/jaco" } }],
      () => undefined,
      {
        jaco: {
          commandBinding: {
            lit: [{ key: "manager:shaping", value: "geometric/jaco" }],
            writes: [{ key: "manager:shaping", value: "geometric/jaco" }],
          },
        },
      },
    );
    write({ "manager:shaping": "geometric/jaco" }, "other-publisher");
    expect(screen.getByRole("button", { name: "Jaco: requested, last asked" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the manager's status", () => {
  it("reads as reported by the robot on the shaping, pose target and behaviour controls", () => {
    renderWidgets([
      modeButton("Both", "geometric/both"),
      modeButton("Jaco", "geometric/jaco"),
      modeButton("Ready", "behaviour/pose_target/ready"),
      modeButton("Go home", "behaviour/joint_target/home"),
      {
        id: "speed-up",
        kind: "toggle",
        title: "Speed up with intent",
        layout,
        settings: {
          topic: "/mode_request",
          messageType: "std_msgs/msg/String",
          onPayload: "{data: 'behaviour/intent_scaling'}",
          offPayload: "{data: 'behaviour/passthrough'}",
          onLabel: "Speeding up",
          offLabel: "Plain speed",
        },
      },
    ]);
    // What the backend writes from /cartesian_manager/status (ADR 0142, 2026-09-29).
    write(
      {
        "manager:shaping": "geometric/jaco",
        "manager:behaviour": "behaviour/pose_target",
        "manager:target": "behaviour/pose_target/ready",
      },
      "robot",
      "measured",
    );
    expect(screen.getByRole("button", { name: "Jaco: requested, reported by the robot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Both: not requested, reported by the robot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ready: requested, reported by the robot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Speed up with intent: Plain speed, reported by the robot/ })).toBe(
      screen.getByRole("button", { name: /^Speed up with intent/ }),
    );
    // A joint target is one-shot: never lit, so it states no source either way.
    expect(screen.getByRole("button", { name: /^Go home/ }).closest("[data-source]")).toBeNull();

    write({ "manager:shaping": "geometric/both" });
    expect(screen.getByRole("button", { name: "Both: requested, last asked" })).toBeInTheDocument();
  });
});

describe("a Snake hold", () => {
  const hold = {
    id: "snake",
    kind: "command-button" as const,
    title: "Snake",
    layout,
    settings: {
      topic: "/mode_request",
      messageType: "std_msgs/msg/String",
      momentary: true,
      payload: { data: "geometric/snake" },
      releasedPayload: { data: "geometric/both" },
    },
  };

  it("is pressed while held, whatever the store says, and releases once on a suspend", () => {
    const { onActionIntent, rerender } = renderWidgets([hold, modeButton("Both", "geometric/both")]);
    write({ "manager:shaping": "geometric/both" }, "robot");
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Snake/ }), { pointerId: 1 });
    expect(screen.getByRole("button", { name: /^Snake/ })).toHaveAttribute("aria-pressed", "true");
    expect(stateOf(/^Both/)).toBe("selected");

    write({ "manager:shaping": "geometric/snake" });
    expect(stateOf(/^Both/)).toBe("unselected");

    rerender(1);
    rerender(1);
    const sent = onActionIntent.mock.calls.map(([intent]) => intent as { payload: unknown; release?: boolean });
    expect(sent.map((intent) => [intent.payload, intent.release])).toEqual([
      [{ data: "geometric/snake" }, undefined],
      [{ data: "geometric/both" }, true],
    ]);
    expect(screen.getByRole("button", { name: /^Snake/ })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("a parameter toggle", () => {
  const servoInput = {
    id: "servo-input",
    kind: "toggle" as const,
    title: "Servo input",
    layout,
    settings: {
      onLabel: "Summed",
      offLabel: "Ignored",
      runtime_binding: {
        adapter: "parameter",
        target: "parameter",
        value_mapping: { node: "/cartesian_manager", parameter: "inputs.visual_servoing.enabled" },
      },
    },
  };

  it("reads the parameter the node reports", () => {
    renderWidgets([servoInput]);
    expect(screen.getByRole("button", { name: "Servo input: Summed" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Servo input: Ignored" })).toHaveAttribute("aria-pressed", "false");

    write({ "param:/cartesian_manager:inputs.visual_servoing.enabled": true }, "robot", "measured");
    expect(screen.getByRole("button", { name: "Servo input: Summed, reported by the robot" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("says when the manager does not declare the input it switches", () => {
    renderWidgets([servoInput]);
    write({ "param:/cartesian_manager:inputs.sources": ["joystick"] }, "robot", "measured");
    expect(screen.getByText(/does not declare this input/)).toBeInTheDocument();

    write({ "param:/cartesian_manager:inputs.sources": ["joystick", "visual_servoing"] }, "robot", "measured");
    expect(screen.queryByText(/does not declare this input/)).not.toBeInTheDocument();
  });
});

describe("a digital output toggle", () => {
  it("reads its own pin", () => {
    renderWidgets([
      {
        id: "lamp",
        kind: "toggle",
        title: "Lamp",
        layout,
        settings: {
          topic: "/hub/digital_output",
          messageType: "std_msgs/msg/Float32MultiArray",
          onPayload: "{data: [3, 1]}",
          offPayload: "{data: [3, 0]}",
          onLabel: "On",
          offLabel: "Off",
        },
      },
    ]);
    write({ "/hub/digital_output:2": true, "/hub/digital_output:3": false });
    expect(screen.getByRole("button", { name: /^Lamp: Off/ })).toBeInTheDocument();
  });
});

describe("a speed limit", () => {
  it("shows the limit the store holds", () => {
    renderWidgets([
      {
        id: "speed",
        kind: "slider",
        title: "Max speed",
        layout,
        settings: {
          direction: "horizontal",
          min: 0,
          max: 0.2,
          step: 0.01,
          value: 0.05,
          unit: "m/s",
          variant: "segments",
          segment_values: [0.05, 0.1, 0.2],
          topic: "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
          messageType: "std_msgs/msg/Float64",
        },
      },
    ]);
    write({ "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed": { data: 0.1 } }, "other-publisher");
    const selected = document.querySelector('.bloom-segment[data-selected="true"]');
    expect(selected?.textContent).toMatch(/0\.1/);
  });
});
