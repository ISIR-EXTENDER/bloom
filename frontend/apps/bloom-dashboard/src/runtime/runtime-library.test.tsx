/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import petanqueAdminConfiguration from "../../../../../backend/seed/applications/petanque-admin.json";
import sandboxConfiguration from "../../../../../backend/seed/applications/sandbox.json";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import { collectLibraryApps, describeProfile, RuntimeHome, rememberedProfileId } from "./RuntimeHome";
import { getRuntimeStrings } from "./strings";

function loaded(id: string, bundle: unknown): LoadedConfiguration {
  return { bundle: structuredClone(bundle) as ConfigurationBundle, id } as LoadedConfiguration;
}

const configurations = [
  loaded("explorer-manager", explorerManagerConfiguration),
  loaded("petanque-admin", petanqueAdminConfiguration),
  loaded("sandbox", sandboxConfiguration),
];

function renderLibrary(profilePreferences: Record<string, string> = {}) {
  const handlers = {
    onOpenRuntimeApp: vi.fn(),
    onOpenSupervisorApp: vi.fn(),
    onProfilePreferenceChange: vi.fn(),
  };
  render(
    <RuntimeHome
      configurations={configurations}
      profilePreferences={profilePreferences}
      recentRuntimeSelections={[]}
      {...handlers}
    />,
  );
  return handlers;
}

describe("the runtime library", () => {
  afterEach(cleanup);

  it("lists one row per app and shows the selected one in the rail", () => {
    renderLibrary();

    expect(screen.getByRole("heading", { level: 1, name: "Runtime library" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Explorer Manager" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Sandbox V0.0" }));

    expect(screen.getByRole("heading", { level: 3, name: "Sandbox V0.0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Explorer Manager" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("preselects the last app used on this device, even when its configuration loads after the others", () => {
    const recent = [{ appId: "sandbox", configId: "sandbox", screenId: "sandbox-home" }];
    const { rerender } = render(
      <RuntimeHome
        configurations={configurations.slice(0, 1)}
        onOpenRuntimeApp={vi.fn()}
        onOpenSupervisorApp={vi.fn()}
        onProfilePreferenceChange={vi.fn()}
        profilePreferences={{}}
        recentRuntimeSelections={recent}
      />,
    );
    expect(screen.getByRole("button", { name: "Explorer Manager" }).getAttribute("aria-pressed")).toBe("true");

    rerender(
      <RuntimeHome
        configurations={configurations}
        onOpenRuntimeApp={vi.fn()}
        onOpenSupervisorApp={vi.fn()}
        onProfilePreferenceChange={vi.fn()}
        profilePreferences={{}}
        recentRuntimeSelections={recent}
      />,
    );
    expect(screen.getByRole("button", { name: "Sandbox V0.0" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("makes the first launch an explicit choice, then opens the chosen role's layout", () => {
    const handlers = renderLibrary();

    expect((screen.getByRole("button", { name: "Choose a role to open" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Bench" }));
    fireEvent.click(screen.getByRole("button", { name: "Open as Bench" }));

    const identity = { appId: "explorer-manager", configId: "explorer-manager" };
    expect(handlers.onProfilePreferenceChange).toHaveBeenCalledWith(identity, "bench");
    expect(handlers.onOpenRuntimeApp).toHaveBeenCalledWith({ ...identity, screenId: "manager_drive_bench" });
  });

  it("marks and preselects the last role used on this device, but never launches it", () => {
    const handlers = renderLibrary({ "explorer-manager:explorer-manager": "operator" });

    const operator = screen.getByRole("button", { name: "Operator" });
    expect(operator.getAttribute("aria-pressed")).toBe("true");
    expect(operator.textContent).toContain("last used");
    expect(screen.getByRole("button", { name: "Open as Operator" })).toBeTruthy();
    expect(handlers.onOpenRuntimeApp).not.toHaveBeenCalled();
  });

  it("treats a stored Auto, or a role the app no longer has, as no role remembered", () => {
    const app = configurations[0]?.bundle.applications[0];
    if (!app) throw new Error("Missing app.");

    expect(rememberedProfileId(app, "")).toBe("");
    expect(rememberedProfileId(app, "retired-profile")).toBe("");
    expect(rememberedProfileId(app, "bench")).toBe("bench");
  });

  it("says an app declares no profiles instead of inventing roles, and opens its first screen", () => {
    const handlers = renderLibrary();
    fireEvent.click(screen.getByRole("button", { name: "Sandbox V0.0" }));

    expect(screen.getByText("This app declares no profiles, so it opens with runtime defaults.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(handlers.onOpenRuntimeApp).toHaveBeenCalledWith({
      appId: "sandbox",
      configId: "sandbox",
      screenId: "sandbox_control",
    });
  });

  it("marks an archived app with the word and still lets it open", () => {
    const handlers = renderLibrary();
    const row = screen.getByRole("button", { name: "Petanque admin" });

    expect(row.querySelector('[data-state="archived"]')?.textContent).toBe("Archived");
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(handlers.onOpenRuntimeApp).toHaveBeenCalled();
  });

  it("opens the supervisor mirror from the rail", () => {
    const handlers = renderLibrary();

    fireEvent.click(screen.getByRole("button", { name: "Open Explorer Manager supervisor mirror" }));
    expect(handlers.onOpenSupervisorApp).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "explorer-manager", configId: "explorer-manager" }),
    );
  });
});

describe("library model", () => {
  it("derives device classes from the canvases, with a -desktop sibling adding desktop", () => {
    const [explorer] = collectLibraryApps(configurations);
    expect(explorer?.classes).toEqual({ desktop: false, tablet: true });

    const paired = structuredClone(explorerManagerConfiguration) as unknown as ConfigurationBundle;
    const desktop = structuredClone(paired.applications[0]);
    if (!desktop) throw new Error("Missing app.");
    desktop.id = "explorer-manager-desktop";
    desktop.screens = desktop.screens.map((screen) => ({
      ...screen,
      canvas: { ...screen.canvas, preset_id: "full-hd" },
    }));
    paired.applications.push(desktop);

    const apps = collectLibraryApps([loaded("explorer-manager", paired)]);
    expect(apps).toHaveLength(1);
    expect(apps[0]?.classes).toEqual({ desktop: true, tablet: true });
  });

  it("describes each role by what it is for", () => {
    const strings = getRuntimeStrings("en");
    const profiles = configurations[0]?.bundle.applications[0]?.profiles ?? [];

    expect(profiles.map((profile) => describeProfile(profile, strings))).toEqual([
      "accessible · 56 px · plain language",
      "debugging · 48 px · continuous limits",
      "scan · 1.4 s period · dwell",
    ]);
  });
});
