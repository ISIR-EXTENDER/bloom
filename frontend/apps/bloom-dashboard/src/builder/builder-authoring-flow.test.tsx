/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ConfigurationBundle, ScreenConfig } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { createEmptyActionPresetDraft } from "./app-config-model";
import { BuilderActionPresetsPanel } from "./BuilderActionPresetsPanel";
import { BuilderAppConfig } from "./BuilderAppConfig";
import { BuilderWorkspace } from "./BuilderWorkspace";

const bundle = structuredClone(explorerManagerConfiguration) as unknown as ConfigurationBundle;
const explorer = bundle.applications[0] as ApplicationConfig;
const bench = explorer.screens.find((candidate) => candidate.id === "manager_drive_bench") as ScreenConfig;
const selection = { appId: explorer.id, configId: "explorer-manager", screenId: bench.id };
const configurations = [{ id: "explorer-manager", bundle: { ...bundle, applications: [explorer] } }];

function renderWorkspace(overrides: { onPreviewScreen?: () => void; robotName?: string } = {}) {
  return render(
    <BuilderWorkspace
      configurations={configurations}
      onBackToAppConfig={vi.fn()}
      onBackToBuilderHome={vi.fn()}
      onPreviewScreen={overrides.onPreviewScreen}
      onSaveScreenDraft={vi.fn()}
      robotName={overrides.robotName}
      runtimeCapabilities={null}
      selection={selection}
    />,
  );
}

const inspectorTitle = () => document.getElementById("builder-inspector-title")?.textContent;
const selectNeutral = () => fireEvent.click(screen.getByRole("button", { name: "Select and move Neutral widget" }));
const neutralTop = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[aria-label="Neutral command-button widget"]')?.style.top;

describe("previewing from the builder", () => {
  afterEach(cleanup);

  it("opens the saved screen in the runtime, and asks for a save first when there are changes", () => {
    const onPreviewScreen = vi.fn();
    renderWorkspace({ onPreviewScreen });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onPreviewScreen).toHaveBeenCalledWith(selection);

    selectNeutral();
    fireEvent.keyDown(screen.getByRole("button", { name: "Select and move Neutral widget" }), { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Preview (save first)" })).toBeDisabled();
  });

  it("opens the app's screen from App config", () => {
    const onOpenRuntimeApp = vi.fn();
    render(
      <BuilderAppConfig
        configurations={configurations}
        onBackToHome={vi.fn()}
        onOpenRuntimeApp={onOpenRuntimeApp}
        onOpenScreenBuilder={vi.fn()}
        onSaveApplication={vi.fn()}
        onUploadThemeAsset={vi.fn()}
        runtimeCapabilityReport={null}
        selection={selection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onOpenRuntimeApp).toHaveBeenCalledWith(selection);
  });
});

describe("selecting on the canvas", () => {
  afterEach(cleanup);

  it("starts with nothing selected and the palette ahead of the widget list", () => {
    renderWorkspace();

    expect(inspectorTitle()).toBe("Select a widget");
    const palette = screen.getByRole("region", { name: "Add widgets" });
    const list = screen.getByRole("region", { name: "Select on canvas" });
    expect(palette.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("clears the selection on Escape, on empty canvas, and from the inspector", () => {
    const { container } = renderWorkspace();

    selectNeutral();
    expect(inspectorTitle()).toBe("Neutral");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(inspectorTitle()).toBe("Select a widget");

    selectNeutral();
    fireEvent.pointerDown(container.querySelector(".builder-canvas-artboard") as Element);
    expect(inspectorTitle()).toBe("Select a widget");

    selectNeutral();
    fireEvent.click(screen.getByRole("button", { name: "Add another widget" }));
    expect(inspectorTitle()).toBe("Select a widget");
  });
});

describe("undo in the builder", () => {
  afterEach(cleanup);

  it("takes back a typed title in one step, not one per keystroke", () => {
    renderWorkspace();
    selectNeutral();
    const title = screen.getByLabelText("Title");
    for (const value of ["N", "Ne", "New"]) {
      fireEvent.change(title, { target: { value } });
    }

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(inspectorTitle()).toBe("Neutral");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("takes back a run of arrow nudges in one step", () => {
    const { container } = renderWorkspace();
    const before = neutralTop(container);
    const selector = screen.getByRole("button", { name: "Select and move Neutral widget" });
    fireEvent.keyDown(selector, { key: "ArrowDown" });
    fireEvent.keyDown(selector, { key: "ArrowDown" });
    fireEvent.keyDown(selector, { key: "ArrowDown" });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(neutralTop(container)).toBe(before);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("undoes, redoes and deletes from the keyboard, and leaves text fields their own undo", () => {
    renderWorkspace();
    selectNeutral();

    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(screen.queryByRole("button", { name: "Select and move Neutral widget" })).toBeNull();
    fireEvent.keyDown(document.body, { ctrlKey: true, key: "z" });
    expect(screen.getByRole("button", { name: "Select and move Neutral widget" })).toBeTruthy();
    fireEvent.keyDown(document.body, { ctrlKey: true, key: "z", shiftKey: true });
    expect(screen.queryByRole("button", { name: "Select and move Neutral widget" })).toBeNull();
    fireEvent.keyDown(document.body, { metaKey: true, key: "z" });
    fireEvent.keyDown(document.body, { ctrlKey: true, key: "y" });
    expect(screen.queryByRole("button", { name: "Select and move Neutral widget" })).toBeNull();
    fireEvent.keyDown(document.body, { ctrlKey: true, key: "z" });

    selectNeutral();
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "Renamed" } });
    fireEvent.keyDown(title, { ctrlKey: true, key: "z" });
    fireEvent.keyDown(title, { key: "Backspace" });
    expect(inspectorTitle()).toBe("Renamed");
  });
});

describe("words for authors", () => {
  afterEach(cleanup);

  it("names no environment variable when the arm is unknown", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /^Add Slider widget/ }));

    expect(screen.getByRole("alert").textContent).toContain("does not know which arm it drives");
    expect(screen.getByRole("alert").textContent).not.toContain("BLOOM_");
  });
});

describe("reusable presets on a command button", () => {
  afterEach(cleanup);

  it("are picked by name in the basic settings", () => {
    renderWorkspace();
    selectNeutral();
    const picker = screen.getByLabelText("Reusable preset") as HTMLSelectElement;

    expect([...picker.options].map((option) => option.textContent)).toEqual([
      "No preset",
      "Release joint target",
      "Neutral shaping",
    ]);
    expect(picker.closest("details")).toBeNull();
    expect(screen.queryByLabelText("Preset id")).toBeNull();

    fireEvent.change(picker, { target: { value: "manager-neutral" } });
    expect((screen.getByLabelText("Reusable preset") as HTMLSelectElement).value).toBe("manager-neutral");
  });

  it("are explained as picked by name, not typed as an id", () => {
    render(
      <BuilderActionPresetsPanel
        newPreset={createEmptyActionPresetDraft()}
        onAddLibraryPreset={vi.fn()}
        onAddPreset={vi.fn()}
        onNewPresetChange={vi.fn()}
        onRemovePreset={vi.fn()}
        presets={[]}
      />,
    );

    expect(screen.getByText(/pick them by name/)).toBeTruthy();
    expect(screen.queryByText(/preset id/)).toBeNull();
  });
});
