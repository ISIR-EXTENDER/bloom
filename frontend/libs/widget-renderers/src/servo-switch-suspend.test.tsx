/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWidgetDescriptor } from "./index";
import type { WidgetActionOutcome, WidgetControlState } from "./types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SERVO = {
  id: "servo",
  title: "Servo",
  settings: {
    topic: "/ui/visual_servoing/on",
    messageType: "std_msgs/msg/Bool",
    onLabel: "Servoing",
    offLabel: "Off",
    onPayload: "{data: true}",
    offPayload: "{data: false}",
  },
};
const GRIPPER = {
  id: "gripper",
  title: "Gripper",
  settings: {
    topic: "/gripper_controller/commands",
    messageType: "std_msgs/msg/Bool",
    onLabel: "Closed",
    offLabel: "Open",
    onPayload: "{data: true}",
    offPayload: "{data: false}",
  },
};

type Outcome = WidgetActionOutcome | Promise<WidgetActionOutcome>;

function renderToggle(
  widget: typeof SERVO,
  handler: (intent: WidgetActionIntent) => Outcome = () => ({ accepted: true }),
) {
  const onActionIntent = vi.fn(handler);
  const [descriptor] = renderScreenDescriptors(
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [{ kind: "toggle", layout: { x: 0, y: 0, width: 300, height: 168 }, ...widget }],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing descriptor.");
  const view = (neutralRevision: number, controlState?: WidgetControlState) => (
    <div>
      {renderWidgetDescriptor(descriptor, {
        controlStateByWidgetId: controlState ? { [widget.id]: controlState } : undefined,
        neutralRevision,
        onActionIntent,
      })}
    </div>
  );
  const utils = render(view(0));
  fireEvent.click(screen.getByRole("button"));
  return {
    onActionIntent,
    rerender: (revision: number, state?: WidgetControlState) => utils.rerender(view(revision, state)),
    unmount: utils.unmount,
  };
}

const lastPayload = (onActionIntent: ReturnType<typeof vi.fn>) => onActionIntent.mock.calls.at(-1)?.[0];

describe("the visual servoing switch on a suspend", () => {
  it("publishes its off payload as a release and reads off", async () => {
    const { onActionIntent, rerender } = renderToggle(SERVO);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Servo: Servoing" })).toBeInTheDocument();

    rerender(1);

    expect(lastPayload(onActionIntent)).toMatchObject({
      payload: "{data: false}",
      release: true,
      topic: "/ui/visual_servoing/on",
    });
    expect(screen.getByRole("button", { name: "Servo: Off" })).toBeInTheDocument();
  });

  it("switches off when STOP disables it and when it unmounts", async () => {
    const stopped = renderToggle(SERVO);
    await act(async () => {});
    stopped.rerender(0, { disabled: true });
    expect(lastPayload(stopped.onActionIntent)).toMatchObject({ payload: "{data: false}", release: true });
    cleanup();

    const left = renderToggle(SERVO);
    await act(async () => {});
    left.unmount();
    expect(lastPayload(left.onActionIntent)).toMatchObject({ payload: "{data: false}", release: true });
  });

  it("leaves another toggle, such as the gripper, as it was", async () => {
    const { onActionIntent, rerender } = renderToggle(GRIPPER as typeof SERVO);
    await act(async () => {});
    rerender(1);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).toBeInTheDocument();
  });
});

const payloads = (onActionIntent: ReturnType<typeof vi.fn>) =>
  onActionIntent.mock.calls.map(([intent]) => (intent as { payload?: unknown }).payload);

describe("the visual servoing switch turned on just before a suspend", () => {
  // The On was still travelling, so the switch read off, the suspend did nothing, and the On then landed.
  it("stays off and switches the servo off again once the On is accepted", async () => {
    let answerOn: (outcome: WidgetActionOutcome) => void = () => {};
    const { onActionIntent, rerender } = renderToggle(SERVO, (intent) =>
      intent.type === "topic-publish" && intent.payload === "{data: true}"
        ? new Promise<WidgetActionOutcome>((resolve) => {
            answerOn = resolve;
          })
        : { accepted: true },
    );

    rerender(1);
    await act(async () => answerOn({ accepted: true }));

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: false}", "{data: false}"]);
    expect(screen.getByRole("button", { name: "Servo: Off" })).toBeInTheDocument();
  });

  it("switches off when it unmounts with the On still travelling", async () => {
    let answerOn: (outcome: WidgetActionOutcome) => void = () => {};
    const { onActionIntent, unmount } = renderToggle(SERVO, (intent) =>
      intent.type === "topic-publish" && intent.payload === "{data: true}"
        ? new Promise<WidgetActionOutcome>((resolve) => {
            answerOn = resolve;
          })
        : { accepted: true },
    );

    unmount();
    await act(async () => answerOn({ accepted: true }));

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: false}", "{data: false}"]);
  });
});

describe("a refused servo switch-off", () => {
  it("retries and reads off only once the off is accepted", async () => {
    vi.useFakeTimers();
    let refusals = 2;
    const { onActionIntent, rerender } = renderToggle(SERVO, (intent) => {
      if (intent.type === "topic-publish" && intent.payload === "{data: false}" && refusals > 0) {
        refusals -= 1;
        return { accepted: false, detail: "refused" };
      }
      return { accepted: true };
    });
    await act(async () => {});

    rerender(1);
    expect(screen.getByRole("button", { name: "Servo: Servoing" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: false}", "{data: false}", "{data: false}"]);
    expect(screen.getByRole("button", { name: "Servo: Off" })).toBeInTheDocument();
  });

  it("keeps reading on when every attempt is refused", async () => {
    vi.useFakeTimers();
    const { onActionIntent, rerender } = renderToggle(SERVO, (intent) =>
      intent.type === "topic-publish" && intent.payload === "{data: false}" ? { accepted: false } : { accepted: true },
    );
    await act(async () => {});

    rerender(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(payloads(onActionIntent).filter((payload) => payload === "{data: false}")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Servo: Servoing" })).toBeInTheDocument();
  });
});
