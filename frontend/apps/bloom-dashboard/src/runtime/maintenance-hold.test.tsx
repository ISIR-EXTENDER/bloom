/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient as configurationClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient, RuntimeTeleopCommandRequest } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;

const isZero = (request: RuntimeTeleopCommandRequest) =>
  [request.linear.x, request.linear.y, request.linear.z, request.angular.x, request.angular.y, request.angular.z].every(
    (value) => value === 0,
  );

describe("maintenance holds the robot, and STOP outranks it (plan §8.3)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
  });

  it("zeros a held control when the sheet opens, sends no motion while open, and still engages STOP", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({ profilePreferences: { "explorer-manager:explorer-manager": "bench" } }),
    );
    const sent: RuntimeTeleopCommandRequest[] = [];
    const stopped: RuntimeStopState = {
      asserted: true,
      detail: "Runtime stop engaged.",
      engaged_at: "2026-09-17T10:00:00+00:00",
      stopped: true,
    };
    const client = {
      engageRuntimeStop: vi.fn(async () => stopped),
      publishRosTopic: vi.fn(async (request) => ({
        detail: "Published.",
        message_type: request.message_type,
        status: "published" as const,
        topic: request.topic,
      })),
      sendTeleopCommand: vi.fn(async (request: RuntimeTeleopCommandRequest) => {
        sent.push(request);
        return {
          detail: "ok",
          payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
          type: "teleop_ack" as const,
        };
      }),
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    const translation = await screen.findByRole("application", { name: "Translation" });

    for (let step = 0; step < 4; step += 1) {
      fireEvent.keyDown(translation, { key: "ArrowUp" });
    }
    await waitFor(() => expect(sent.some((request) => !isZero(request))).toBe(true));

    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to open maintenance" }));
    await screen.findByRole("dialog", { name: "Maintenance" }, { timeout: 3000 });

    await waitFor(() => expect(sent.at(-1) && isZero(sent.at(-1) as RuntimeTeleopCommandRequest)).toBe(true));
    const whileOpen = sent.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(sent.slice(whileOpen).every(isZero)).toBe(true);
    expect(screen.getByText("zeros held")).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Hold for one second to resume" }).getAttribute("data-stopped")).toBe(
        "true",
      ),
    );
  }, 20000);

  it.each([
    ["Settings", "Settings"],
    ["Practice tour", "Practice this app"],
  ])(
    "keeps STOP live and engageable while %s is open",
    async (action, region) => {
      const client = {
        engageRuntimeStop: vi.fn(
          async (): Promise<RuntimeStopState> => ({
            asserted: true,
            detail: "Runtime stop engaged.",
            engaged_at: "2026-09-17T10:00:00+00:00",
            stopped: true,
          }),
        ),
        publishRosTopic: vi.fn(),
      } satisfies RuntimeActionClient;

      render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
      fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
      await openRuntimeApp("Explorer Manager");
      fireEvent.pointerDown(await screen.findByRole("button", { name: "Hold to open maintenance" }));
      fireEvent.click(await screen.findByRole("button", { name: action }, { timeout: 3000 }));
      await screen.findByRole("region", { name: region });

      fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
      await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledOnce());
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Hold for one second to resume" }).getAttribute("data-stopped")).toBe(
          "true",
        ),
      );
      expect(screen.getByRole("region", { name: region })).toBeTruthy();
    },
    20000,
  );
});
