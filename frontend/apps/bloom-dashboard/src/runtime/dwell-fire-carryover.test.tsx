import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient as configurationClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;
HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;

const DWELL_MS = 300;
const wait = (ms: number) => new Promise((settle) => setTimeout(settle, ms));

async function openDwellRuntime() {
  window.localStorage.setItem(
    "bloom.runtime-user-preferences.v1",
    JSON.stringify({
      profileOverrides: {
        "explorer-manager:explorer-manager:operator": { dwellEnabled: true, dwellMs: DWELL_MS },
      },
      profilePreferences: { "explorer-manager:explorer-manager": "operator" },
      recentRuntimeSelections: [],
    }),
  );
  const client = { publishRosTopic: vi.fn() } satisfies RuntimeActionClient;
  render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
  await screen.findByRole("button", { name: /^Gripper: Close gripper/ });
  return client;
}

// The maintenance button is far from where the later rests happen.
async function openSheet() {
  fireEvent.pointerMove(await screen.findByRole("button", { name: /maintenance/i }), { clientX: 900, clientY: 20 });
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Maintenance" })).toBeTruthy(), { timeout: 5000 });
}

async function restUntilGone(name: string | RegExp, gone: () => boolean) {
  fireEvent.pointerMove(screen.getByRole("button", { name }), { clientX: 200, clientY: 300 });
  await waitFor(() => expect(gone()).toBe(true), { timeout: 5000 });
}

// Head-pointer tremor, 1-2 px around the fire point, for well over a dwell time.
async function tremorOn(element: HTMLElement) {
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [2, 1],
    [1, 2],
    [0, 0],
    [-1, 1],
  ]) {
    fireEvent.pointerMove(element, { clientX: 200 + dx, clientY: 300 + dy });
    await wait(DWELL_MS / 2);
  }
  await wait(DWELL_MS * 2);
}

const gripperPublishes = (client: { publishRosTopic: ReturnType<typeof vi.fn> }) =>
  client.publishRosTopic.mock.calls.filter(([request]) => JSON.stringify(request).includes("gripper")).length;

const noSheet = () => screen.queryByRole("dialog", { name: "Maintenance" }) === null;

describe("a dwell that fires in one surface", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("does not continue onto the gripper under the sheet's Resume operating, and a later rest still works", async () => {
    const client = await openDwellRuntime();
    await openSheet();
    await restUntilGone("Resume operating", noSheet);

    const gripper = screen.getByRole("button", { name: /^Gripper: Close gripper/ });
    await tremorOn(gripper);
    expect(gripperPublishes(client)).toBe(0);

    // A deliberate move away and back is a new rest.
    fireEvent.pointerMove(gripper, { clientX: 600, clientY: 500 });
    await waitFor(() => expect(gripperPublishes(client)).toBe(1), { timeout: 5000 });
  }, 30000);

  it.each(["Save and resume", "Discard changes"])(
    "does not continue from Settings' %s onto the control beneath",
    async (name) => {
      const client = await openDwellRuntime();
      await openSheet();
      fireEvent.pointerMove(screen.getByRole("button", { name: "Settings" }), { clientX: 500, clientY: 120 });
      await screen.findByRole("button", { name }, { timeout: 5000 });
      await restUntilGone(name, () => screen.queryByRole("button", { name }) === null);

      await tremorOn(screen.getByRole("button", { name: /^Gripper: Close gripper/ }));
      expect(gripperPublishes(client)).toBe(0);
    },
    30000,
  );

  it("does not continue from the tour's close onto the control beneath", async () => {
    const client = await openDwellRuntime();
    await openSheet();
    fireEvent.pointerMove(screen.getByRole("button", { name: "Practice" }), { clientX: 500, clientY: 120 });
    await screen.findByRole("button", { name: "Close practice" }, { timeout: 5000 });
    await restUntilGone("Close practice", () => screen.queryByRole("button", { name: "Close practice" }) === null);

    await tremorOn(screen.getByRole("button", { name: /^Gripper: Close gripper/ }));
    expect(gripperPublishes(client)).toBe(0);
  }, 30000);

  it("does not continue from a screen chosen in the sheet onto the new screen's control beneath", async () => {
    const client = await openDwellRuntime();
    await openSheet();
    await restUntilGone("Joystick lab", noSheet);
    // A new screen: the gripper under the pointer is another screen's control.
    const gripper = screen.getByRole("button", { name: /^Gripper: Close gripper/ });

    await tremorOn(gripper);
    expect(gripperPublishes(client)).toBe(0);
  }, 30000);
});
