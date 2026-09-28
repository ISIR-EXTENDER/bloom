import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient as configurationClient } from "../test-support/configuration-client";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;
HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;

const wait = (ms: number) => new Promise((settle) => setTimeout(settle, ms));

describe("Back to Builder under dwell", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  // It leaves for a page with no dwell: a caregiver opens it by touch.
  it("does not fire on a rest, and a tap still works", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: {
          "explorer-manager:explorer-manager:operator": { dwellEnabled: true, dwellMs: 300 },
        },
        profilePreferences: { "explorer-manager:explorer-manager": "operator" },
        recentRuntimeSelections: [],
      }),
    );
    const client = { publishRosTopic: vi.fn() } satisfies RuntimeActionClient;
    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Screen library" }));
    fireEvent.click(await screen.findByRole("button", { name: /Preview Drive · Operator screen runtime/ }));

    const back = await screen.findByRole("button", { name: "Back to Builder" });
    expect(back.hasAttribute("data-scan-touch-only")).toBe(true);
    for (const [x, y] of [
      [700, 20],
      [701, 21],
      [700, 22],
    ]) {
      fireEvent.pointerMove(back, { clientX: x, clientY: y });
      await wait(400);
    }
    await wait(600);
    expect(screen.getByRole("region", { name: "Runtime application" })).toBeTruthy();

    fireEvent.click(back);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Runtime application" })).toBeNull());
  }, 30000);
});
