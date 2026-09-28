import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createCommandStateServer } from "../test-support/command-state-server";
import { explorerManagerClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

/**
 * End to end through the real App: a mode button lights from the backend's store (ADR 0142), fed by the runtime
 * socket, and a press only sends. The fake server writes what it publishes, as the backend does.
 */
function createConfigurationClient() {
  return explorerManagerClient();
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const pressedState = (name: RegExp) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

function createRuntimeActionClient(server = createCommandStateServer()) {
  return {
    addRuntimeCommandStateListener: server.addRuntimeCommandStateListener,
    listRosTopicStatus: vi.fn(async () => [
      {
        name: "/mode_request",
        message_type: "std_msgs/msg/String",
        publisher_count: 1,
        subscription_count: 1,
      },
    ]),
    publishRosTopic: vi.fn(async (request) => {
      const data = (request.payload as { data?: unknown } | undefined)?.data;
      if (request.topic === "/mode_request" && typeof data === "string" && data.startsWith("geometric/")) {
        server.write({ "manager:shaping": data });
      }
      return {
        detail: "Published.",
        message_type: request.message_type,
        status: "published" as const,
        topic: request.topic,
      };
    }),
  } satisfies RuntimeActionClient;
}

describe("pressing a mode button", () => {
  it("lights what the store holds, which the server wrote for the press", async () => {
    const server = createCommandStateServer();
    render(
      <App configurationClient={createConfigurationClient()} runtimeActionClient={createRuntimeActionClient(server)} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");

    expect(await screen.findByRole("button", { name: /^Jaco: Unknown/ })).toBeTruthy();
    expect(pressedState(/^Both/)).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: /^Jaco/ }));
    await waitFor(() => {
      expect(pressedState(/^Jaco/)).toBe("true");
      expect(pressedState(/^Both/)).toBe("false");
    });

    fireEvent.click(screen.getByRole("button", { name: /^Both/ }));
    await waitFor(() => {
      expect(pressedState(/^Both/)).toBe("true");
      expect(pressedState(/^Jaco/)).toBe("false");
    });
  });

  it("follows a change another tablet made", async () => {
    const server = createCommandStateServer();
    render(
      <App configurationClient={createConfigurationClient()} runtimeActionClient={createRuntimeActionClient(server)} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    await screen.findByRole("button", { name: /^Jaco/ });

    act(() => server.write({ "manager:shaping": "geometric/jaco" }, "0123456789ab"));
    await waitFor(() => expect(pressedState(/^Jaco/)).toBe("true"));

    act(() => server.disconnect());
    await waitFor(() => expect(screen.getByRole("button", { name: /^Jaco: Unknown/ })).toBeTruthy());
    expect(pressedState(/^Jaco/)).toBe("false");
  });
});
