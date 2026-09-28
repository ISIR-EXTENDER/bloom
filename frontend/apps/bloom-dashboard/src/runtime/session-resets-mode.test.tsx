/**
 * @vitest-environment jsdom
 */
import type { RuntimeControlState } from "@bloom/api-client";
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

// The server resets shaping to geometric/both when a session ends: the old highlight is not what the robot has.
function controlClient(ownerModeRequest = "") {
  let listener: ((state: RuntimeControlState | null) => void) | undefined;
  let session = 0;
  const state = (isOwner: boolean): RuntimeControlState => ({
    active_sessions: 1,
    detail: "",
    is_owner: isOwner,
    owner_present: isOwner,
    session_id: `s${session}`,
    owner_mode_request: isOwner ? ownerModeRequest : "",
  });
  const client = {
    addRuntimeControlStateListener: vi.fn((next: (state: RuntimeControlState | null) => void) => {
      listener = next;
      session += 1;
      next(state(false));
      return () => undefined;
    }),
    claimRuntimeControl: vi.fn(async () => state(true)),
    releaseRuntimeControl: vi.fn(async () => state(false)),
    disconnectRuntime: vi.fn(),
    ensureRuntimeConnected: vi.fn(async () => undefined),
    publishRosTopic: vi.fn(async (request) => ({
      detail: "Published.",
      message_type: request.message_type,
      status: "published" as const,
      topic: request.topic,
    })),
  } satisfies RuntimeActionClient;
  const reconnect = () => {
    session += 1;
    act(() => listener?.(null));
    act(() => listener?.(state(false)));
  };
  return { client, reconnect };
}

async function openWithJacoRequested(client: RuntimeActionClient) {
  render(<App configurationClient={explorerManagerClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
  await waitFor(() => expect(document.querySelector("[data-runtime-control='owned']")).not.toBeNull());
  fireEvent.click(await screen.findByRole("button", { name: /^Jaco/ }));
  await waitFor(() => expect(pressedState(/^Jaco/)).toBe("true"));
}

describe("the requested mode on a new runtime session", () => {
  it("is unknown after a reconnect: Jaco is no longer lit", async () => {
    const { client, reconnect } = controlClient();
    await openWithJacoRequested(client);

    reconnect();
    await waitFor(() => expect(client.claimRuntimeControl).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(pressedState(/^Jaco/)).toBe("false"));
    expect(pressedState(/^Both/)).toBe("false");
  }, 20000);

  it("follows the server's owner mode request when the session takes control", async () => {
    const { client, reconnect } = controlClient("geometric/both");
    await openWithJacoRequested(client);

    reconnect();

    await waitFor(() => expect(pressedState(/^Both/)).toBe("true"));
    expect(pressedState(/^Jaco/)).toBe("false");
  }, 20000);

  it("is unknown after leaving the app and returning to it", async () => {
    const { client } = controlClient();
    await openWithJacoRequested(client);

    act(() => {
      window.location.hash = "#/runtime";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Jaco/ })).toBeNull());
    act(() => {
      window.location.hash = "#/runtime/app";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    await waitFor(() => expect(client.claimRuntimeControl).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(pressedState(/^Jaco/)).toBe("false"));
  }, 20000);
});
