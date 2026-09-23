import type { ApplicationConfig, WidgetConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import explorerManager from "../../../../backend/seed/applications/explorer-manager.json";
import kinovaManager from "../../../../backend/seed/applications/kinova-manager.json";
import { localizeOperatorText, localizeWidget } from "./operator-glossary";

describe("the operator glossary", () => {
  it("translates the known control words and keeps arrows where they were", () => {
    expect(localizeOperatorText("↶ Turn left", "es")).toBe("↶ Girar a la izquierda");
    expect(localizeOperatorText("Turn right ↷", "fr")).toBe("Tourner à droite ↷");
    expect(localizeOperatorText("Close gripper", "fr")).toBe("Fermer la pince");
    expect(localizeOperatorText("Slow", "es")).toBe("Lenta");
  });

  it("translates the Joystick Lab frame words, group labels, screen titles and role names", () => {
    expect(localizeOperatorText("Tool", "es")).toBe("Herramienta");
    expect(localizeOperatorText("Force sensor", "fr")).toBe("Capteur d'effort");
    expect(localizeOperatorText("SHAPING MODE — requested, never confirmed", "fr")).toBe(
      "MODE DE MOUVEMENT — demandé, jamais confirmé",
    );
    expect(localizeOperatorText("Drive · Operator", "es")).toBe("Conducción · Operador");
    expect(localizeOperatorText("One switch", "fr")).toBe("Un contacteur");
  });

  it("translates the words of a topic label and never the topic", () => {
    expect(localizeOperatorText("SENT — /joystick_cartesian_command", "es")).toBe(
      "ENVIADO — /joystick_cartesian_command",
    );
    expect(localizeOperatorText("WHAT WAS SENT — /joint_target_command", "fr")).toBe(
      "CE QUI A ÉTÉ ENVOYÉ — /joint_target_command",
    );
    expect(localizeOperatorText("SENT — somewhere", "fr")).toBe("SENT — somewhere");
  });

  it("translates the held and released words of a hold button", () => {
    const snake: WidgetConfig = {
      id: "lab-snake-hold",
      kind: "command-button",
      title: "Hold snake",
      layout: { x: 0, y: 0, width: 150, height: 80 },
      settings: { button_label: "Hold snake", pressed_label: "SNAKE ON", released_label: "Hold snake" },
    };

    expect(localizeWidget(snake, "fr").settings).toEqual({
      button_label: "Maintenir serpent",
      pressed_label: "SERPENT ACTIVÉ",
      released_label: "Maintenir serpent",
    });
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

  // Words the operator apps put on screen must not reach an ES or FR session in English. Proper nouns are
  // named here rather than translated: an arm, a ROS type and a frame keep their names in every language.
  it("knows every display word the two operator apps ship", () => {
    // Snake gain: Susana, 2026-09-24, the team's term in every language.
    const KEEPS_ITS_NAME = new Set(["Jaco", "Twist", "Base", "Hybrid", "Snake gain"]);
    const untranslated: string[] = [];

    for (const bundle of [explorerManager, kinovaManager] as unknown as { applications: ApplicationConfig[] }[]) {
      for (const application of bundle.applications) {
        for (const screen of application.screens) {
          for (const widget of screen.widgets) {
            for (const [key, value] of Object.entries({ title: widget.title, ...widget.settings })) {
              if (typeof value !== "string" || !TEXT_KEYS.has(key)) continue;
              if (!/[a-zA-Z]{3}/.test(value) || KEEPS_ITS_NAME.has(value)) continue;
              // A word the glossary knows may still read the same in one language: Pivot is Pivot in French.
              const known = localizeOperatorText(value, "es") !== value || localizeOperatorText(value, "fr") !== value;
              if (!known) untranslated.push(`${screen.id}.${widget.id}.${key}: ${value}`);
            }
          }
        }
      }
    }

    expect(untranslated).toEqual([]);
  });
});

const TEXT_KEYS = new Set([
  "button_label",
  "hint",
  "offLabel",
  "offStateLabel",
  "onLabel",
  "onStateLabel",
  "pressed_label",
  "released_label",
  "text",
  "title",
]);
