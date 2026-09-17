import type { WidgetConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import { localizeOperatorText, localizeWidget } from "./operator-glossary";

describe("the operator glossary", () => {
  it("translates the known control words and keeps arrows where they were", () => {
    expect(localizeOperatorText("↶ Turn left", "es")).toBe("↶ Girar a la izquierda");
    expect(localizeOperatorText("Turn right ↷", "fr")).toBe("Tourner à droite ↷");
    expect(localizeOperatorText("Close gripper", "fr")).toBe("Fermer la pince");
    expect(localizeOperatorText("Slow", "es")).toBe("Lenta");
  });

  it("leaves English, and any authored text it does not know, as written", () => {
    expect(localizeOperatorText("Turn left", "en")).toBe("Turn left");
    expect(localizeOperatorText("Save Tag", "fr")).toBe("Save Tag");
  });

  it("changes only display words on a widget, never what it publishes", () => {
    const gripper: WidgetConfig = {
      id: "drive-gripper",
      kind: "toggle",
      title: "Gripper",
      layout: { x: 0, y: 0, width: 300, height: 120 },
      settings: {
        onLabel: "Open gripper",
        offLabel: "Close gripper",
        onStateLabel: "closed",
        offStateLabel: "open",
        topic: "/gripper_controller/commands",
        onPayload: "{data: [0.8]}",
      },
    };

    expect(localizeWidget(gripper, "es")).toEqual({
      ...gripper,
      title: "Pinza",
      settings: {
        ...gripper.settings,
        onLabel: "Abrir la pinza",
        offLabel: "Cerrar la pinza",
        onStateLabel: "cerrada",
        offStateLabel: "abierta",
      },
    });
    expect(localizeWidget(gripper, "en")).toBe(gripper);
  });
});
