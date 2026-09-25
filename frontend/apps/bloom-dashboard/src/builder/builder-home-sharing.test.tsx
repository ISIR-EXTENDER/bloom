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
