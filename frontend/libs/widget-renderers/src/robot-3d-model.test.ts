/**
 * @vitest-environment jsdom
 */
import { Group, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import { createMeshCache, parseMesh, parseRobot, resolveRobotFrame, resolveToolLink } from "./robot-3d-model";
import type { RobotModelSource } from "./types";

/** A binary STL with one triangle. */
function stlBytes(): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + 50);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true);
  const floats = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
  floats.forEach((value, index) => {
    view.setFloat32(84 + index * 4, value, true);
  });
  return buffer;
}

const OBJ = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";

const URDF = `<robot name="arm">
  <link name="base_link"><visual><geometry><mesh filename="package://arm/meshes/base.stl"/></geometry></visual></link>
  <link name="upper"><visual><geometry><mesh filename="package://arm/meshes/base.stl"/></geometry></visual></link>
  <link name="tool"><visual><geometry><mesh filename="package://arm/meshes/missing.stl"/></geometry></visual></link>
  <joint name="shoulder" type="revolute"><parent link="base_link"/><child link="upper"/><axis xyz="0 0 1"/><limit lower="-1" upper="1" effort="1" velocity="1"/></joint>
  <joint name="wrist" type="fixed"><parent link="upper"/><child link="tool"/></joint>
</robot>`;

function source(): RobotModelSource & { asset: ReturnType<typeof vi.fn> } {
  return {
    load: async () => URDF,
    asset: vi.fn(async (uri: string) => (uri.endsWith("missing.stl") ? null : stlBytes())),
  };
}

describe("mesh parsing", () => {
  it("reads STL and OBJ, and refuses what it cannot draw", async () => {
    expect(await parseMesh("package://arm/meshes/a.STL", stlBytes())).toBeInstanceOf(Mesh);
    expect(await parseMesh("/share/arm/meshes/a.obj?x=1", new TextEncoder().encode(OBJ).buffer)).toBeInstanceOf(Group);
    expect(await parseMesh("package://arm/meshes/a.ply", stlBytes())).toBeNull();
  });
});

describe("the mesh cache", () => {
  it("fetches each file once and hands out clones over the same geometry", async () => {
    const model = source();
    const cache = createMeshCache(model);
    const [first, second] = await Promise.all([
      cache.load("package://arm/meshes/base.stl"),
      cache.load("package://arm/meshes/base.stl"),
    ]);
    expect(model.asset).toHaveBeenCalledTimes(1);
    expect(first).not.toBe(second);
    expect((first as Mesh).geometry).toBe((second as Mesh).geometry);
    expect(await cache.load("package://arm/meshes/missing.stl")).toBeNull();
    cache.dispose();
  });

  it("names the file in a fetch failure", async () => {
    const cache = createMeshCache({ load: async () => null, asset: async () => Promise.reject(new Error("401")) });
    await expect(cache.load("package://arm/meshes/base.stl")).rejects.toThrow("package://arm/meshes/base.stl: 401");
  });
});

describe("the parsed robot", () => {
  it("counts the meshes drawn and names the first that failed", async () => {
    const model = source();
    const { meshes, robot } = parseRobot(URDF, createMeshCache(model));
    expect(Object.keys(robot.links)).toEqual(["base_link", "upper", "tool"]);
    expect(await meshes).toEqual({
      count: 2,
      firstError: "no mesh at package://arm/meshes/base.stl".replace("base", "missing"),
    });
    expect(model.asset).toHaveBeenCalledTimes(2);
  });

  it("finds frames by link, then by any frame the URDF declares, and the tool by name or last", () => {
    const { robot } = parseRobot(URDF, createMeshCache(source()));
    expect(resolveRobotFrame(robot, "upper")).toBe(robot.links.upper);
    expect(resolveRobotFrame(robot, "shoulder")).toBe(robot.joints.shoulder);
    expect(resolveRobotFrame(robot, "map")).toBeNull();
    expect(resolveToolLink(robot, "upper")).toBe(robot.links.upper);
    expect(resolveToolLink(robot, "")).toBe(robot.links.tool);
  });
});
