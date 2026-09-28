/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_SCENE_PALETTE, parseSceneColor, readScenePalette, watchThemeChange } from "./robot-3d-palette";

describe("3D view palette", () => {
  it("reads hex and flattens a translucent token over the surface", () => {
    expect(parseSceneColor("#7e967e")).toEqual([126, 150, 126]);
    expect(parseSceneColor("#fff")).toEqual([255, 255, 255]);
    expect(parseSceneColor("rgba(0, 0, 0, 0.5)", [255, 255, 255])).toEqual([127.5, 127.5, 127.5]);
    expect(parseSceneColor("color-mix(in srgb, red, blue)")).toBeNull();
  });

  it("takes the robot, command and grid colours from the theme on the nearest root", () => {
    const root = document.createElement("div");
    root.style.setProperty("--bloom-color-sage", "#7fae88");
    root.style.setProperty("--bloom-color-command", "#7ab0ff");
    root.style.setProperty("--bloom-color-hairline", "#38423d");
    root.style.setProperty("--bloom-color-hairline-strong", "#56625c");
    const stage = document.createElement("div");
    root.append(stage);
    document.body.append(root);

    const palette = readScenePalette(stage);

    expect(`#${palette.robot.getHexString()}`).toBe("#7fae88");
    expect(`#${palette.command.getHexString()}`).toBe("#7ab0ff");
    expect(`#${palette.gridCenter.getHexString()}`).toBe("#56625c");
    root.remove();
  });

  it("falls back to the Bloom Garden stage outside any theme", () => {
    const palette = readScenePalette(null);
    expect(`#${palette.robot.getHexString()}`).toBe(DEFAULT_SCENE_PALETTE.robot);
    expect(`#${palette.command.getHexString()}`).toBe(DEFAULT_SCENE_PALETTE.command);
  });

  it("hears the palette change on the themed ancestor", async () => {
    const root = document.createElement("div");
    root.setAttribute("data-bloom-theme", "bloom");
    const stage = document.createElement("div");
    root.append(stage);
    document.body.append(root);
    let changes = 0;
    const stop = watchThemeChange(stage, () => {
      changes += 1;
    });

    root.setAttribute("data-bloom-theme", "dark");
    await Promise.resolve();
    stop();
    root.setAttribute("data-bloom-theme", "bloom");
    await Promise.resolve();

    expect(changes).toBe(1);
    root.remove();
  });
});
