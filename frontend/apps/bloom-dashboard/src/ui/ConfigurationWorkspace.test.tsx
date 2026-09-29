import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import {
  ConfigurationWorkspace,
  getInitialWorkspaceSelection,
  resolveSelectedWorkspace,
  type WorkspaceSelection,
} from "./ConfigurationWorkspace";

const screenOf = (id: string, widgets = 0): ScreenConfig =>
  ({
    id,
    title: id.toUpperCase(),
    canvas: { preset_id: "full-hd", runtime_mode: "fit" },
    widgets: Array.from({ length: widgets }, (_, index) => ({ id: `w${index}` })),
  }) as unknown as ScreenConfig;

const appOf = (id: string, screens: ScreenConfig[], description = ""): ApplicationConfig =>
  ({ id, name: `App ${id}`, description, screens }) as unknown as ApplicationConfig;

const configurations: LoadedConfiguration[] = [
  {
    id: "lab",
    bundle: {
      metadata: {},
      applications: [
        appOf("ops", [screenOf("home", 2), screenOf("arm", 5)], "Drives the arm."),
        appOf("debug", [screenOf("echo")]),
      ],
    } as unknown as LoadedConfiguration["bundle"],
  },
  { id: "demo", bundle: { metadata: {}, applications: [appOf("show", [screenOf("stage")])] } as never },
  { id: "empty", bundle: { metadata: {}, applications: [] } as never },
];

function mount(selection: WorkspaceSelection) {
  const changes: WorkspaceSelection[] = [];
  render(
    <ConfigurationWorkspace
      configurations={configurations}
      onSelectionChange={(next) => changes.push(next)}
      selection={selection}
    />,
  );
  return changes;
}

describe("the preview workspace picker", () => {
  it("lists the selected app's screens with their widget counts and marks the current one", () => {
    mount({ configId: "lab", appId: "ops", screenId: "arm" });
    expect(screen.getByText("Drives the arm.")).toBeInTheDocument();
    const current = screen.getByRole("button", { name: /ARM/ });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current).toHaveTextContent("5 widgets · full-hd");
    expect(screen.getByRole("button", { name: /HOME/ })).not.toHaveAttribute("aria-current");
  });

  it("moves to the first screen of another configuration, then of another app, then to a screen", () => {
    const changes = mount({ configId: "lab", appId: "ops", screenId: "arm" });
    fireEvent.change(screen.getByLabelText("Configuration"), { target: { value: "demo" } });
    expect(changes.at(-1)).toEqual({ configId: "demo", appId: "show", screenId: "stage" });

    fireEvent.change(screen.getByLabelText("Application"), { target: { value: "debug" } });
    expect(changes.at(-1)).toEqual({ configId: "lab", appId: "debug", screenId: "echo" });

    fireEvent.click(screen.getByRole("button", { name: /HOME/ }));
    expect(changes.at(-1)).toEqual({ configId: "lab", appId: "ops", screenId: "home" });
  });

  it("does not move to a configuration that has nothing to show", () => {
    const changes = mount({ configId: "lab", appId: "ops", screenId: "arm" });
    fireEvent.change(screen.getByLabelText("Configuration"), { target: { value: "empty" } });
    expect(changes).toEqual([]);
  });
});

describe("resolving a selection", () => {
  it("falls back to the first configuration, app and screen when the ids are stale", () => {
    const resolved = resolveSelectedWorkspace(configurations, { configId: "gone", appId: "gone", screenId: "gone" });
    expect([resolved.configuration.id, resolved.application.id, resolved.screen.id]).toEqual(["lab", "ops", "home"]);
  });

  it("explains which level is empty", () => {
    expect(() => resolveSelectedWorkspace([], { configId: "x", appId: "x", screenId: "x" })).toThrow(
      "Cannot resolve a workspace without configurations.",
    );
    expect(() =>
      resolveSelectedWorkspace([configurations[2] as LoadedConfiguration], {
        configId: "empty",
        appId: "x",
        screenId: "x",
      }),
    ).toThrow('Configuration "empty" does not contain any applications.');
    const noScreens = { id: "bare", bundle: { metadata: {}, applications: [appOf("bare", [])] } } as never;
    expect(() => resolveSelectedWorkspace([noScreens], { configId: "bare", appId: "bare", screenId: "x" })).toThrow(
      'Application "bare" does not contain any screens.',
    );
  });

  it("starts on the first screen of the first app, or nowhere", () => {
    expect(getInitialWorkspaceSelection(configurations)).toEqual({ configId: "lab", appId: "ops", screenId: "home" });
    expect(getInitialWorkspaceSelection([configurations[2] as LoadedConfiguration])).toBeNull();
    expect(getInitialWorkspaceSelection([])).toBeNull();
  });
});
