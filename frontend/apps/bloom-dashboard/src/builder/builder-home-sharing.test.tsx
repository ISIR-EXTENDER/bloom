/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderHome } from "./BuilderHome";

// `config status` and `config publish` lived only on the CLI, so nobody using the Builder knew an app was
// out of date, or that their edits were theirs alone.
const bundle = {
  applications: [
    {
      id: "explorer-manager",
      name: "Explorer Manager",
      description: "",
      profiles: [],
      screens: [{ id: "drive", title: "Drive", canvas: {}, reserved_regions: [], widgets: [] }],
      theme: { palette: { primary: "#31493f" } },
    },
  ],
  metadata: {},
} as unknown as ConfigurationBundle;

function renderApps(props: Partial<Parameters<typeof BuilderHome>[0]>) {
  render(
    <BuilderHome
      configurations={[{ id: "explorer-manager", bundle }]}
      onCreateApplication={vi.fn()}
      onDeleteApplication={vi.fn()}
      onDuplicateApplication={vi.fn()}
      onOpenApplication={vi.fn()}
      onOpenScreenBuilder={vi.fn()}
      onPreviewScreenRuntime={vi.fn()}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Apps$/ }));
}

describe("sharing from the Builder", () => {
  afterEach(cleanup);

  it("says when the repository has a newer version, and takes it on one press", async () => {
    const onTakeShippedConfiguration = vi.fn(async () => undefined);
    renderApps({ onTakeShippedConfiguration, shareStatus: { "explorer-manager": "outdated" } });

    expect(screen.getByText("Update available")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Update explorer-manager to the shipped version" }));

    await waitFor(() => expect(onTakeShippedConfiguration).toHaveBeenCalledWith("explorer-manager"));
  });

  it("says when an app was edited here, and shares it with the file to commit", async () => {
    const onPublishConfiguration = vi.fn(async () => ({ alreadyPublished: false, path: "applications/x.json" }));
    renderApps({ onPublishConfiguration, shareStatus: { "explorer-manager": "edited" } });

    expect(screen.getByText("Edited here")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share explorer-manager with the team" }));

    await screen.findByText(/Written to applications\/x.json. Commit that file/);
  });

  it("shows a shared app as shared, with nothing to do", () => {
    renderApps({ shareStatus: { "explorer-manager": "shared" } });

    expect(screen.getByText("Shared")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Share explorer-manager|Update explorer-manager/ })).toBeNull();
  });

  it("shows no badge at all when the server cannot say", () => {
    renderApps({});

    expect(screen.queryByText(/Shared|Edited here|Update available|Not shared/)).toBeNull();
  });
});

describe("a new guided app's file", () => {
  afterEach(cleanup);

  // Deleted locally, a shipped app keeps its file: a new app under that id would share over it.
  it("never takes the id of a shipped app, even one deleted here", async () => {
    const onCreateApplication = vi.fn(async (_configId: string, _application: unknown) => undefined);
    renderApps({ onCreateApplication, shareStatus: { "new-bloom-app": "deleted" } });

    fireEvent.click(screen.getByRole("button", { name: "Create guided app" }));

    await waitFor(() => expect(onCreateApplication).toHaveBeenCalled());
    expect(onCreateApplication.mock.calls[0]?.[0]).toBe("new-bloom-app-2");
  });
});

describe("naming and filing a new app", () => {
  afterEach(cleanup);

  const otherConfiguration = {
    id: "sandbox",
    bundle: {
      ...bundle,
      applications: [{ ...bundle.applications[0], id: "new-bloom-app", name: "New Bloom App" }],
    } as ConfigurationBundle,
  };

  // Only the first configuration was checked, so every guided create came out "New Bloom App".
  it("picks a name no configuration uses, and a fresh one for the next create", async () => {
    const onCreateApplication = vi.fn(async (_configId: string, _application: { name: string }) => undefined);
    render(
      <BuilderHome
        configurations={[{ id: "explorer-manager", bundle }, otherConfiguration]}
        onCreateApplication={onCreateApplication}
        onDeleteApplication={vi.fn()}
        onDuplicateApplication={vi.fn()}
        onOpenApplication={vi.fn()}
        onOpenScreenBuilder={vi.fn()}
        onPreviewScreenRuntime={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Apps$/ }));
    const nameInput = screen.getByRole("textbox", { name: "New app name" }) as HTMLInputElement;
    expect(nameInput.value).toBe("New Bloom App 2");

    fireEvent.change(nameInput, { target: { value: "New Bloom App" } });
    fireEvent.click(screen.getByRole("button", { name: "Create guided app" }));

    await waitFor(() => expect(onCreateApplication).toHaveBeenCalled());
    expect(onCreateApplication.mock.calls[0]?.[1].name).toBe("New Bloom App 2");
    await waitFor(() => expect(nameInput.value).toBe("New Bloom App 3"));
  });

  // Saving a playground screen as an app wrote it into the source app's file, which Share then shipped.
  it("saves a playground screen as an app in a file of its own", async () => {
    const onCreateApplication = vi.fn(async (_configId: string, _application: unknown) => undefined);
    renderApps({ onCreateApplication });
    fireEvent.click(screen.getByRole("button", { name: /^Playground$/ }));

    expect(screen.queryByText(/Draft lab|forces a saved workflow/)).toBeNull();
    expect(screen.getByText(/Edit screen changes it in the app it comes from/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Drive as app" }));

    await waitFor(() => expect(onCreateApplication).toHaveBeenCalled());
    expect(onCreateApplication.mock.calls[0]?.[0]).toBe("drive-draft");
  });

  it("calls the screen library a set of copies, not shared screens", () => {
    renderApps({});
    fireEvent.click(screen.getByRole("button", { name: /^Overview$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Screen library — adding a screen copies it/ }));

    expect(screen.queryByText("Reusable screens")).toBeNull();
    expect(screen.getByText(/Adding a screen to another app copies it/)).toBeTruthy();
  });
});
