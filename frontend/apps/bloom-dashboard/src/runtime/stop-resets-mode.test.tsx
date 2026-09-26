/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;

afterEach(() => {
  cleanup();
  window.location.hash = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const pressedState = (name: RegExp) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

// The backend's STOP sends geometric/both since 59f56a8; the Jaco button stayed lit through it.
describe("the requested mode after STOP", () => {
  it.each([
    [true, "true"],
    [false, "false"],
  ])(
    "unlights Jaco and lights Both only if the STOP was asserted (asserted %s)",
    async (asserted, bothPressed) => {
      let state: RuntimeStopState = { stopped: false, asserted: false, engaged_at: "", detail: "" };
      const client = {
        engageRuntimeStop: vi.fn(async () => {
          state = { stopped: true, asserted, engaged_at: "2026-09-26T12:00:00Z", detail: "" };
          return state;
        }),
        getRuntimeStopState: vi.fn(async () => state),
        resumeRuntimeStop: vi.fn(async () => {
          state = { stopped: false, asserted: false, engaged_at: "", detail: "" };
          return state;
        }),
        publishRosTopic: vi.fn(async (request) => ({
          detail: "Published.",
          message_type: request.message_type,
          status: "published" as const,
          topic: request.topic,
        })),
      } satisfies RuntimeActionClient;

      render(<App configurationClient={explorerManagerClient()} runtimeActionClient={client} />);
      fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
      await openRuntimeApp("Explorer Manager");
      fireEvent.click(await screen.findByRole("button", { name: /^Jaco/ }));
      await waitFor(() => expect(pressedState(/^Jaco/)).toBe("true"));

      fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
      await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalled());
      await act(async () => {
        await client.resumeRuntimeStop();
      });
      await waitFor(() => expect(screen.getByRole("button", { name: "Stop the robot" })).toBeTruthy(), {
        timeout: 3000,
      });

      expect(pressedState(/^Jaco/)).toBe("false");
      expect(pressedState(/^Both/)).toBe(bothPressed);
    },
    20000,
  );
});
