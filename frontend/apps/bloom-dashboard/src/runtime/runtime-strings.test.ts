import { describe, expect, it } from "vitest";

import kioskBarSource from "./RuntimeKioskBar.tsx?raw";
import settingsPanelSource from "./RuntimeSettingsPanel.tsx?raw";
import stopControlSource from "./RuntimeStopControl.tsx?raw";
import workspaceSource from "./RuntimeWorkspace.tsx?raw";
import { resolveRuntimeStatusChip } from "./runtime-status-chip";
import statusChipSource from "./runtime-status-chip.ts?raw";
import { getRuntimeStrings, pseudoLocalizeRuntimeStrings } from "./strings";

describe("runtime string catalogs", () => {
  it("provides the same complete key tree for every supported language", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value).flatMap(([key, nested]) => keys(nested, prefix ? `${prefix}.${key}` : key))
        : [prefix];

    expect(keys(getRuntimeStrings("es"))).toEqual(keys(getRuntimeStrings("en")));
    expect(keys(getRuntimeStrings("fr"))).toEqual(keys(getRuntimeStrings("en")));
  });

  it("renders the status word from the selected locale", () => {
    expect(
      resolveRuntimeStatusChip(
        { stopped: false, asserted: false, engaged_at: "", detail: "" },
        { state: "connected", settled: true },
        getRuntimeStrings("fr"),
      ),
    ).toEqual({ label: "PRÊT", tone: "ready" });
  });

  it("falls back to English for an unsupported stored locale", () => {
    expect(getRuntimeStrings("de" as "en")).toBe(getRuntimeStrings("en"));
  });

  it("keeps operator-shell literals out of localized runtime components", () => {
    const source = [kioskBarSource, settingsPanelSource, stopControlSource, workspaceSource, statusChipSource].join(
      "\n",
    );
    const forbiddenLiterals = [
      '"Back to operation"',
      '"CONNECTING"',
      '"Hold for one second to resume"',
      '"Hold to open maintenance"',
      '"LINK DOWN"',
      '"Maintenance"',
      '"READY"',
      '"Runtime application"',
      '"Runtime screen coming soon"',
      '"STOPPED"',
      '"Stop the robot"',
      '"Switch runtime screen"',
    ];

    for (const literal of forbiddenLiterals) {
      expect(source).not.toContain(literal);
    }
  });

  it("creates a visibly bounded pseudo-locale with at least 35 percent expansion", () => {
    const source = getRuntimeStrings("en").stop.resume;
    const pseudo = pseudoLocalizeRuntimeStrings().stop.resume;
    expect(pseudo.startsWith("[")).toBe(true);
    expect(pseudo.endsWith("]")).toBe(true);
    expect(pseudo.length).toBeGreaterThanOrEqual(Math.ceil(source.length * 1.35));
  });
});
