/**
 * @vitest-environment jsdom
 */
import { Group, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { createMeshCache, parseMesh, parseRobot, resolveToolLink } from "./robot-3d-model";

const DAE = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><up_axis>Z_UP</up_axis></asset>
  <library_lights><light id="sun"><technique_common><directional><color>1 1 1</color></directional></technique_common></light></library_lights>
  <library_cameras><camera id="cam"><optics><technique_common><perspective><yfov>45</yfov><aspect_ratio>1</aspect_ratio><znear>0.1</znear><zfar>100</zfar></perspective></technique_common></optics></camera></library_cameras>
  <library_geometries>
    <geometry id="tri"><mesh>
      <source id="pos"><float_array id="pos-array" count="9">0 0 0 1 0 0 0 1 0</float_array>
        <technique_common><accessor source="#pos-array" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
      <vertices id="verts"><input semantic="POSITION" source="#pos"/></vertices>
      <triangles count="1"><input semantic="VERTEX" source="#verts" offset="0"/><p>0 1 2</p></triangles>
    </mesh></geometry>
  </library_geometries>
  <library_visual_scenes><visual_scene id="scene">
    <node id="light-node"><instance_light url="#sun"/></node>
    <node id="camera-node"><instance_camera url="#cam"/></node>
    <node id="mesh-node"><instance_geometry url="#tri"/></node>
  </visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`;

const GLTF = JSON.stringify({
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0, 1] }],
  nodes: [{ name: "cam", camera: 0 }, { name: "empty" }],
  cameras: [{ type: "perspective", perspective: { yfov: 0.8, znear: 0.1 } }],
});

/** Copied into this realm's ArrayBuffer: the loaders test `instanceof ArrayBuffer` against the page's global. */
function bytes(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

function strays(object: Object3D): string[] {
  const found: string[] = [];
  object.traverse((child) => {
    const node = child as Object3D & { isCamera?: boolean; isLight?: boolean };
    if (node.isCamera || node.isLight) {
      found.push(child.type);
    }
  });
  return found;
}

describe("mesh formats the API serves", () => {
  it("reads a Collada file and leaves its lights and cameras behind", async () => {
    const scene = await parseMesh("package://arm/meshes/link.dae", bytes(DAE));
    expect(scene).not.toBeNull();
    expect(strays(scene as Object3D)).toEqual([]);
    let meshes = 0;
    (scene as Object3D).traverse((child) => {
      if ((child as { isMesh?: boolean }).isMesh) meshes += 1;
    });
    expect(meshes).toBe(1);
  });

  it("reads a glTF file and drops its cameras", async () => {
    const scene = await parseMesh("package://arm/meshes/link.gltf?v=2", bytes(GLTF));
    expect(scene).not.toBeNull();
    expect(strays(scene as Object3D)).toEqual([]);
    expect((scene as Object3D).getObjectByName("empty")).toBeDefined();
  });

  it("rejects a glTF it cannot read rather than drawing nothing silently", async () => {
    await expect(parseMesh("package://arm/meshes/broken.glb", bytes("{not json"))).rejects.toBeDefined();
  });
});

describe("the parsed robot when a mesh cannot be fetched", () => {
  const URDF = `<robot name="arm">
  <link name="base_link"><visual><geometry><mesh filename="package://arm/meshes/base.stl"/></geometry></visual></link>
</robot>`;

  it("names the failure the cache reports and still hands back the robot", async () => {
    const cache = createMeshCache({ load: async () => URDF, asset: async () => Promise.reject(new Error("403")) });
    const { meshes, robot } = parseRobot(URDF, cache);
    expect(await meshes).toEqual({ count: 0, firstError: "package://arm/meshes/base.stl: 403" });
    expect(Object.keys(robot.links)).toEqual(["base_link"]);
    // Disposing a cache with a failed entry neither throws nor leaves an unhandled rejection behind.
    cache.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("frees what a cache loaded once disposed, without touching what it has already handed out", async () => {
    const stl = new ArrayBuffer(84 + 50);
    new DataView(stl).setUint32(80, 1, true);
    const cache = createMeshCache({ load: async () => URDF, asset: async () => stl });
    const clone = (await cache.load("package://arm/meshes/base.stl")) as Object3D;
    expect(clone).toBeDefined();
    cache.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // A second load after disposal fetches again rather than serving a freed geometry.
    expect(await cache.load("package://arm/meshes/base.stl")).not.toBe(clone);
  });

  it("has no tool link on a robot without links", () => {
    const { robot } = parseRobot(
      '<robot name="empty"></robot>',
      createMeshCache({ load: async () => null, asset: async () => null }),
    );
    expect(resolveToolLink(robot, "tool")).toBeNull();
    expect(new Group().children).toEqual([]);
  });
});
