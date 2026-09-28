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

const modeOf = (request: RosTopicPublishRequest) =>
  (request.payload as { data?: unknown } | undefined)?.data ?? request.payload_text;
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

describe("a refused mode request while an older one has no reply", () => {
  it("marks the older mode not confirmed instead of hiding it", async () => {
    const client = {
      publishRosTopic: vi.fn((request: RosTopicPublishRequest) =>
        modeOf(request) === "geometric/jaco"
          ? new Promise<never>(() => {})
          : Promise.reject(new BloomApiError("Forbidden", 403, JSON.stringify({ detail: "Not allowed." }))),
      ),
    } satisfies RuntimeActionClient;
    await openExplorer(client);

    fireEvent.click(await screen.findByRole("button", { name: /^Jaco/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Both/ }));
    await waitFor(() => expect(client.publishRosTopic).toHaveBeenCalledTimes(2));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Jaco/ }).closest("[data-selection]")).toHaveAttribute(
        "data-selection",
        "unconfirmed",
      ),
    );
  }, 20000);
});

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
    await waitFor(() => expect(snake).not.toHaveAttribute("data-confirmed"));

    fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalled());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Hold snake/ })).toHaveAttribute("aria-pressed", "false"),
    );
  }, 20000);
});
