import { describe, expect, it } from "vitest";
import {
  legacyCanvasScreensToApplicationConfig,
  legacyCanvasScreenToConfig,
  legacyCanvasWidgetToConfig,
  legacyRectToLayout,
} from "./legacy";
import { localizeEmptyEcho, localizeOperatorText, localizeWidget } from "./operator-glossary";

describe("importing an extender_ui screen", () => {
  it("names the screen from whichever of id, name, title or label it carries, and keeps its canvas preset", () => {
    expect(legacyCanvasScreenToConfig({ name: "sandbox", label: "Sandbox" })).toMatchObject({
      id: "sandbox",
      title: "Sandbox",
    });
    expect(legacyCanvasScreenToConfig({})).toMatchObject({ id: "legacy-screen", title: "legacy-screen" });
    expect(
      legacyCanvasScreenToConfig({ id: "s", canvas: { presetId: "native-1280x720", runtimeMode: "center" } }).canvas,
    ).toEqual({ preset_id: "native-1280x720", runtime_mode: "center" });
    // A preset the library does not know falls back rather than shipping an unrenderable canvas.
    expect(legacyCanvasScreenToConfig({ id: "s", canvas: { presetId: "vga", runtimeMode: "warp" } }).canvas).toEqual(
      legacyCanvasScreenToConfig({ id: "s" }).canvas,
    );
  });

  it("reads a rect by either spelling and fills what is missing", () => {
    expect(legacyRectToLayout({ x: 10, y: 20, w: 300, h: 100 })).toEqual({ x: 10, y: 20, width: 300, height: 100 });
    expect(legacyRectToLayout({ width: 320, height: 90 })).toEqual({ x: 0, y: 0, width: 320, height: 90 });
    expect(legacyRectToLayout(undefined)).toEqual({ x: 0, y: 0, width: 160, height: 80 });
  });

  it("turns a navigation button into a screen link and a topic monitor into an echo of its first topic", () => {
    const navigation = legacyCanvasWidgetToConfig({
      id: "go",
      kind: "navigation-button",
      label: "Go home",
      targetScreenId: "home",
    });
    expect(navigation.kind).toBe("command-button");
    expect(navigation.settings).toMatchObject({
      button_label: "Go home",
      command: "navigate_screen",
      targetScreenId: "home",
    });

    const monitor = legacyCanvasWidgetToConfig({
      id: "mon",
      kind: "topic-monitor",
      topics: ["bad", { topic: "/joint_states", messageType: "sensor_msgs/msg/JointState" }],
      showDetails: true,
    });
    expect(monitor.kind).toBe("topic-echo");
    expect(monitor.settings).toMatchObject({
      topic: "/joint_states",
      messageType: "sensor_msgs/msg/JointState",
      show_details: true,
    });
    expect(legacyCanvasWidgetToConfig({ id: "mon", kind: "topic-monitor", topic: "/x" }).settings).toMatchObject({
      topic: "/x",
      messageType: "",
      show_details: false,
    });
  });

  it("keeps the application's own order of screens, skips ids it does not ship, and appends the rest", () => {
    const application = legacyCanvasScreensToApplicationConfig([{ id: "a" }, { id: "b" }, { id: "c" }], {
      id: "ops",
      homeScreenId: "b",
      screenIds: ["c", "missing", "a"],
    });
    expect(application.screens.map((screen) => screen.id)).toEqual(["c", "a", "b"]);
    expect(application.description).toBe("Home screen: b");
    const unordered = legacyCanvasScreensToApplicationConfig([{ id: "a" }, { id: "b" }], { screenIds: [] });
    expect(unordered.screens.map((screen) => screen.id)).toEqual(["a", "b"]);
    expect(unordered.id).toBe("legacy-application");
  });
});

describe("operator words on screen", () => {
  it("translates the words of a topic label and never the topic, in both languages", () => {
    expect(localizeOperatorText("SENT — /mode_request", "fr")).toBe("ENVOYÉ — /mode_request");
    expect(localizeOperatorText("WHAT WAS SENT — /teleop_cmd", "es")).toBe("LO QUE SE ENVIÓ — /teleop_cmd");
    // A label whose topic is not a topic stays as written.
    expect(localizeOperatorText("SENT — nothing here", "fr")).toBe("SENT — nothing here");
  });

  it("translates a slider's direction labels and a segment slider's labels, and leaves the values alone", () => {
    const widget = localizeWidget(
      {
        id: "s",
        kind: "slider",
        title: "Speed",
        layout: { x: 0, y: 0, width: 1, height: 1 },
        settings: {
          labels: { negative: "◀ Roll left", positive: "Roll right ▶", note: 4 },
          segment_labels: ["Slow", "Medium", 3],
          segment_values: [0.1, 0.2, 0.3],
          topic: "/max_linear_speed",
        },
      },
      "fr",
    );
    expect(widget.settings.labels).toEqual({ negative: "◀ Rouler à gauche", positive: "Rouler à droite ▶", note: 4 });
    expect(widget.settings.segment_labels).toEqual(["Lente", "Moyenne", 3]);
    expect(widget.settings.segment_values).toEqual([0.1, 0.2, 0.3]);
    expect(widget.settings.topic).toBe("/max_linear_speed");
  });

  it("builds the echo's empty line around the widget's title", () => {
    expect(localizeEmptyEcho("Mode", "es")).toBe("No se ha publicado ningún Mode en esta sesión.");
    expect(localizeEmptyEcho("Mode", "fr")).toBe("Aucun Mode n'a été publié pendant cette session.");
    expect(localizeEmptyEcho("Mode", undefined)).toBe("No Mode has been published this session.");
  });
});
