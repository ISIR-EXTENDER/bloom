/**
 * @vitest-environment jsdom
 */
import type { WidgetActionIntent } from "@bloom/widgets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";

function holdAndRelease(settings: Record<string, unknown>) {
  const onActionIntent = vi.fn((_intent: WidgetActionIntent) => ({ accepted: true }));
  render(
    <CommandLikeWidget
      descriptor={
        {
          widget: {
            id: "snake",
            kind: "command-button",
            title: "Snake",
            layout: { x: 0, y: 0, width: 10, height: 10 },
            settings: {
              messageType: "std_msgs/msg/String",
              momentary: true,
              payload: { data: "geometric/snake" },
              ...settings,
            },
          },
        } as never
      }
      onActionIntent={onActionIntent}
    />,
  );
  const button = screen.getByRole("button");
  fireEvent.pointerDown(button, { pointerId: 1 });
  fireEvent.pointerUp(button, { pointerId: 1 });
  return onActionIntent.mock.calls.map(([intent]) => intent);
}

describe("a held mode with no release payload", () => {
  afterEach(cleanup);

  // It let go with {}, which the server refuses, so the manager stayed in snake.
  it("lets go to Neutral on /mode_request", () => {
    const release = holdAndRelease({ topic: "/mode_request" }).at(-1);
    expect(release).toMatchObject({ payload: { data: "geometric/both" }, release: true, topic: "/mode_request" });
  });

  it("keeps an authored release payload and leaves other topics alone", () => {
    expect(
      holdAndRelease({ releasedPayload: { data: "geometric/jaco" }, topic: "/mode_request" }).at(-1),
    ).toMatchObject({
      payload: { data: "geometric/jaco" },
    });
    cleanup();
    expect(holdAndRelease({ topic: "/ui/other" }).at(-1)).toMatchObject({ payload: undefined, topic: "/ui/other" });
  });
});
