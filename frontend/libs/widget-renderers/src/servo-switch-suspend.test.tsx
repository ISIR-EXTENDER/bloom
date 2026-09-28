/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetDesiredStates } from "./desired-state";
import { renderWidgetDescriptor } from "./index";
import type { WidgetActionOutcome, WidgetControlState } from "./types";

afterEach(() => {
  cleanup();
  resetDesiredStates();
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

// ADR 0141 replaced the servo epochs: the server orders the Off after the On, so a late On cannot land after it.
describe("the visual servoing switch turned on just before a suspend", () => {
  it("sends the Off at once and ignores the On's late answer", async () => {
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

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: false}"]);
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

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: false}"]);
    expect(lastPayload(onActionIntent)).toMatchObject({ release: true });
  });
});

describe("a servo switch-off without a reply or rate-limited", () => {
  // It used to keep reading On; it now shows the Off it asked for, not confirmed, until one is accepted.
  it("shows Off not confirmed, retries, and reads Off once accepted", async () => {
    vi.useFakeTimers();
    let refusals = 2;
    const { onActionIntent, rerender } = renderToggle(SERVO, (intent) => {
      if (intent.type === "topic-publish" && intent.payload === "{data: false}" && refusals > 0) {
        refusals -= 1;
        return { accepted: false, detail: "Too many requests.", status: "transient" };
      }
      return { accepted: true };
    });
    await act(async () => {});

    rerender(1);
    expect(screen.getByRole("button", { name: "Servo: Off, not confirmed" })).toHaveAttribute(
      "data-confirmed",
      "false",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: false}", "{data: false}", "{data: false}"]);
    expect(screen.getByRole("button", { name: "Servo: Off" })).not.toHaveAttribute("data-confirmed");
  });

  it("keeps retrying every 2 s and says to STOP if in doubt when no attempt gets a reply", async () => {
    vi.useFakeTimers();
    const { onActionIntent, rerender } = renderToggle(SERVO, (intent) =>
      intent.type === "topic-publish" && intent.payload === "{data: false}"
        ? Promise.reject(new Error("timed out"))
        : { accepted: true },
    );
    await act(async () => {});

    rerender(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3800);
    });
    expect(payloads(onActionIntent).filter((payload) => payload === "{data: false}")).toHaveLength(5);
    expect(screen.getByText("Not confirmed")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4200);
    });

    expect(payloads(onActionIntent).filter((payload) => payload === "{data: false}")).toHaveLength(7);
    expect(screen.getByText("Robot has not confirmed \u2014 STOP if in doubt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Servo: Off, not confirmed" })).toBeInTheDocument();
  });
});

describe("a servo On whose reply was lost", () => {
  // It used to switch the servo off at once; ADR 0141 shows On, not confirmed, and keeps asking for it.
  it("shows On not confirmed, retries the On, and converges", async () => {
    vi.useFakeTimers();
    let lost = 1;
    const { onActionIntent } = renderToggle(SERVO, (intent) => {
      if (intent.type === "topic-publish" && intent.payload === "{data: true}" && lost > 0) {
        lost -= 1;
        return Promise.reject(new Error("timed out"));
      }
      return { accepted: true };
    });
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Servo: Servoing, not confirmed" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: true}"]);
    expect(screen.getByRole("button", { name: "Servo: Servoing" })).not.toHaveAttribute("data-confirmed");
  });

  it("asks for Off on unmount and keeps asking after it is gone", async () => {
    vi.useFakeTimers();
    const { onActionIntent, unmount } = renderToggle(SERVO, () => Promise.reject(new Error("lost")));
    await act(async () => {});

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    const sent = payloads(onActionIntent);
    expect(sent.slice(0, 2)).toEqual(["{data: true}", "{data: false}"]);
    expect(sent.filter((payload) => payload === "{data: true}")).toHaveLength(1);
    expect(sent.filter((payload) => payload === "{data: false}")).toHaveLength(5);
  });
});

describe("a switch-off still retrying from an unmounted servo switch", () => {
  it("is replaced by the remounted switch's newer On", async () => {
    vi.useFakeTimers();
    const log: unknown[] = [];
    const handler = (intent: WidgetActionIntent): Outcome => {
      const payload = intent.type === "topic-publish" ? intent.payload : null;
      log.push(payload);
      return { accepted: payload !== "{data: false}" };
    };
    const first = renderToggle(SERVO, handler);
    await act(async () => {});
    first.rerender(1);
    first.unmount();

    renderToggle(SERVO, handler);
    await act(async () => {});
    const remountedOn = log.lastIndexOf("{data: true}");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(remountedOn).toBeGreaterThan(0);
    expect(log.slice(remountedOn + 1)).toEqual([]);
    expect(screen.getByRole("button", { name: "Servo: Servoing" })).toBeInTheDocument();
  });
});

describe("a servo switch-off the robot refuses outright", () => {
  // An explicit refusal (STOP latched, not the owner) was not applied, and the server's own resets cover it.
  it("is not retried and reads a clean Off after an accepted On", async () => {
    vi.useFakeTimers();
    const { onActionIntent, rerender } = renderToggle(SERVO, (intent) =>
      intent.type === "topic-publish" && intent.payload === "{data: false}"
        ? { accepted: false, detail: "The robot is stopped." }
        : { accepted: true },
    );
    await act(async () => {});

    rerender(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: false}"]);
    expect(screen.getByRole("button", { name: "Servo: Off" })).not.toHaveAttribute("data-confirmed");
  });

  it("keeps saying not confirmed, with the reason, when the On before it got no reply", async () => {
    vi.useFakeTimers();
    const { onActionIntent, rerender } = renderToggle(SERVO, (intent) =>
      intent.type === "topic-publish" && intent.payload === "{data: false}"
        ? { accepted: false, detail: "The robot is stopped." }
        : Promise.reject(new Error("timed out")),
    );
    await act(async () => {});

    rerender(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(payloads(onActionIntent)).toEqual(["{data: true}", "{data: false}"]);
    expect(screen.getByRole("button", { name: "Servo: Off, not confirmed" })).toHaveAttribute(
      "data-confirmed",
      "false",
    );
  });
});
