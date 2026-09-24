import { describe, expect, it } from "vitest";
import { resolveDeviceClass } from "./canvas";
import { createDefaultWidgetRegistry } from "./widget-catalog";
import { widgetFitsDeviceClass } from "./widget-definition";

describe("device classes", () => {
  it("are desktop for the 1920x1080 presets and tablet for every other", () => {
    expect(resolveDeviceClass({ canvas: { preset_id: "full-hd", runtime_mode: "fit" } })).toBe("desktop");
    expect(resolveDeviceClass({ canvas: { preset_id: "local-screen", runtime_mode: "fit" } })).toBe("desktop");
    expect(resolveDeviceClass({ canvas: { preset_id: "native-1280x720", runtime_mode: "fit" } })).toBe("tablet");
    expect(resolveDeviceClass({ canvas: { preset_id: "wide-tablet", runtime_mode: "fit" } })).toBe("tablet");
  });

  it("let a kind name the classes it runs on, and every other kind run anywhere", () => {
    const registry = createDefaultWidgetRegistry();
    const view = registry.get("robot-3d");
    const joystick = registry.get("joystick");
    if (!view || !joystick) throw new Error("missing definitions");
    expect(widgetFitsDeviceClass(view, "desktop")).toBe(true);
    expect(widgetFitsDeviceClass(view, "tablet")).toBe(false);
    expect(widgetFitsDeviceClass(view, undefined)).toBe(true);
    expect(widgetFitsDeviceClass(joystick, "tablet")).toBe(true);
  });
});
