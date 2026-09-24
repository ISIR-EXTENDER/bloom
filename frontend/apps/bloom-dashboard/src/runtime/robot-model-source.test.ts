import { describe, expect, it, vi } from "vitest";
import { createRobotModelSource, resolvePackageAsset } from "./robot-model-source";

describe("resolvePackageAsset", () => {
  it("reads package:// URIs", () => {
    expect(resolvePackageAsset("package://explorer_description/meshes/base.dae")).toEqual({
      packageName: "explorer_description",
      path: "meshes/base.dae",
    });
  });

  it("reads the absolute share path xacro's $(find) expands to, with or without file://", () => {
    const expected = { packageName: "kortex_description", path: "arms/gen3/7dof/meshes/base_link.stl" };
    expect(
      resolvePackageAsset(
        "/ws/install/kortex_description/share/kortex_description/arms/gen3/7dof/meshes/base_link.stl",
      ),
    ).toEqual(expected);
    expect(
      resolvePackageAsset("file:///opt/ros/jazzy/share/kortex_description/arms/gen3/7dof/meshes/base_link.stl"),
    ).toEqual(expected);
  });

  it("takes the package from the last share segment that leads somewhere", () => {
    expect(resolvePackageAsset("/home/lab/share/ws/install/arm/share/arm/meshes/a.stl")).toEqual({
      packageName: "arm",
      path: "meshes/a.stl",
    });
    expect(resolvePackageAsset("/opt/ros/jazzy/share/arm/meshes/share/a.stl")).toEqual({
      packageName: "arm",
      path: "meshes/share/a.stl",
    });
  });

  it("refuses what names no package or no file", () => {
    expect(resolvePackageAsset("package://arm")).toBeNull();
    expect(resolvePackageAsset("/tmp/a.stl")).toBeNull();
    expect(resolvePackageAsset("/x/share/arm/")).toBeNull();
  });
});

describe("createRobotModelSource", () => {
  it("is nothing without the API's two reads, and forwards them otherwise", async () => {
    expect(createRobotModelSource({} as never)).toBeUndefined();
    const readRobotModel = vi.fn(async () => ({ node: "/robot_state_publisher", status: "ready", urdf: "<robot/>" }));
    const readRobotModelAsset = vi.fn(async () => new ArrayBuffer(4));
    const source = createRobotModelSource({ readRobotModel, readRobotModelAsset } as never);
    expect(await source?.load()).toBe("<robot/>");
    expect(await source?.asset("package://arm/meshes/a.stl")).toBeInstanceOf(ArrayBuffer);
    expect(readRobotModelAsset).toHaveBeenCalledWith("arm", "meshes/a.stl");
    expect(await source?.asset("nonsense")).toBeNull();
  });
});
