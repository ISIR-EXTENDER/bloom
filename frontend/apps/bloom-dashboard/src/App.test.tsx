import {
  type ApplicationConfig,
  type ConfigurationBundle,
  DEFAULT_APPLICATION_THEME,
  type ScreenConfig,
} from "@bloom/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import bloomDebugConfiguration from "../../../../tests/fixtures/bloom-debug-configuration.json";
import compactSandboxConfiguration from "../../../../tests/fixtures/compact-sandbox-configuration.json";
import migratedPetanqueAdminConfiguration from "../../../../tests/fixtures/petanque-admin-configuration-bundle.json";
import sandboxTeleopLabConfiguration from "../../../../tests/fixtures/sandbox-teleop-lab-configuration.json";
import webcamVisualizerConfiguration from "../../../../tests/fixtures/webcam-visualizer-configuration-bundle.json";
import { App } from "./App";
import type { ConfigurationClient } from "./configurations/configuration-client";
import type { RuntimeActionClient, RuntimeTopicSampleMessage } from "./runtime/runtime-action-dispatcher";
import { BLOOM_SCREEN_DRAG_TYPE } from "./ui/dragDrop";

Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();

describe("App", () => {
  it("renders the separated landing page", () => {
    render(<App configurationClient={createConfigurationClient()} />);

    expect(screen.getByRole("heading", { level: 1, name: /robot interfaces that grow cleanly/i })).toBeVisible();
    expect(screen.getByText(/configurable robot teleoperation/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /open builder preview/i })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Choose what to preview" })).not.toBeInTheDocument();
  });

  it("provides a keyboard skip link to the main content", () => {
    render(<App configurationClient={createConfigurationClient()} />);

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#bloom-main-content");
    expect(document.querySelector("#bloom-main-content")).toHaveAttribute("tabindex", "-1");
  });

  it("renders the first workflow cards on the landing page", () => {
    render(<App configurationClient={createConfigurationClient()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Configure" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Control" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Observe" })).toBeVisible();
  });

  it("opens the builder preview with loaded configurations", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: /open builder preview/i }));

    expect(await screen.findByRole("heading", { level: 1, name: "Choose what to build." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Apps" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Screen library" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Manage complete app workflows/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /Design reusable screens first/i })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Available apps" })).not.toBeInTheDocument();
  });

  it("separates app management from the reusable screen library", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: /open builder preview/i }));

    expect(await screen.findByRole("heading", { level: 1, name: "Choose what to build." })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));

    expect(screen.getByRole("heading", { level: 2, name: "Available apps" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open Sandbox app" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Create blank app/i })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Reusable screens" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Screen library" }));

    expect(screen.getByRole("heading", { level: 2, name: "Reusable screens" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Control screens" })).toBeVisible();
    expect(screen.getByText("Control")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show Diagnostics layout preview" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit Diagnostics screen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview Diagnostics screen runtime" })).toBeVisible();
  });

  it("opens a screen builder directly from the builder screen library", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Screen library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Diagnostics screen" }));

    expect(await screen.findByRole("region", { name: "Bloom builder workspace" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Diagnostics" })).toBeVisible();
    expect(screen.getByText("/teleop_cmd")).toBeVisible();
  });

  it("previews a screen runtime directly from the builder screen library", async () => {
    const runtimeActionClient = createRuntimeActionClient();
    render(<App configurationClient={createConfigurationClient()} runtimeActionClient={runtimeActionClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Screen library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Diagnostics screen runtime" }));

    expect(await screen.findByRole("region", { name: "Runtime application" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Sandbox" })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Diagnostics/i })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("region", { name: "Bloom builder workspace" })).not.toBeInTheDocument();
    await waitFor(() => expect(runtimeActionClient.subscribeRuntimeTopic).toHaveBeenCalled());
    expect(runtimeActionClient.subscribeRuntimeTopic).toHaveBeenCalledWith({
      type: "subscribe_topic",
      topic: "/teleop_cmd",
      message_type: "",
      field_path: "",
      widget_id: "echo",
    });
  });

  it("renders live topic samples in runtime debug widgets", async () => {
    const runtimeActionClient = createRuntimeActionClient();
    render(<App configurationClient={createConfigurationClient()} runtimeActionClient={runtimeActionClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Screen library" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview Diagnostics screen runtime" }));

    expect(await screen.findByText("Waiting for messages...")).toBeVisible();

    runtimeActionClient.emitRuntimeTopicSample({
      type: "topic_sample",
      detail: "Received /teleop_cmd.",
      payload: {
        message_type: "extender_msgs/msg/TeleopCommand",
        received_at: "2026-06-03T10:00:00+00:00",
        topic: "/teleop_cmd",
        value: {
          mode: 3,
          twist: {
            linear: { x: 0.42, y: 0, z: 0 },
          },
        },
      },
    });

    expect(await screen.findByText(/"mode": 3/)).toBeVisible();
    expect(screen.getByText(/"x": 0.42/)).toBeVisible();
  });

  it("filters reusable screens from the builder screen library", async () => {
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            "petanque-admin": migratedPetanqueAdminConfiguration as unknown as ConfigurationBundle,
          },
          ids: ["petanque-admin"],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Screen library" }));
    fireEvent.change(await screen.findByRole("searchbox", { name: "Find a screen" }), {
      target: { value: "camera" },
    });

    expect(screen.getByRole("heading", { level: 3, name: "Camera views" })).toBeVisible();
    expect(screen.getAllByText("Camera").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Edit Default Live Teleop screen" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit Default Control screen" })).not.toBeInTheDocument();
  });

  it("opens an app runtime directly from the builder app list", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Sandbox runtime" }));

    expect(await screen.findByRole("region", { name: "Runtime application" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Sandbox" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: "Sandbox" })).not.toBeInTheDocument();
  });

  it("opens app configuration before entering the full screen builder", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openAppConfig();

    expect(screen.getByRole("heading", { level: 1, name: "Sandbox" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "App theme" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open Main screen builder" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open Main screen builder" }));

    expect(await screen.findByRole("region", { name: "Bloom builder workspace" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Main" })).toBeVisible();
    expect(screen.getByText("/ui/ros_toggle")).toBeVisible();
  });

  it("creates a blank app from the builder home", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create blank app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const [, savedApplication] = configurationClient.upsertApplication.mock.calls[0] ?? [];

    expect(savedApplication).toMatchObject({
      id: "new-bloom-app",
      name: "New Bloom App",
      profiles: [],
      theme: DEFAULT_APPLICATION_THEME,
    });
    expect(await screen.findByRole("heading", { level: 1, name: "New Bloom App" })).toBeVisible();
  });

  it("duplicates an app from the builder home", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
    fireEvent.click(await screen.findByRole("button", { name: "Duplicate Sandbox app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const [, savedApplication] = configurationClient.upsertApplication.mock.calls[0] ?? [];

    expect(savedApplication).toMatchObject({
      id: "sandbox-copy",
      name: "Sandbox Copy",
    });
    expect(savedApplication?.screens).toEqual(createConfigurationBundle("sandbox").applications[0]?.screens);
    expect(await screen.findByRole("heading", { level: 1, name: "Sandbox Copy" })).toBeVisible();
  });

  it("deletes an app from the builder home", async () => {
    const configurationClient = createConfigurationClient({
      bundles: {
        sandbox: createBundleWithReusableScreen(),
      },
    });
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    try {
      render(<App configurationClient={configurationClient} />);

      fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
      fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
      fireEvent.click(await screen.findByRole("button", { name: "Delete Sandbox app" }));

      await waitFor(() => {
        expect(configurationClient.deleteApplication).toHaveBeenCalledWith("sandbox", "sandbox");
      });

      expect(await screen.findByRole("button", { name: "Open Shared screens app" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Open Sandbox app" })).not.toBeInTheDocument();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("saves app-level design system changes from app configuration", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    await openAppConfig();
    fireEvent.change(screen.getByLabelText("primary color"), { target: { value: "#ff8800" } });
    fireEvent.click(screen.getByRole("button", { name: "Save app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const savedApplication = configurationClient.upsertApplication.mock.calls[0]?.[1];

    expect(savedApplication?.theme.palette.primary).toBe("#ff8800");
    expect(await screen.findByRole("status")).toHaveTextContent("App configuration saved.");
  });

  it("saves app theme inspiration from a website reference and moodboard image", async () => {
    const configurationClient = createConfigurationClient();
    const moodboardFile = new File(["bloom moodboard"], "moodboard.png", { type: "image/png" });

    render(<App configurationClient={configurationClient} />);

    await openAppConfig();
    fireEvent.change(screen.getByLabelText("Website reference"), { target: { value: "https://lifesum.com/" } });
    fireEvent.change(screen.getByLabelText("Moodboard image"), { target: { files: [moodboardFile] } });

    await waitFor(() => {
      expect(screen.getByAltText("Current app moodboard preview")).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const savedApplication = configurationClient.upsertApplication.mock.calls[0]?.[1];

    expect(savedApplication?.theme.inspiration.reference_url).toBe("https://lifesum.com/");
    expect(savedApplication?.theme.inspiration.moodboard_image_uri).toMatch(/^data:image\/png;base64,/);
  });

  it("opens app configuration when an older theme has no inspiration metadata", async () => {
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            sandbox: createBundleWithoutThemeInspiration(),
          },
        })}
      />,
    );

    await openAppConfig();

    expect(screen.getByRole("heading", { level: 1, name: "Sandbox" })).toBeVisible();
    expect(screen.getByText("No moodboard image yet.")).toBeVisible();
    expect(screen.getByLabelText("Website reference")).toHaveValue("");
  });

  it("adds an existing screen to the current app from app configuration", async () => {
    const configurationClient = createConfigurationClient({
      bundles: {
        sandbox: createBundleWithReusableScreen(),
      },
    });

    render(<App configurationClient={configurationClient} />);

    await openAppConfig();
    expect(screen.getByText("From Shared screens")).toBeVisible();
    expect(screen.getAllByText("Camera views")).toHaveLength(2);
    expect(screen.queryByText(/widgets ·/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Camera Feed to app" }));
    fireEvent.click(screen.getByRole("button", { name: "Save app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const savedApplication = configurationClient.upsertApplication.mock.calls[0]?.[1];

    expect(savedApplication?.screens.map((screenConfig) => screenConfig.id)).toContain("camera-feed");
    expect(await screen.findByRole("status")).toHaveTextContent("App configuration saved.");
  });

  it("adds a reusable screen by dropping it into the current app flow", async () => {
    const configurationClient = createConfigurationClient({
      bundles: {
        sandbox: createBundleWithReusableScreen(),
      },
    });

    render(<App configurationClient={configurationClient} />);

    await openAppConfig();
    const dropzone = screen.getByRole("region", {
      name: "Screens currently assigned to this app. Drop reusable screens here to add them.",
    });
    const dataTransfer = createDragDataTransfer("camera-feed");

    fireEvent.dragOver(dropzone, { dataTransfer });
    fireEvent.drop(dropzone, { dataTransfer });
    fireEvent.click(screen.getByRole("button", { name: "Save app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const savedApplication = configurationClient.upsertApplication.mock.calls[0]?.[1];

    expect(savedApplication?.screens.map((screenConfig) => screenConfig.id)).toContain("camera-feed");
  });

  it("creates a blank screen from app configuration", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    await openAppConfig();
    fireEvent.change(screen.getByLabelText("New screen name"), { target: { value: "Inspection" } });
    fireEvent.click(screen.getByRole("button", { name: "Create screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Save app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const savedApplication = configurationClient.upsertApplication.mock.calls[0]?.[1];
    const createdScreen = savedApplication?.screens.find((screenConfig) => screenConfig.id === "inspection");

    expect(createdScreen).toMatchObject({
      id: "inspection",
      title: "Inspection",
      widgets: [],
    });
  });

  it("duplicates a screen from app configuration", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    await openAppConfig();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Main screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Save app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const savedApplication = configurationClient.upsertApplication.mock.calls[0]?.[1];
    const duplicatedScreen = savedApplication?.screens.find((screenConfig) => screenConfig.id === "main-copy");

    expect(duplicatedScreen).toMatchObject({
      id: "main-copy",
      title: "Main Copy",
    });
    expect(duplicatedScreen?.widgets).toEqual(
      savedApplication?.screens.find((screenConfig) => screenConfig.id === "main")?.widgets,
    );
  });

  it("removes a screen from the current app configuration", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    await openAppConfig();
    fireEvent.click(screen.getByRole("button", { name: "Remove Diagnostics from app" }));
    fireEvent.click(screen.getByRole("button", { name: "Save app" }));

    await waitFor(() => {
      expect(configurationClient.upsertApplication).toHaveBeenCalledTimes(1);
    });

    const savedApplication = configurationClient.upsertApplication.mock.calls[0]?.[1];

    expect(savedApplication?.screens.map((screenConfig) => screenConfig.id)).not.toContain("diagnostics");
    expect(savedApplication?.screens.map((screenConfig) => screenConfig.id)).toContain("main");
  });

  it("switches screens inside the builder workspace", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openAppConfig();
    fireEvent.click(await screen.findByRole("button", { name: "Open Diagnostics screen builder" }));

    expect(screen.getByRole("heading", { level: 2, name: "Diagnostics" })).toBeVisible();
    expect(screen.getByText("/teleop_cmd")).toBeVisible();
    expect(screen.getByText("Waiting for messages...")).toBeVisible();
  });

  it("shows a coming soon message for registered screens without migrated widgets", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openAppConfig();
    fireEvent.click(await screen.findByRole("button", { name: "Open Placeholder screen builder" }));

    expect(screen.getByRole("heading", { level: 2, name: "Placeholder" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Screen implementation coming soon" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Coming soon" })).toBeVisible();
  });

  it("moves widgets on the builder canvas draft", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openDefaultScreenBuilder();

    const moveHandle = await screen.findByRole("button", { name: "Select and move Digital output widget" });
    fireEvent.pointerDown(moveHandle, { button: 0, clientX: 10, clientY: 10 });
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 50, clientY: 26 }));
    window.dispatchEvent(new MouseEvent("pointerup"));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "64, 48")).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "24, 32")).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "64, 48")).toBeVisible();
    });
  });

  it("saves builder drafts through the configuration API", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    await openDefaultScreenBuilder();
    await moveDigitalOutputWidget();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(configurationClient.upsertScreen).toHaveBeenCalledTimes(1);
    });

    const [configId, appId, savedScreen] = configurationClient.upsertScreen.mock.calls[0] ?? [];
    const savedWidget = savedScreen?.widgets[0];

    expect(configId).toBe("sandbox");
    expect(appId).toBe("sandbox");
    expect(savedWidget?.layout).toEqual({ x: 64, y: 48, width: 220, height: 96 });
    expect(await screen.findByRole("status")).toHaveTextContent("All changes saved.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("discards builder drafts before saving", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    await openDefaultScreenBuilder();
    await moveDigitalOutputWidget();

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "64, 48")).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "24, 32")).toBeVisible();
    });

    expect(configurationClient.upsertConfiguration).not.toHaveBeenCalled();
    expect(configurationClient.upsertApplication).not.toHaveBeenCalled();
    expect(configurationClient.upsertScreen).not.toHaveBeenCalled();
  });

  it("adds widgets from the builder palette", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openDefaultScreenBuilder();
    fireEvent.click(await screen.findByRole("button", { name: "Add Label widget" }));

    expect(screen.getByRole("heading", { level: 2, name: "Label" })).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "56, 56")).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "280 x 64")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("duplicates the selected builder widget", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openDefaultScreenBuilder();
    fireEvent.click(await screen.findByRole("button", { name: "Duplicate widget" }));

    expect(screen.getByRole("heading", { level: 2, name: "Digital output copy" })).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "48, 56")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("removes the selected builder widget", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openDefaultScreenBuilder();
    fireEvent.click(await screen.findByRole("button", { name: "Remove widget" }));

    expect(screen.getByRole("region", { name: "Screen implementation coming soon" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Label widget" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("edits selected widget settings from the inspector", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    await openDefaultScreenBuilder();
    fireEvent.change(await screen.findByLabelText("Output topic"), { target: { value: "/ui/custom_output" } });
    fireEvent.change(screen.getByLabelText("ON payload"), { target: { value: "{data: [42, 1]}" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(configurationClient.upsertScreen).toHaveBeenCalledTimes(1);
    });

    const savedWidget = configurationClient.upsertScreen.mock.calls[0]?.[2].widgets[0];

    expect(savedWidget?.settings).toMatchObject({
      onPayload: "{data: [42, 1]}",
      topic: "/ui/custom_output",
    });
  });

  it("updates label widget previews from inspector settings", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openDefaultScreenBuilder();
    fireEvent.click(await screen.findByRole("button", { name: "Add Label widget" }));
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Bloom title" } });

    expect(screen.getByText("Bloom title")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("selects builder widgets from the inspector widget list", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openDefaultScreenBuilder();
    fireEvent.click(await screen.findByRole("button", { name: "Add Label widget" }));
    fireEvent.click(screen.getByRole("button", { name: /Digital output.*toggle/i }));

    expect(screen.getByRole("heading", { level: 2, name: "Digital output" })).toBeVisible();
    expect(screen.getByLabelText("Output topic")).toHaveValue("/ui/ros_toggle");
    expect(screen.getByRole("button", { name: /Digital output.*toggle/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows field validation errors for invalid inspector settings", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openDefaultScreenBuilder();
    fireEvent.click(await screen.findByRole("button", { name: "Add Slider widget" }));
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "-2" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("max must be greater than min");
  });

  it("keeps builder drafts dirty when saving fails", async () => {
    const configurationClient = createConfigurationClient({ saveError: new Error("SQLite write failed") });

    render(<App configurationClient={configurationClient} />);

    await openDefaultScreenBuilder();
    await moveDigitalOutputWidget();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("SQLite write failed");
    expect(screen.getByText((_, element) => element?.textContent === "64, 48")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("saves builder drafts from a real migrated legacy configuration", async () => {
    const configurationClient = createConfigurationClient({
      bundles: {
        "petanque-admin": migratedPetanqueAdminConfiguration as unknown as ConfigurationBundle,
      },
      ids: ["petanque-admin"],
    });

    render(<App configurationClient={configurationClient} />);

    await openPetanqueScreenBuilder("default_control");
    await moveWidget("RZ");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(configurationClient.upsertScreen).toHaveBeenCalledTimes(1);
    });

    const savedScreen = configurationClient.upsertScreen.mock.calls[0]?.[2];
    const savedWidget = savedScreen?.widgets.find((widget) => widget.id === "control-rz");

    expect(savedWidget?.layout.width).toBe(338);
    expect(savedWidget?.layout.height).toBe(78);
    expect(savedWidget?.layout.x).toBeGreaterThan(670);
    expect(savedWidget?.layout.y).toBeGreaterThan(9);
  });

  it("resizes widgets on the builder canvas draft", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    await openDefaultScreenBuilder();

    const resizeHandle = await screen.findByRole("button", { name: "Resize Digital output widget" });
    fireEvent.pointerDown(resizeHandle, { button: 0, clientX: 10, clientY: 10 });
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 50, clientY: 50 }));
    window.dispatchEvent(new MouseEvent("pointerup"));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "264 x 136")).toBeVisible();
    });
  });

  it("dispatches runtime action intents from the full app view", async () => {
    const runtimeActionClient = createRuntimeActionClient();

    render(<App configurationClient={createConfigurationClient()} runtimeActionClient={runtimeActionClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("button", { name: "OFF" }));

    expect(screen.getByRole("region", { name: "Runtime application" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Sandbox" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Choose what to preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Action intents" })).not.toBeInTheDocument();
    expect(runtimeActionClient.publishRosTopic).toHaveBeenCalledWith({
      topic: "/ui/ros_toggle",
      message_type: "std_msgs/msg/Int32MultiArray",
      payload_text: "{data: [13, 1]}",
    });
  });

  it("fits the runtime canvas into the available application viewport", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));

    const artboard = await screen.findByTestId("runtime-artboard");
    const artboardFrame = artboard.parentElement;
    const frameWidth = Number.parseInt(artboardFrame?.style.width ?? "0", 10);
    const frameHeight = Number.parseInt(artboardFrame?.style.height ?? "0", 10);
    const artboardWidth = Number.parseInt(artboard.style.width, 10);
    const artboardHeight = Number.parseInt(artboard.style.height, 10);

    expect(artboard).toHaveAttribute("data-screen-renderer", "screen-artboard");
    expect(artboard.style.transform).toMatch(/^scale\(/);
    expect(frameWidth).toBeGreaterThan(1);
    expect(frameWidth).toBeLessThan(1280);
    expect(frameHeight).toBeGreaterThan(1);
    expect(frameHeight).toBeLessThan(720);
    expect(artboardWidth).toBeGreaterThan(frameWidth);
    expect(artboardHeight).toBeGreaterThan(frameHeight);
  });

  it("shows a safe coming soon state for empty runtime screens", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("tab", { name: /Placeholder/i }));

    expect(screen.getByRole("region", { name: "Runtime screen coming soon" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Placeholder" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Choose what to preview" })).not.toBeInTheDocument();
  });

  it("renders the first migrated legacy petanque screen end-to-end", async () => {
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            "petanque-admin": migratedPetanqueAdminConfiguration as unknown as ConfigurationBundle,
          },
          ids: ["petanque-admin"],
        })}
      />,
    );

    await openPetanqueAppConfig();

    expect(await screen.findByRole("heading", { level: 1, name: "app-petanque-admin" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open default_control screen builder" }));
    expect(screen.getByRole("heading", { level: 2, name: "default_control" })).toBeVisible();
    expect(screen.getAllByText("RZ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Z").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Max Velocity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Translation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gripper Control").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Slider/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Back to app config" }));
    fireEvent.click(screen.getByRole("button", { name: "Open default_live_teleop screen builder" }));

    expect(screen.getByRole("heading", { level: 2, name: "default_live_teleop" })).toBeVisible();
    expect(screen.getAllByText("Camera Stream").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Camera").length).toBeGreaterThan(0);
  });

  it("dispatches sequenced teleop commands from migrated petanque joysticks", async () => {
    const runtimeActionClient = createRuntimeActionClient();
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            "petanque-admin": migratedPetanqueAdminConfiguration as unknown as ConfigurationBundle,
          },
          ids: ["petanque-admin"],
        })}
        runtimeActionClient={runtimeActionClient}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open app-petanque-admin runtime" }));
    await screen.findByRole("region", { name: "Runtime application" });

    const joystickZone = getRuntimeJoystickZone();
    fireEvent.pointerDown(joystickZone, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(joystickZone, { clientX: 190, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(joystickZone, { clientX: 190, clientY: 150, pointerId: 1 });

    await waitFor(() => expect(runtimeActionClient.sendTeleopCommand).toHaveBeenCalled());
    expect(runtimeActionClient.sendTeleopCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        linear: { x: expect.any(Number), y: 0, z: 0 },
        mode: 3,
        seq: expect.any(Number),
        target: "/teleop_cmd",
      }),
    );
    expect(runtimeActionClient.sendTeleopCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        linear: { x: 0, y: 0, z: 0 },
        seq: expect.any(Number),
      }),
    );
    expect(
      (runtimeActionClient.sendTeleopCommand as ReturnType<typeof vi.fn>).mock.calls.map(([request]) => request.seq),
    ).toEqual(expect.arrayContaining([1, 2]));
  });

  it("opens the sandbox teleop lab runtime screen with joystick and slider bindings", async () => {
    const runtimeActionClient = createRuntimeActionClient();
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            sandbox: sandboxTeleopLabConfiguration as unknown as ConfigurationBundle,
          },
          ids: ["sandbox"],
        })}
        runtimeActionClient={runtimeActionClient}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Sandbox runtime" }));

    expect(await screen.findByRole("region", { name: "Runtime application" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Sandbox" })).toBeVisible();
    expect(screen.getByText("Translation joystick")).toBeVisible();
    expect(screen.getByText("Rotation joystick")).toBeVisible();
    expect(screen.getByRole("slider", { name: "Max velocity" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Z axis" })).toBeVisible();

    const joystickZone = getRuntimeJoystickZone();
    fireEvent.pointerDown(joystickZone, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(joystickZone, { clientX: 190, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(joystickZone, { clientX: 190, clientY: 150, pointerId: 1 });

    await waitFor(() => expect(runtimeActionClient.sendTeleopCommand).toHaveBeenCalled());
    expect(runtimeActionClient.sendTeleopCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 3,
        target: "/teleop_cmd",
      }),
    );
  });

  it("opens the Bloom debug runtime screen and subscribes topic widgets", async () => {
    const runtimeActionClient = createRuntimeActionClient();
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            "bloom-debug": bloomDebugConfiguration as unknown as ConfigurationBundle,
          },
          ids: ["bloom-debug"],
        })}
        runtimeActionClient={runtimeActionClient}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));

    expect(await screen.findByRole("region", { name: "Runtime application" })).toBeVisible();
    expect(screen.getByText("Teleop command echo")).toBeVisible();
    expect(screen.getByText("Velocity command X")).toBeVisible();
    expect(screen.getByText("Joint states echo")).toBeVisible();

    await waitFor(() => expect(runtimeActionClient.subscribeRuntimeTopic).toHaveBeenCalledTimes(3));
    expect(runtimeActionClient.subscribeRuntimeTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "/sandbox_controller/velocity_command",
        field_path: "twist.linear.x",
        widget_id: "velocity-plot",
      }),
    );
  });

  it("opens the builder from compact backend JSON without rendering a blank screen", async () => {
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            sandbox: compactSandboxConfiguration as unknown as ConfigurationBundle,
          },
        })}
      />,
    );

    await openDefaultScreenBuilder();

    expect(await screen.findByRole("region", { name: "Bloom builder workspace" })).toBeVisible();
    expect(document.querySelector("[data-screen-renderer='screen-artboard']")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Main" })).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "128, 104")).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "272 x 192")).toBeVisible();
  });

  it("renders real legacy toggle settings when optional payload fields are missing", async () => {
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            "petanque-admin": migratedPetanqueAdminConfiguration as unknown as ConfigurationBundle,
          },
          ids: ["petanque-admin"],
        })}
      />,
    );

    await openPetanqueScreenBuilder("default_control");
    fireEvent.click(await screen.findByRole("button", { name: "Select and move Gripper Control widget" }));

    expect(screen.getByLabelText("Output topic")).toHaveValue("/cmd/gripper");
    expect(screen.getByLabelText("ON payload")).toHaveValue("");
    expect(screen.getByLabelText("OFF payload")).toHaveValue("");
  });

  it("opens the webcam visualizer demo app with a camera viewer screen", async () => {
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            "webcam-visualizer": webcamVisualizerConfiguration as unknown as ConfigurationBundle,
          },
          ids: ["webcam-visualizer"],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Webcam visualizer app" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Camera viewer screen builder" }));

    expect(screen.getByRole("heading", { level: 2, name: "Camera viewer" })).toBeVisible();
    expect(screen.getAllByText("Local webcam").length).toBeGreaterThan(0);
    expect(screen.getByText("webcam:///dev/video0")).toBeVisible();
    expect(screen.getByText(/webcam permission/i)).toBeVisible();
  });

  it("renders the webcam visualizer as a runtime demo app", async () => {
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            "webcam-visualizer": webcamVisualizerConfiguration as unknown as ConfigurationBundle,
          },
          ids: ["webcam-visualizer"],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));

    expect(await screen.findByRole("region", { name: "Runtime application" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Webcam visualizer" })).toBeVisible();
    expect(screen.getByLabelText("Local webcam webcam preview")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Screen implementation coming soon" })).not.toBeInTheDocument();
  });

  it("renders an empty configuration state inside the main app", async () => {
    render(<App configurationClient={createConfigurationClient({ ids: [] })} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));

    expect(await screen.findByText("No configurations found yet.")).toBeVisible();
  });

  it("renders configuration loading failures inside the main app", async () => {
    render(<App configurationClient={createConfigurationClient({ error: new Error("API unavailable") })} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("API unavailable");
  });
});

function createConfigurationClient(
  options: { bundles?: Record<string, ConfigurationBundle>; ids?: string[]; error?: Error; saveError?: Error } = {},
) {
  const ids = options.ids ?? ["sandbox"];
  const storedBundles = new Map(
    ids.map((id) => [id, structuredClone(options.bundles?.[id] ?? createConfigurationBundle(id))] as const),
  );

  return {
    listConfigurations: vi.fn(async () => {
      if (options.error) {
        throw options.error;
      }
      return ids;
    }),
    getConfiguration: vi.fn(async (id: string): Promise<ConfigurationBundle> => {
      return structuredClone(storedBundles.get(id) ?? createConfigurationBundle(id));
    }),
    upsertConfiguration: vi.fn(async (id: string, bundle: ConfigurationBundle): Promise<ConfigurationBundle> => {
      if (options.saveError) {
        throw options.saveError;
      }

      const savedBundle = structuredClone(bundle);
      storedBundles.set(id, savedBundle);
      return structuredClone(savedBundle);
    }),
    upsertApplication: vi.fn(async (id: string, application: ApplicationConfig): Promise<ConfigurationBundle> => {
      if (options.saveError) {
        throw options.saveError;
      }

      const bundle = structuredClone(storedBundles.get(id) ?? createConfigurationBundle(id));
      const applicationIndex = bundle.applications.findIndex(
        (candidateApplication) => candidateApplication.id === application.id,
      );

      if (applicationIndex >= 0) {
        bundle.applications[applicationIndex] = structuredClone(application);
      } else {
        bundle.applications.push(structuredClone(application));
      }

      storedBundles.set(id, bundle);
      return structuredClone(bundle);
    }),
    upsertScreen: vi.fn(
      async (id: string, applicationId: string, nextScreen: ScreenConfig): Promise<ConfigurationBundle> => {
        if (options.saveError) {
          throw options.saveError;
        }

        const bundle = structuredClone(storedBundles.get(id) ?? createConfigurationBundle(id));
        const application = bundle.applications.find(
          (candidateApplication) => candidateApplication.id === applicationId,
        );

        if (!application) {
          throw new Error(`Application "${applicationId}" was not found.`);
        }

        const screenIndex = application.screens.findIndex((candidateScreen) => candidateScreen.id === nextScreen.id);

        if (screenIndex >= 0) {
          application.screens[screenIndex] = structuredClone(nextScreen);
        } else {
          application.screens.push(structuredClone(nextScreen));
        }

        storedBundles.set(id, bundle);
        return structuredClone(bundle);
      },
    ),
    deleteApplication: vi.fn(async (id: string, applicationId: string): Promise<void> => {
      if (options.saveError) {
        throw options.saveError;
      }

      const bundle = structuredClone(storedBundles.get(id) ?? createConfigurationBundle(id));
      bundle.applications = bundle.applications.filter((application) => application.id !== applicationId);
      storedBundles.set(id, bundle);
    }),
  } satisfies ConfigurationClient;
}

type TestRuntimeActionClient = RuntimeActionClient & {
  emitRuntimeTopicSample: (sample: RuntimeTopicSampleMessage) => void;
};

function createRuntimeActionClient(): TestRuntimeActionClient {
  const topicSampleListeners = new Set<(sample: RuntimeTopicSampleMessage) => void>();

  return {
    addRuntimeTopicSampleListener: vi.fn((listener) => {
      topicSampleListeners.add(listener);
      return () => topicSampleListeners.delete(listener);
    }),
    emitRuntimeTopicSample: (sample) => {
      for (const listener of topicSampleListeners) {
        listener(sample);
      }
    },
    publishRosTopic: vi.fn(
      async (request) =>
        ({
          topic: request.topic,
          message_type: request.message_type,
          status: "simulated",
          detail: "ROS publisher gateway is not configured.",
        }) as const,
    ),
    sendTeleopCommand: vi.fn(async (request) => ({
      detail: "Teleop command accepted.",
      payload: {
        angular: request.angular,
        linear: request.linear,
        mode: request.mode,
        seq: request.seq,
        status: "accepted" as const,
        target: request.target,
      },
      type: "teleop_ack" as const,
    })),
    subscribeRuntimeTopic: vi.fn(async (request) => ({
      detail: `Subscribed to ${request.topic}.`,
      payload: {
        field_path: request.field_path,
        message_type: request.message_type,
        topic: request.topic,
      },
      type: "subscription_ack" as const,
    })),
  };
}

function createConfigurationBundle(id: string): ConfigurationBundle {
  return {
    metadata: {
      schema_version: 1,
      exported_at: "2026-06-01T14:00:00Z",
      source: "dashboard-test",
    },
    applications: [
      {
        id,
        name: "Sandbox",
        description: "Sandbox operator interface",
        theme: DEFAULT_APPLICATION_THEME,
        profiles: [],
        screens: [
          {
            id: "main",
            title: "Main",
            canvas: {
              preset_id: "hd",
              runtime_mode: "fit",
            },
            widgets: [
              {
                id: "ros-toggle",
                kind: "toggle",
                title: "Digital output",
                layout: {
                  x: 24,
                  y: 32,
                  width: 220,
                  height: 96,
                },
                settings: {
                  initialValue: false,
                  messageType: "std_msgs/msg/Int32MultiArray",
                  offPayload: "{data: [13, 0]}",
                  onPayload: "{data: [13, 1]}",
                  topic: "/ui/ros_toggle",
                },
              },
            ],
          },
          {
            id: "diagnostics",
            title: "Diagnostics",
            canvas: {
              preset_id: "tablet",
              runtime_mode: "fit",
            },
            widgets: [
              {
                id: "echo",
                kind: "topic-echo",
                title: "Teleop Echo",
                layout: {
                  x: 40,
                  y: 40,
                  width: 360,
                  height: 180,
                },
                settings: {
                  topic: "/teleop_cmd",
                },
              },
            ],
          },
          {
            id: "placeholder",
            title: "Placeholder",
            canvas: {
              preset_id: "tablet",
              runtime_mode: "fit",
            },
            widgets: [],
          },
        ],
      },
    ],
  };
}

function createBundleWithReusableScreen(): ConfigurationBundle {
  const bundle = createConfigurationBundle("sandbox");

  return {
    ...bundle,
    applications: [
      ...bundle.applications,
      {
        id: "shared-screens",
        name: "Shared screens",
        description: "Reusable screen library for tests",
        theme: DEFAULT_APPLICATION_THEME,
        profiles: [],
        screens: [
          {
            id: "camera-feed",
            title: "Camera Feed",
            canvas: {
              preset_id: "tablet",
              runtime_mode: "fit",
            },
            widgets: [
              {
                id: "camera",
                kind: "camera",
                title: "Camera Stream",
                layout: {
                  x: 32,
                  y: 48,
                  width: 480,
                  height: 300,
                },
                settings: {
                  topic: "/camera/image/compressed",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function createBundleWithoutThemeInspiration(): ConfigurationBundle {
  const bundle = createConfigurationBundle("sandbox") as unknown as {
    applications: Array<{
      theme: {
        inspiration?: unknown;
      };
    }>;
  };

  delete bundle.applications[0]?.theme.inspiration;

  return bundle as unknown as ConfigurationBundle;
}

async function openDefaultScreenBuilder() {
  await openAppConfig();
  fireEvent.click(await screen.findByRole("button", { name: "Open Main screen builder" }));
}

async function openAppConfig() {
  fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open Sandbox app" }));
}

async function openPetanqueAppConfig() {
  fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
  fireEvent.click(await screen.findByRole("button", { name: "Open app-petanque-admin app" }));
}

async function openPetanqueScreenBuilder(screenName: string) {
  await openPetanqueAppConfig();
  fireEvent.click(await screen.findByRole("button", { name: `Open ${screenName} screen builder` }));
}

async function moveDigitalOutputWidget() {
  await moveWidget("Digital output");
}

async function moveWidget(widgetTitle: string) {
  const moveHandle = await screen.findByRole("button", { name: `Select and move ${widgetTitle} widget` });
  fireEvent.pointerDown(moveHandle, { button: 0, clientX: 10, clientY: 10 });
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: 50, clientY: 26 }));
  window.dispatchEvent(new MouseEvent("pointerup"));
}

function getRuntimeJoystickZone(): HTMLElement {
  const joystickZone = document.querySelector<HTMLElement>(".bloom-joystick-zone");
  if (!joystickZone) {
    throw new Error("Missing runtime joystick zone.");
  }

  joystickZone.getBoundingClientRect = () =>
    ({
      bottom: 200,
      height: 100,
      left: 100,
      right: 200,
      top: 100,
      width: 100,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;

  return joystickZone;
}

function createDragDataTransfer(screenId: string): DataTransfer {
  return {
    dropEffect: "copy",
    effectAllowed: "copy",
    files: [] as unknown as FileList,
    getData: vi.fn((dragType: string) => (dragType === BLOOM_SCREEN_DRAG_TYPE ? screenId : "")),
    items: [] as unknown as DataTransferItemList,
    setData: vi.fn(),
    types: [BLOOM_SCREEN_DRAG_TYPE],
  } as unknown as DataTransfer;
}
