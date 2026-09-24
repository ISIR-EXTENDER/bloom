/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeTopicSampleMessage } from "./runtime-action-dispatcher";
import { useRuntimeTopicData } from "./use-runtime-topic-data";

const screen: ScreenConfig = {
  id: "readers",
  title: "Readers",
  canvas: { preset_id: "hd", runtime_mode: "fit" },
  widgets: [
    {
      id: "height",
      kind: "gauge",
      title: "Height",
      layout: { x: 0, y: 0, width: 200, height: 200 },
      settings: { topic: "/height", messageType: "std_msgs/msg/Float64", fieldPath: "data", min: 0, max: 1 },
    },
  ],
};

function sample(value: number): RuntimeTopicSampleMessage {
  return {
    type: "topic_sample",
    detail: "Received /height.",
    payload: {
      message_type: "std_msgs/msg/Float64",
      received_at: `t${value}`,
      topic: "/height",
      value: { data: value },
    },
  } as RuntimeTopicSampleMessage;
}

describe("useRuntimeTopicData", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("applies every sample of a frame in one state update, newest last", () => {
    const listeners = new Set<(message: RuntimeTopicSampleMessage) => void>();
    const onTopicSample = vi.fn((listener: (message: RuntimeTopicSampleMessage) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    });
    const renders: number[] = [];
    const { result } = renderHook(() => {
      const data = useRuntimeTopicData({
        onTopicSample,
        runtimeActionClient: {} as never,
        runtimeLink: { state: "connected", connectionCount: 1 } as never,
        screen,
      });
      renders.push(1);
      return data;
    });
    const rendersBefore = renders.length;
    act(() => {
      for (const listener of listeners) {
        listener(sample(0.2));
        listener(sample(0.4));
        listener(sample(0.6));
      }
    });
    expect(result.current.height).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(renders.length).toBe(rendersBefore + 1);
    const snapshot = result.current.height;
    expect(snapshot?.type === "gauge" && snapshot.value).toBe(0.6);
  });
});
