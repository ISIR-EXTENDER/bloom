import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient as configurationClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;

async function openMaintenance() {
  render(<App configurationClient={configurationClient()} runtimeActionClient={{ publishRosTopic: vi.fn() }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
  const opener = await screen.findByRole("button", { name: "Hold to open maintenance" });
  fireEvent.pointerDown(opener);
  const dialog = await screen.findByRole("dialog", { name: "Maintenance" }, { timeout: 3000 });
  return { dialog, opener };
}

describe("focus and the maintenance sheet", () => {
  it("moves focus into the dialog, keeps Tab inside it, and gives it back on Escape", async () => {
    const user = userEvent.setup({ document });
    const { dialog, opener } = await openMaintenance();

    expect(dialog.contains(document.activeElement)).toBe(true);

    // The scrimmed artboard is hidden from screen readers by aria-modal; Tab
    // must not walk into it.
    for (let press = 0; press < 30; press += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
  }, 30000);
});
