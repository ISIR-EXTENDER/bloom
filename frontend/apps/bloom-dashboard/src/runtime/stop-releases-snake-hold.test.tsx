/**
 * @vitest-environment jsdom
 */
import { BloomApiError, type RosTopicPublishRequest, type RuntimeStopState } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

afterEach(() => {
  cleanup();
  window.location.hash = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const published = (request: RosTopicPublishRequest) => ({
  detail: "Published.",
  message_type: request.message_type,
  status: "published" as const,
  topic: request.topic,
});

async function openExplorer(client: RuntimeActionClient) {
  render(<App configurationClient={explorerManagerClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
}

describe("an asserted STOP during a Snake hold", () => {
  it("shows Snake released, though its release was refused by the latch", async () => {
    let state: RuntimeStopState = { stopped: false, asserted: false, engaged_at: "", detail: "" };
    const client = {
      engageRuntimeStop: vi.fn(async () => {
        state = { stopped: true, asserted: true, engaged_at: "2026-09-28T12:00:00Z", detail: "" };
        return state;
      }),
      getRuntimeStopState: vi.fn(async () => state),
      resumeRuntimeStop: vi.fn(async () => state),
      publishRosTopic: vi.fn(async (request: RosTopicPublishRequest) => {
        if (state.stopped) {
          throw new BloomApiError("Stopped", 409, JSON.stringify({ detail: "Runtime stop is latched." }));
        }
        return published(request);
      }),
    } satisfies RuntimeActionClient;
    await openExplorer(client);

    const snake = await screen.findByRole("button", { name: /^Hold snake/ });
    fireEvent.pointerDown(snake, { pointerId: 1 });
    await waitFor(() => expect(snake).toHaveAttribute("aria-pressed", "true"));

    fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalled());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Hold snake/ })).toHaveAttribute("aria-pressed", "false"),
    );
  }, 20000);
});
