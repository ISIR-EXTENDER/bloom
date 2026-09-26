/**
 * @vitest-environment jsdom
 */
import type { WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import type { WidgetActionOutcome } from "./types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Handler = (intent: WidgetActionIntent) => WidgetActionOutcome | Promise<WidgetActionOutcome>;

function holdButton(id: string, mode: string, onActionIntent: Handler) {
  return (
    <CommandLikeWidget
      descriptor={
        {
          widget: {
            id,
            kind: "command-button",
            title: id,
            layout: { x: 0, y: 0, width: 10, height: 10 },
            settings: {
              messageType: "std_msgs/msg/String",
              momentary: true,
              payload: { data: mode },
              releasedPayload: { data: "geometric/both" },
              topic: "/mode_request",
            },
          },
        } as never
      }
      onActionIntent={onActionIntent}
    />
  );
}

const tap = (button: HTMLElement, pointerId: number) => {
  fireEvent.pointerDown(button, { pointerId });
  fireEvent.pointerUp(button, { pointerId });
};

describe("a momentary hold queued behind a slow press", () => {
  // The second press used to go out after its release, leaving Snake on once the operator had let go.
  it("drops a press whose hold ended before its turn, and still lets go", async () => {
    let answerFirst: (outcome: WidgetActionOutcome) => void = () => {};
    const sent: unknown[] = [];
    const onActionIntent = vi.fn((intent: WidgetActionIntent) => {
      sent.push(intent.type === "topic-publish" ? intent.payload : null);
      return sent.length === 1
        ? new Promise<WidgetActionOutcome>((resolve) => {
            answerFirst = resolve;
          })
        : { accepted: true };
    });
    render(holdButton("snake", "geometric/snake", onActionIntent));
    const button = screen.getByRole("button");

    tap(button, 1);
    tap(button, 2);
    expect(button).toHaveAttribute("aria-pressed", "false");
    await act(async () => answerFirst({ accepted: true }));

    expect(sent).toEqual([{ data: "geometric/snake" }, { data: "geometric/both" }, { data: "geometric/both" }]);
  });
});

describe("a refused release retrying on a shared topic", () => {
  // Widget A's late retry published geometric/both over the Jaco widget B was holding.
  it("gives up once another widget has published on the topic", async () => {
    vi.useFakeTimers();
    const sent: { id: string; payload: unknown }[] = [];
    const onActionIntent = vi.fn((intent: WidgetActionIntent) => {
      if (intent.type !== "topic-publish") return { accepted: true };
      sent.push({ id: intent.widgetId, payload: intent.payload });
      return { accepted: !(intent.widgetId === "snake" && intent.release) };
    });
    render(
      <div>
        {holdButton("snake", "geometric/snake", onActionIntent)}
        {holdButton("jaco", "geometric/jaco", onActionIntent)}
      </div>,
    );
    const [snake, jaco] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];

    tap(snake, 1);
    fireEvent.pointerDown(jaco, { pointerId: 2 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(sent).toEqual([
      { id: "snake", payload: { data: "geometric/snake" } },
      { id: "snake", payload: { data: "geometric/both" } },
      { id: "jaco", payload: { data: "geometric/jaco" } },
    ]);
  });
});

describe("a release refused more than once", () => {
  // Each retry used to compare against the first release, so the second retry never went out.
  it("keeps retrying until the release is accepted", async () => {
    vi.useFakeTimers();
    let refusals = 2;
    const sent: unknown[] = [];
    const onActionIntent = vi.fn((intent: WidgetActionIntent) => {
      if (intent.type !== "topic-publish") return { accepted: true };
      sent.push(intent.payload);
      if (intent.release && refusals > 0) {
        refusals -= 1;
        return { accepted: false };
      }
      return { accepted: true };
    });
    render(holdButton("snake-retry", "geometric/snake", onActionIntent));

    tap(screen.getByRole("button"), 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(sent).toEqual([
      { data: "geometric/snake" },
      { data: "geometric/both" },
      { data: "geometric/both" },
      { data: "geometric/both" },
    ]);
  });
});

describe("a refused release retrying before a latched mode button", () => {
  // The latched Jaco never recorded its publish, so Snake's retry set geometric/both over it.
  it("gives up once the latched button has published on the topic", async () => {
    vi.useFakeTimers();
    const sent: { id: string; payload: unknown }[] = [];
    const onActionIntent = vi.fn((intent: WidgetActionIntent) => {
      if (intent.type !== "topic-publish") return { accepted: true };
      sent.push({ id: intent.widgetId, payload: intent.payload });
      return { accepted: !(intent.widgetId === "snake-latched" && intent.release) };
    });
    render(
      <div>
        {holdButton("snake-latched", "geometric/snake", onActionIntent)}
        <CommandLikeWidget
          descriptor={
            {
              widget: {
                id: "jaco-latched",
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
          onActionIntent={onActionIntent}
        />
      </div>,
    );
    const [snake, jaco] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];

    tap(snake, 1);
    fireEvent.click(jaco);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(sent).toEqual([
      { id: "snake-latched", payload: { data: "geometric/snake" } },
      { id: "snake-latched", payload: { data: "geometric/both" } },
      { id: "jaco-latched", payload: { data: "geometric/jaco" } },
    ]);
  });
});
