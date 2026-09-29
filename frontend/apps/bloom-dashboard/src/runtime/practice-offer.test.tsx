/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient as configurationClient } from "../test-support/configuration-client";
import { installFakeClock, uninstallFakeClock } from "../test-support/fake-clock";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import { RuntimeKioskBar } from "./RuntimeKioskBar";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;
HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;

const application = {
  id: "explorer-manager",
  name: "Explorer Manager",
  screens: [
    { id: "drive", title: "Drive", canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, widgets: [] },
  ],
} as unknown as ApplicationConfig;

function renderOffer(language: "en" | "es" | "fr" = "en") {
  const offer = { onAccept: vi.fn(), onDismiss: vi.fn() };
  render(
    <RuntimeKioskBar
      application={application}
      commandFrameId="base_link"
      language={language}
      onEditApplication={vi.fn()}
      onEditScreen={vi.fn()}
      onLanguageChange={vi.fn()}
      onOpenAppLibrary={vi.fn()}
      onOpenHelp={vi.fn()}
      onOpenLanding={vi.fn()}
      onOpenSettings={vi.fn()}
      onOpenSupervisor={vi.fn()}
      onOpenTour={vi.fn()}
      onSelectScreen={vi.fn()}
      onSuspendTeleop={vi.fn()}
      profile={{ id: "operator", layoutId: "drive_operator", name: "Operator" }}
      screen={application.screens[0] as ScreenConfig}
      tourOffer={offer}
    />,
  );
  return offer;
}

/** Lights `name` without waiting out the cycle, then presses the switch. */
async function switchPressOn(name: RegExp) {
  const target = await waitFor(
    () => {
      const match = [...document.querySelectorAll<HTMLElement>("button")].find((button) =>
        name.test(button.getAttribute("aria-label") ?? button.textContent ?? ""),
      );
      if (!match?.hasAttribute("data-scan-lit")) {
        throw new Error("not lit yet");
      }
      return match;
    },
    { timeout: 20000 },
  );
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
  });
  return target;
}

describe("the practice offer in the bar", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = "";
  });

  // Two bare links, "Practice first" and "Not now", said neither what practice was nor that nothing reaches the robot.
  it("says what practice is, in the offer itself, and names both ways out", () => {
    const offer = renderOffer();

    const group = screen.getByRole("group", { name: "Practice offer" });
    expect(within(group).getByText("Try the controls first — nothing is sent to the robot.")).toBeVisible();
    const start = within(group).getByRole("button", { name: "Start practice" });
    expect(start).toHaveAccessibleDescription("Try the controls first — nothing is sent to the robot.");
    const hide = within(group).getByRole("button", { name: "Hide the practice offer" });
    expect(hide).toHaveTextContent("Hide");

    fireEvent.click(start);
    expect(offer.onAccept).toHaveBeenCalledOnce();
    fireEvent.click(hide);
    expect(offer.onDismiss).toHaveBeenCalledOnce();
  });

  it.each([
    ["es", "Oferta de práctica", "Practicar", "Ocultar la oferta de práctica"],
    ["fr", "Offre d'entraînement", "S'entraîner", "Masquer l'offre d'entraînement"],
  ] as const)("names it in %s", (language, groupName, startName, hideName) => {
    renderOffer(language);

    const group = screen.getByRole("group", { name: groupName });
    expect(within(group).getByRole("button", { name: startName })).toBeVisible();
    expect(within(group).getByRole("button", { name: hideName })).toBeVisible();
  });

  it("starts practice from the maintenance menu once the offer is hidden", async () => {
    render(<App configurationClient={configurationClient()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager", "Bench");
    await screen.findByRole("region", { name: "Runtime application" });

    fireEvent.click(screen.getByRole("button", { name: "Hide the practice offer" }));
    expect(screen.queryByRole("group", { name: "Practice offer" })).not.toBeInTheDocument();

    // Bench opens the menu with a tap; the entry matches the offer's word.
    fireEvent.click(screen.getByRole("button", { name: "Open maintenance" }));
    const sheet = await screen.findByRole("dialog", { name: "Maintenance" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Practice" }));
    expect(await screen.findByRole("region", { name: "Practice this app" })).toBeVisible();
  });

  // The hide flag is keyed per role, like the setting: the two never fight.
  it("hides for the role that hid it, and leaves the other role's first entry intact", async () => {
    const client = configurationClient();
    const { unmount } = render(<App configurationClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager", "Operator");
    await screen.findByRole("region", { name: "Runtime application" });
    fireEvent.click(screen.getByRole("button", { name: "Hide the practice offer" }));
    expect(JSON.parse(window.localStorage.getItem("bloom.guided-tour-offer.v1") ?? "[]")).toEqual([
      "runtime:explorer-manager:explorer-manager:operator",
    ]);
    unmount();

    window.history.replaceState(null, "", "#/runtime");
    render(<App configurationClient={client} />);
    await screen.findByRole("button", { name: "Explorer Manager" });
    await openRuntimeApp("Explorer Manager", "Bench");
    await screen.findByRole("region", { name: "Runtime application" });
    expect(await screen.findByRole("group", { name: "Practice offer" })).toBeVisible();
  });

  it("brings the offer back for the role that chose Offer at start, not for the other", async () => {
    window.localStorage.setItem(
      "bloom.guided-tour-offer.v1",
      JSON.stringify([
        "runtime:explorer-manager:explorer-manager:operator",
        "runtime:explorer-manager:explorer-manager:bench",
      ]),
    );
    const client = configurationClient();
    const { unmount } = render(<App configurationClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager", "Bench");
    await screen.findByRole("region", { name: "Runtime application" });
    expect(screen.queryByRole("group", { name: "Practice offer" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open maintenance" }));
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    const card = within(screen.getByRole("region", { name: "Settings" })).getByRole("group", {
      name: "Practice offer",
    });
    fireEvent.click(within(card).getByRole("button", { name: "Offer at start" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));
    expect(await screen.findByRole("group", { name: "Practice offer" })).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem("bloom.guided-tour-offer.v1") ?? "[]")).toEqual([
      "runtime:explorer-manager:explorer-manager:operator",
    ]);
    unmount();

    window.history.replaceState(null, "", "#/runtime");
    render(<App configurationClient={client} />);
    await screen.findByRole("button", { name: "Explorer Manager" });
    await openRuntimeApp("Explorer Manager", "Operator");
    await screen.findByRole("region", { name: "Runtime application" });
    expect(screen.queryByRole("group", { name: "Practice offer" })).not.toBeInTheDocument();
  });

  it("never remembers a Hide pressed in a Builder preview", async () => {
    const client = configurationClient();
    const { unmount } = render(<App configurationClient={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Screen library" }));
    fireEvent.click(await screen.findByRole("button", { name: /Preview Drive · Operator screen runtime/ }));
    await screen.findByRole("button", { name: "Back to Builder" });

    fireEvent.click(await screen.findByRole("button", { name: "Hide the practice offer" }));
    expect(screen.queryByRole("group", { name: "Practice offer" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("bloom.guided-tour-offer.v1")).toBeNull();
    unmount();

    window.history.replaceState(null, "", "#/runtime");
    render(<App configurationClient={client} />);
    await screen.findByRole("button", { name: "Explorer Manager" });
    await openRuntimeApp("Explorer Manager", "Operator");
    await screen.findByRole("region", { name: "Runtime application" });
    expect(await screen.findByRole("group", { name: "Practice offer" })).toBeVisible();
  });

  it("scans Start practice and Hide with the other bar controls, and the switch starts practice", async () => {
    installFakeClock();
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: {
          "explorer-manager:explorer-manager:operator": { motorAccessibilityPreset: "scan", scanPeriodMs: 600 },
        },
        profilePreferences: { "explorer-manager:explorer-manager": "operator" },
        recentRuntimeSelections: [],
      }),
    );
    const client = { publishRosTopic: vi.fn() } satisfies RuntimeActionClient;
    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    await screen.findByRole("group", { name: "Practice offer" });

    const lit = new Set<string>();
    const observer = new MutationObserver(() => {
      for (const element of document.querySelectorAll("[data-scan-lit]")) {
        lit.add((element.getAttribute("aria-label") ?? element.textContent ?? "").trim());
      }
    });
    observer.observe(document.body, { attributeFilter: ["data-scan-lit"], attributes: true, subtree: true });
    await waitFor(() => expect(lit.has("Hide the practice offer") && lit.has("Start practice")).toBe(true), {
      timeout: 30000,
    });
    observer.disconnect();

    await switchPressOn(/^Start practice$/);
    expect(await screen.findByRole("region", { name: "Practice this app" })).toBeVisible();
    expect(client.publishRosTopic).not.toHaveBeenCalled();
    uninstallFakeClock();
  }, 60000);
});
