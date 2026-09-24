import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient as configurationClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;

describe("focus follows the view that opens", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
  });

  it("lands on the runtime region, on Settings, and back again on Escape", async () => {
    render(<App configurationClient={configurationClient()} runtimeActionClient={{ publishRosTopic: vi.fn() }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");

    // Opening an app used to focus an unnamed wrapper div.
    const runtimeRegion = await screen.findByRole("region", { name: "Runtime application" });
    await waitFor(() => expect(document.activeElement).toBe(runtimeRegion));

    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to open maintenance" }));
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }, { timeout: 3000 }));
    const settings = await screen.findByRole("region", { name: "Settings" });
    await waitFor(() => expect(document.activeElement).toBe(settings));

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("region", { name: "Runtime application" })),
    );
  }, 30000);

  it("follows a screen change made from maintenance", async () => {
    render(<App configurationClient={configurationClient()} runtimeActionClient={{ publishRosTopic: vi.fn() }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    await screen.findByRole("region", { name: "Runtime application" });

    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to open maintenance" }));
    const nav = await screen.findByRole("navigation", { name: "Switch runtime screen" }, { timeout: 3000 });
    const otherScreen = [...nav.querySelectorAll("button")].find((button) => !button.getAttribute("aria-current"));
    fireEvent.click(otherScreen as HTMLButtonElement);

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("region", { name: "Runtime application" })),
    );
  }, 30000);
});
