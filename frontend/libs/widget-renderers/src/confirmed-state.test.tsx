/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import { DETACHED_GIVE_UP_MS, resetDesiredStates } from "./desired-state";
import { renderWidgetDescriptor } from "./index";
import type { WidgetActionOutcome, WidgetControlState } from "./types";

// ADR 0141: a stateful control reconciles to the last thing asked for and says when the robot has not confirmed it.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  resetDesiredStates();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Handler = (intent: WidgetActionIntent) => WidgetActionOutcome | Promise<WidgetActionOutcome>;

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const lost = () => Promise.reject(new Error("ROS publish on /mode_request timed out after 4 s."));
const superseded: WidgetActionOutcome = { accepted: true, detail: "superseded", status: "superseded" };

function modeButton(
  id: string,
  mode: string,
  onActionIntent: Handler,
  extra: Record<string, unknown> = {},
  controlState?: WidgetControlState,
) {
  return (
    <CommandLikeWidget
      controlState={controlState}
      descriptor={
        {
          widget: {
            id,
            kind: "command-button",
            title: id,
            layout: { x: 0, y: 0, width: 10, height: 10 },
            settings: {
              messageType: "std_msgs/msg/String",
              payload: { data: mode },
              topic: "/mode_request",
              ...extra,
            },
          },
        } as never
      }
      onActionIntent={onActionIntent}
    />
  );
}

const snake = (onActionIntent: Handler) =>
  modeButton("snake", "geometric/snake", onActionIntent, {
    button_label: "Snake",
    momentary: true,
    releasedPayload: { data: "geometric/both" },
  });

function toggleView(
  settings: Record<string, unknown>,
  onActionIntent: Handler,
  options: { neutralRevision?: number; controlState?: WidgetControlState } = {},
) {
  const [descriptor] = renderScreenDescriptors(
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [
        {
          id: "gripper",
          kind: "toggle",
          title: "Gripper",
          layout: { x: 0, y: 0, width: 300, height: 168 },
          settings: {
            topic: "/gripper_controller/commands",
            messageType: "std_msgs/msg/Bool",
            onLabel: "Closed",
            offLabel: "Open",
            onPayload: "{data: true}",
            offPayload: "{data: false}",
            ...settings,
          },
        },
      ],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing toggle descriptor.");
  return (
    <div>
      {renderWidgetDescriptor(descriptor, {
        controlStateByWidgetId: options.controlState ? { gripper: options.controlState } : undefined,
        neutralRevision: options.neutralRevision ?? 0,
        onActionIntent,
      })}
    </div>
  );
}

const sentBy = (onActionIntent: ReturnType<typeof vi.fn>) =>
  onActionIntent.mock.calls.map(([intent]) => ({
    id: (intent as WidgetActionIntent).widgetId,
    payload: (intent as { payload?: unknown }).payload,
  }));

describe("a Snake hold whose release reply is lost", () => {
  it("shows released, not confirmed, and keeps releasing until one is accepted", async () => {
    let releasesLost = 3;
    const onActionIntent = vi.fn((intent: WidgetActionIntent) => {
      if (intent.type === "topic-publish" && intent.release && releasesLost > 0) {
        releasesLost -= 1;
        return lost();
      }
      return { accepted: true };
    });
    render(snake(onActionIntent));
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerUp(button, { pointerId: 1 });
    await settle(0);

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("data-confirmed", "false");
    expect(screen.getByRole("button", { name: "Snake: not confirmed" })).toBe(button);
    await settle(2000);

    expect(sentBy(onActionIntent).map((sent) => sent.payload)).toEqual([
      { data: "geometric/snake" },
      { data: "geometric/both" },
      { data: "geometric/both" },
      { data: "geometric/both" },
      { data: "geometric/both" },
    ]);
    expect(button).not.toHaveAttribute("data-confirmed");
    expect(screen.getByRole("button", { name: "Snake" })).toBe(button);
  });
});

describe("a latched Jaco after a lost Snake release", () => {
  it("wins: the server supersedes Snake's pending release, which then stops", async () => {
    let answerRetry: (outcome: WidgetActionOutcome) => void = () => {};
    let releases = 0;
    const onActionIntent = vi.fn((intent: WidgetActionIntent) => {
      if (intent.type !== "topic-publish") return { accepted: true };
      if (intent.release) {
        releases += 1;
        return releases === 1
          ? lost()
          : new Promise<WidgetActionOutcome>((resolve) => {
              answerRetry = resolve;
            });
      }
      return { accepted: true };
    });
    render(
      <div>
        {snake(onActionIntent)}
        {modeButton("jaco", "geometric/jaco", onActionIntent, { button_label: "Jaco" }, { selection: "unselected" })}
      </div>,
    );
    const [snakeButton, jacoButton] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];

    fireEvent.pointerDown(snakeButton, { pointerId: 1 });
    fireEvent.pointerUp(snakeButton, { pointerId: 1 });
    await settle(300);
    expect(releases).toBe(2);
    fireEvent.click(jacoButton);
    await act(async () => answerRetry(superseded));
    await settle(10_000);

    expect(sentBy(onActionIntent)).toEqual([
      { id: "snake", payload: { data: "geometric/snake" } },
      { id: "snake", payload: { data: "geometric/both" } },
      { id: "snake", payload: { data: "geometric/both" } },
      { id: "jaco", payload: { data: "geometric/jaco" } },
    ]);
    expect(snakeButton).not.toHaveAttribute("data-confirmed");
    expect(jacoButton).not.toHaveAttribute("data-confirmed");
  });

  it("stops Snake's retry on the client too when Jaco is pressed between two retries", async () => {
    const onActionIntent = vi.fn((intent: WidgetActionIntent) =>
      intent.type === "topic-publish" && intent.release ? lost() : { accepted: true },
    );
    render(
      <div>
        {snake(onActionIntent)}
        {modeButton("jaco", "geometric/jaco", onActionIntent, { button_label: "Jaco" }, { selection: "unselected" })}
      </div>,
    );
    const [snakeButton, jacoButton] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];

    fireEvent.pointerDown(snakeButton, { pointerId: 1 });
    fireEvent.pointerUp(snakeButton, { pointerId: 1 });
    await settle(100);
    fireEvent.click(jacoButton);
    await settle(10_000);

    expect(sentBy(onActionIntent).at(-1)).toEqual({ id: "jaco", payload: { data: "geometric/jaco" } });
    expect(onActionIntent).toHaveBeenCalledTimes(3);
  });
});

describe("a latched mode button whose request is lost", () => {
  it("keeps asking, says the mode is not confirmed, and converges", async () => {
    let lostRequests = 2;
    const onActionIntent = vi.fn(() => {
      if (lostRequests > 0) {
        lostRequests -= 1;
        return lost();
      }
      return { accepted: true };
    });
    render(modeButton("jaco", "geometric/jaco", onActionIntent, { button_label: "Jaco" }, { selection: "unselected" }));
    const button = screen.getByRole("button");

    fireEvent.click(button);
    await settle(0);
    expect(screen.getByText("Mode not confirmed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jaco: not confirmed" })).toBe(button);
    await settle(1000);

    expect(onActionIntent).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("Mode not confirmed")).not.toBeInTheDocument();
  });

  it("shows no highlight and the mark when the shell says its mode is unconfirmed", () => {
    render(modeButton("jaco", "geometric/jaco", () => ({ accepted: true }), {}, { selection: "unconfirmed" }));
    const button = screen.getByRole("button");

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).not.toHaveAttribute("data-selected");
    expect(button).toHaveAttribute("data-confirmed", "false");
    expect(screen.getByText("Mode not confirmed")).toBeInTheDocument();
  });

  it("leaves a one-shot Go home one-shot", async () => {
    const onActionIntent = vi.fn(lost);
    vi.spyOn(Date, "now").mockReturnValue(0);
    render(
      modeButton("home", "behaviour/joint_target/home", onActionIntent, {
        button_label: "Send Home",
        confirm_label: "Press again",
        confirm_press: true,
      }),
    );
    fireEvent.click(screen.getByRole("button"));
    vi.spyOn(Date, "now").mockReturnValue(5000);
    fireEvent.click(screen.getByRole("button"));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
  });
});

describe("a toggle unmounted while unconfirmed", () => {
  it("is finished by the module reconciler", async () => {
    let refusals = 3;
    const onActionIntent = vi.fn(() => {
      if (refusals > 0) {
        refusals -= 1;
        return { accepted: false, detail: "Too many requests.", status: "transient" as const };
      }
      return { accepted: true };
    });
    const { unmount } = render(toggleView({}, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    expect(screen.getByRole("button", { name: "Gripper: Closed, not confirmed" })).toBeInTheDocument();

    unmount();
    await settle(10_000);

    expect(sentBy(onActionIntent).map((sent) => sent.payload)).toEqual([
      "{data: true}",
      "{data: true}",
      "{data: true}",
      "{data: true}",
    ]);
  });

  it("gives up a minute after it unmounted, and says so in the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onActionIntent = vi.fn(lost);
    const { unmount } = render(toggleView({}, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    unmount();
    await settle(DETACHED_GIVE_UP_MS + 2000);
    const calls = onActionIntent.mock.calls.length;
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(calls);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("is adopted by the remounted toggle, which shows it unconfirmed", async () => {
    const onActionIntent = vi.fn(lost);
    const first = render(toggleView({}, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    first.unmount();

    render(toggleView({}, onActionIntent));
    await settle(600);

    expect(screen.getByRole("button", { name: "Gripper: Closed, not confirmed" })).toBeInTheDocument();
  });
});

describe("a newer operator act", () => {
  it("replaces the desired state at once, and the old send's late answer changes nothing", async () => {
    let answerFirst: (outcome: WidgetActionOutcome) => void = () => {};
    const onActionIntent = vi.fn((intent: WidgetActionIntent) =>
      intent.type === "topic-publish" && intent.payload === "{data: true}"
        ? new Promise<WidgetActionOutcome>((resolve) => {
            answerFirst = resolve;
          })
        : { accepted: true },
    );
    render(toggleView({}, onActionIntent));

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).toHaveAttribute("data-confirmed", "false");
    fireEvent.click(screen.getByRole("button"));
    await act(async () => answerFirst({ accepted: false }));
    await settle(10_000);

    expect(sentBy(onActionIntent).map((sent) => sent.payload)).toEqual(["{data: true}", "{data: false}"]);
    expect(screen.getByRole("button", { name: "Gripper: Open" })).not.toHaveAttribute("data-confirmed");
  });
});

describe("a superseded send", () => {
  it.each([
    ["accepted", superseded],
    ["refused", { accepted: false, status: "superseded" } satisfies WidgetActionOutcome],
  ])("is never retried and shows no mark (%s flag)", async (_flag, outcome) => {
    const onActionIntent = vi.fn(() => outcome);
    render(toggleView({}, onActionIntent));

    fireEvent.click(screen.getByRole("button"));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).not.toHaveAttribute("data-confirmed");
    expect(screen.queryByText("Not confirmed")).not.toBeInTheDocument();
  });
});

describe("the gripper on a suspend or STOP", () => {
  it("never sends Open, and cancels a Close still being asked for", async () => {
    const onActionIntent = vi.fn(lost);
    const { rerender } = render(toggleView({}, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(300);
    expect(onActionIntent).toHaveBeenCalledTimes(2);

    rerender(toggleView({}, onActionIntent, { neutralRevision: 1 }));
    await settle(10_000);

    expect(sentBy(onActionIntent).map((sent) => sent.payload)).toEqual(["{data: true}", "{data: true}"]);
    // The Close got no reply, so the gripper may be closed: the screen does not say Open.
    expect(screen.getByRole("button", { name: "Gripper: Closed, not confirmed" })).toBeInTheDocument();
  });

  it("does not re-send a Close refused during STOP once it is released", async () => {
    const onActionIntent = vi.fn(() => ({ accepted: false, detail: "The robot is stopped." }));
    const { rerender } = render(toggleView({}, onActionIntent, { controlState: { disabled: true } }));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    rerender(toggleView({}, onActionIntent));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Gripper: Open" })).not.toHaveAttribute("data-confirmed");
  });
});

describe("a latched mode request that timed out during STOP", () => {
  it("shows Mode not confirmed and is not re-sent after the STOP is released", async () => {
    const onActionIntent = vi.fn(lost);
    const view = (neutralRevision: number) => (
      <CommandLikeWidget
        controlState={{ selection: "unselected" }}
        descriptor={
          {
            widget: {
              id: "jaco",
              kind: "command-button",
              title: "Jaco",
              layout: { x: 0, y: 0, width: 10, height: 10 },
              settings: {
                messageType: "std_msgs/msg/String",
                payload: { data: "geometric/jaco" },
                topic: "/mode_request",
              },
            },
          } as never
        }
        neutralRevision={neutralRevision}
        onActionIntent={onActionIntent}
      />
    );
    const { rerender } = render(view(0));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);

    rerender(view(1));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Mode not confirmed")).toBeInTheDocument();
  });
});

describe("a refusal by kind", () => {
  it("retries a rate limit (429) and shows the asked-for state not confirmed meanwhile", async () => {
    let limited = 2;
    const onActionIntent = vi.fn(() => {
      if (limited > 0) {
        limited -= 1;
        return { accepted: false, detail: "Too many requests.", status: "transient" as const };
      }
      return { accepted: true };
    });
    render(toggleView({}, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    expect(screen.getByRole("button", { name: "Gripper: Closed, not confirmed" })).toBeInTheDocument();
    await settle(1000);

    expect(onActionIntent).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).not.toHaveAttribute("data-confirmed");
  });

  it("does not retry a forbidden (403) hold, and shows the refusal", async () => {
    const onActionIntent = vi.fn((intent: WidgetActionIntent) =>
      intent.type === "topic-publish" && !intent.release
        ? { accepted: false, detail: "ROS topic is not allowed.", status: "refused" as const }
        : { accepted: true },
    );
    render(snake(onActionIntent));
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button, { pointerId: 1 });
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("ROS topic is not allowed.")).toBeInTheDocument();
    expect(screen.queryByText("Not confirmed")).not.toBeInTheDocument();
  });
});

describe("the unconfirmed mark", () => {
  it("waits half a second before showing on a slow reply, then turns to STOP advice after the fast retries", async () => {
    const onActionIntent = vi.fn(() => new Promise<WidgetActionOutcome>(() => {}));
    render(toggleView({}, onActionIntent));

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Not confirmed")).not.toBeInTheDocument();
    await settle(500);
    expect(screen.getByText("Not confirmed")).toBeInTheDocument();
    await settle(3500);

    expect(screen.getByText("Robot has not confirmed — STOP if in doubt")).toBeInTheDocument();
  });

  it("speaks the profile's language", async () => {
    const [descriptor] = renderScreenDescriptors(
      {
        id: "drive",
        title: "Drive",
        canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
        widgets: [
          {
            id: "gripper",
            kind: "toggle",
            title: "Pince",
            layout: { x: 0, y: 0, width: 300, height: 168 },
            settings: { topic: "/g", messageType: "std_msgs/msg/Bool", onLabel: "Fermée", offLabel: "Ouverte" },
          },
        ],
      } as ScreenConfig,
      createDefaultWidgetRegistry(),
    );
    if (!descriptor) throw new Error("Missing toggle descriptor.");
    render(<div>{renderWidgetDescriptor(descriptor, { language: "fr", onActionIntent: lost })}</div>);

    fireEvent.click(screen.getByRole("button"));
    await settle(0);

    expect(screen.getByText("Non confirmé")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pince: Fermée, non confirmé" })).toBeInTheDocument();
  });
});
