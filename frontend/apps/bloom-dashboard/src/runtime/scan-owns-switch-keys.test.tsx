/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const PERIOD_MS = 800;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lit = () => document.querySelector<HTMLElement>("[data-scan-lit]");

// A switch key as a browser delivers it, on the focused element or on window, with the native click a browser
// would add to a focused button (Enter on keydown and each repeat, Space on keyup) unless the key was prevented.
async function pressSwitch({ holdMs = 0, on = "focus" }: { holdMs?: number; on?: "focus" | "window" } = {}) {
  const key = " ";
  const send = (type: "keyDown" | "keyUp", repeat = false) => {
    const target = on === "window" ? window : (document.activeElement ?? document.body);
    let notPrevented = true;
    act(() => {
      notPrevented = fireEvent[type](target, { key, repeat });
    });
    // Under scan nothing may be left to a native click.
    expect(notPrevented).toBe(false);
  };
  send("keyDown");
  for (let held = 0; held < holdMs; held += 100) {
    await act(() => wait(100));
    send("keyDown", true);
  }
  send("keyUp");
}

function scanProfile() {
  window.localStorage.setItem(
    "bloom.runtime-user-preferences.v1",
    JSON.stringify({
      profileOverrides: {
        "explorer-manager:explorer-manager:operator": { motorAccessibilityPreset: "scan", scanPeriodMs: PERIOD_MS },
      },
      profilePreferences: { "explorer-manager:explorer-manager": "operator" },
      recentRuntimeSelections: [],
    }),
  );
}

function stopClient(options: { assertFails?: boolean } = {}) {
  let stopped = false;
  let latch = 0;
  const state = (): RuntimeStopState => ({
    stopped,
    asserted: stopped && !options.assertFails,
    engaged_at: stopped ? `latch-${latch}` : "",
    detail: stopped && options.assertFails ? "Runtime stop latched, but ROS assertion failed." : "",
  });
  return {
    engageRuntimeStop: vi.fn(async () => {
      stopped = true;
      latch += 1;
      if (options.assertFails) {
        throw new Error("Bloom API request failed with status 503");
      }
      return state();
    }),
    getRuntimeStopState: vi.fn(async () => state()),
    resumeRuntimeStop: vi.fn(async () => {
      stopped = false;
      return state();
    }),
    publishRosTopic: vi.fn(),
  } satisfies RuntimeActionClient;
}

type Surface = "main screen" | "maintenance sheet" | "settings" | "tour";

async function openMaintenance() {
  const menu = screen.getByRole("button", { name: "Hold to open maintenance" });
  fireEvent.pointerDown(menu);
  await act(() => wait(1600));
  fireEvent.pointerUp(menu);
  return screen.findByRole("dialog");
}

// A caregiver's direct tap: pointer down and up, then the click a browser sends.
function tap(element: HTMLElement) {
  fireEvent.pointerDown(element);
  fireEvent.pointerUp(element);
  fireEvent.click(element, { detail: 1 });
}

async function openOn(surface: Surface, client: RuntimeActionClient) {
  render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
  await screen.findByRole("button", { name: "Stop the robot" });
  if (surface === "main screen") {
    return;
  }
  const sheet = await openMaintenance();
  if (surface === "settings") {
    tap(within(sheet).getByRole("button", { name: /^Settings/ }));
    await screen.findByRole("region", { name: "Settings" });
  } else if (surface === "tour") {
    tap(within(sheet).getByRole("button", { name: "Practice tour" }));
    await screen.findByRole("region", { name: /tour|practice/i });
  }
}

async function untilLit(element: () => HTMLElement | null, timeout = PERIOD_MS * 4) {
  await waitFor(() => expect(lit()).not.toBeNull(), { timeout });
  await waitFor(() => expect(lit()).toBe(element()), { timeout });
}

async function untilLitIsNot(predicate: (element: HTMLElement) => boolean) {
  await waitFor(() => expect(lit() && !predicate(lit() as HTMLElement)).toBe(true), { timeout: PERIOD_MS * 4 });
}

const stopButton = () => screen.queryByRole("button", { name: "Stop the robot" });
const stopAgainButton = () => screen.queryByRole("button", { name: "Stop the robot again" });
const resumeButton = () =>
  screen.queryByRole("button", { name: /Hold for one second to resume|Press again to resume/ });
const isStopChrome = (element: HTMLElement) => element.hasAttribute("data-scan-priority");

describe.each<Surface>(["main screen", "maintenance sheet", "settings", "tour"])(
  "switch keys under scan on the %s",
  (surface) => {
    afterEach(() => {
      cleanup();
      window.localStorage.clear();
      window.location.hash = "";
    });

    it("stops, resumes only on two presses, then fires the lit target and never STOP", async () => {
      scanProfile();
      const client = stopClient();
      await openOn(surface, client);

      // STOP opens the cycle; the press lands wherever focus is.
      await untilLit(stopButton);
      await pressSwitch();
      await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledOnce());

      // A 1.2 s press on a focused Resume is one press: it arms, never resumes by Resume's own key hold.
      await untilLit(resumeButton);
      resumeButton()?.focus();
      await pressSwitch({ holdMs: 1200 });
      await screen.findByRole("button", { name: /Press again to resume/ });
      expect(client.resumeRuntimeStop).not.toHaveBeenCalled();
      await untilLit(resumeButton);
      await pressSwitch({ on: "window" });
      await waitFor(() => expect(client.resumeRuntimeStop).toHaveBeenCalledOnce());

      // Focus resting on STOP must not turn the next press into a STOP while something else is lit.
      await waitFor(() => expect(stopButton()).not.toBeNull());
      stopButton()?.focus();
      await untilLitIsNot(isStopChrome);
      const target = lit() as HTMLElement;
      const fired = vi.fn();
      // Every scan activation announces itself this way first, whether the control then takes a click or not.
      target.addEventListener("bloom-assistive-activate", fired);
      await pressSwitch();
      expect(fired).toHaveBeenCalledOnce();
      expect(client.engageRuntimeStop).toHaveBeenCalledOnce();
    }, 30000);

    it("re-sends STOP from STOP again when the assertion fails, then reaches Resume", async () => {
      scanProfile();
      const client = stopClient({ assertFails: true });
      await openOn(surface, client);

      await untilLit(stopButton);
      await pressSwitch();
      await waitFor(() => expect(stopAgainButton()).not.toBeNull());

      await untilLit(stopAgainButton);
      stopAgainButton()?.focus();
      await pressSwitch();
      await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledTimes(2));

      // A focused STOP again is no longer exempt: the press on Resume arms it, and STOP is not sent a third time.
      await untilLit(resumeButton);
      await pressSwitch();
      await screen.findByRole("button", { name: /Press again to resume/ });
      expect(client.engageRuntimeStop).toHaveBeenCalledTimes(2);
      expect(client.resumeRuntimeStop).not.toHaveBeenCalled();
    }, 30000);
  },
);
