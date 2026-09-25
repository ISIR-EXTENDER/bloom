/**
 * @vitest-environment jsdom
 */
import {
  Group,
  InstancedMesh,
  type Line,
  type LineSegments,
  Mesh,
  type Object3D,
  Points,
  Sprite,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { buildMarkerShape, disposeObject, isMarkerObject, type MarkerSample, MarkerStore } from "./robot-3d-markers";

const BASE = { header: { frame_id: "base_link" }, ns: "t", id: 1, action: 0 };
const COLOR = { r: 0.2, g: 0.4, b: 0.6, a: 1 };

function marker(extra: Partial<MarkerSample>): MarkerSample {
  return {
    ...BASE,
    type: 2,
    scale: { x: 0.1, y: 0.1, z: 0.1 },
    color: COLOR,
    pose: { orientation: { w: 1 } },
    ...extra,
  };
}

function store(links: Record<string, Object3D> = {}) {
  const fallback = new Group();
  const loadMesh = vi.fn(async () => new Mesh());
  const onChange = vi.fn();
  const markers = new MarkerStore({ fallback, resolve: (id) => links[id] ?? null }, loadMesh, onChange);
  return { fallback, loadMesh, markers, onChange };
}

describe("marker shapes, as rviz sizes them", () => {
  it("draws the primitives with x, y and z as their extents", () => {
    const cube = buildMarkerShape(marker({ type: 1, scale: { x: 1, y: 2, z: 3 } })) as Mesh;
    expect(cube.scale.toArray()).toEqual([1, 2, 3]);
    const sphere = buildMarkerShape(marker({ type: 2, scale: { x: 0.2, y: 0.2, z: 0.4 } })) as Mesh;
    expect(sphere.scale.toArray()).toEqual([0.2, 0.2, 0.4]);
  });

  it("stands a cylinder along the marker's z axis, x and y being its diameters", () => {
    const cylinder = buildMarkerShape(marker({ type: 3, scale: { x: 0.2, y: 0.4, z: 1 } })) as Mesh;
    cylinder.geometry.computeBoundingBox();
    const box = cylinder.geometry.boundingBox;
    if (!box) {
      throw new Error("no bounding box");
    }
    // The unit geometry is 1 tall along z before the scale applies.
    expect(box.max.z - box.min.z).toBeCloseTo(1, 5);
    expect(box.max.x - box.min.x).toBeCloseTo(1, 5);
    expect(cylinder.scale.toArray()).toEqual([0.2, 0.4, 1]);
  });

  it("builds a two-point arrow from start to end with the head scale.z long", () => {
    const shape = buildMarkerShape(
      marker({
        type: 0,
        scale: { x: 0.02, y: 0.05, z: 0.1 },
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 1 },
        ],
      }),
    );
    if (!shape) {
      throw new Error("no arrow");
    }
    const [arrow] = shape.children;
    const [shaft, head] = (arrow as Group).children as Mesh[];
    expect(shaft?.position.z).toBeCloseTo(0.45, 5);
    expect(head?.position.z).toBeCloseTo(0.95, 5);
  });

  it("points a pose arrow along +x, scale.x long, with rviz's 23% head", () => {
    const arrow = buildMarkerShape(marker({ type: 0, scale: { x: 1, y: 0.05, z: 0.1 }, points: [] })) as Group;
    const tip = new Vector3(0, 0, 1).applyQuaternion(arrow.quaternion);
    expect(tip.x).toBeCloseTo(1, 5);
    const [shaft, head] = arrow.children as Mesh[];
    expect(shaft?.position.z).toBeCloseTo(0.385, 5);
    expect(head?.position.z).toBeCloseTo(0.885, 5);
  });

  it("drops an arrow between two identical points", () => {
    const same = { x: 1, y: 1, z: 1 };
    expect(buildMarkerShape(marker({ type: 0, points: [same, same] }))).toBeNull();
  });

  it("keeps per-point colours only when the marker gives exactly one per point", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ];
    const coloured = buildMarkerShape(
      marker({ type: 4, points, colors: [COLOR, COLOR, { r: 1, g: 0, b: 0 }] }),
    ) as Line;
    expect(coloured.geometry.getAttribute("color").count).toBe(3);
    const plain = buildMarkerShape(marker({ type: 5, points, colors: [COLOR] })) as LineSegments;
    expect(plain.geometry.getAttribute("color")).toBeUndefined();
    expect(buildMarkerShape(marker({ type: 8, points }))).toBeInstanceOf(Points);
  });

  it("draws cube and sphere lists as one instanced mesh each", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    const cubes = buildMarkerShape(marker({ type: 6, points })) as InstancedMesh;
    expect(cubes).toBeInstanceOf(InstancedMesh);
    expect(cubes.count).toBe(2);
    const spheres = buildMarkerShape(marker({ type: 7, points, colors: [COLOR, COLOR] })) as InstancedMesh;
    expect(spheres.instanceColor).not.toBeNull();
  });

  it("draws a triangle list from whole triangles only", () => {
    const points = Array.from({ length: 7 }, (_, index) => ({ x: index, y: 0, z: index % 2 }));
    const mesh = buildMarkerShape(marker({ type: 11, points })) as Mesh;
    expect(mesh.geometry.getAttribute("position").count).toBe(6);
  });

  it("faces text at the camera, sized by scale.z", () => {
    const text = buildMarkerShape(marker({ type: 9, text: "target", scale: { x: 0, y: 0, z: 0.2 } })) as Sprite;
    expect(text).toBeInstanceOf(Sprite);
    expect(text.scale.y).toBeCloseTo(0.2, 5);
    expect(text.scale.x).toBeGreaterThan(0.2);
  });

  it("draws a marker whose per-point colours override its own unset colour", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    // rviz: a populated colors array overrides the color field, alpha included.
    const coloured = buildMarkerShape(
      marker({ type: 4, points, colors: [COLOR, COLOR], color: { r: 0, g: 0, b: 0, a: 0 } }),
    ) as Line;
    expect(coloured.visible).toBe(true);
    // Drawn, not merely present: an opacity carried over from the unset colour would be invisible.
    const material = coloured.material as { opacity: number; transparent: boolean; vertexColors: boolean };
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.vertexColors).toBe(true);
  });

  it("hides a marker with alpha zero instead of drawing it opaque", () => {
    expect(buildMarkerShape(marker({ color: { ...COLOR, a: 0 } }))?.visible).toBe(false);
    expect(buildMarkerShape(marker({ color: { r: 1, g: 1, b: 1 } }))?.visible).toBe(true);
  });

  it("returns nothing for a type it does not draw", () => {
    expect(buildMarkerShape(marker({ type: 42 }))).toBeNull();
  });
});

describe("the marker store", () => {
  it("attaches a marker to the link its frame names, and counts the frames it does not know", () => {
    const link = new Group();
    const { fallback, markers } = store({ tool: link });
    markers.apply(
      [
        marker({ header: { frame_id: "/tool" }, id: 1 }),
        marker({ header: { frame_id: "odom" }, id: 2 }),
        marker({ header: { frame_id: "" }, id: 3 }),
      ],
      0,
    );
    expect(link.children).toHaveLength(1);
    expect(fallback.children).toHaveLength(2);
    expect(isMarkerObject(link.children[0] as Object3D)).toBe(true);
    expect(isMarkerObject(link)).toBe(false);
    expect(markers.report()).toEqual({ count: 3, loading: 0, unplaced: 1 });
  });

  it("moves a marker whose pose changed and rebuilds one whose shape changed", () => {
    const { fallback, markers } = store();
    markers.apply([marker({ pose: { position: { x: 1, y: 0, z: 0 }, orientation: { w: 1 } } })], 0);
    const first = fallback.children[0];
    markers.apply([marker({ pose: { position: { x: 2, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 0 } } })], 0);
    expect(fallback.children[0]).toBe(first);
    expect(first?.position.x).toBe(2);
    // A zero quaternion reads as identity rather than a NaN rotation.
    expect(first?.quaternion.w).toBe(1);
    markers.apply([marker({ scale: { x: 0.5, y: 0.5, z: 0.5 } })], 0);
    expect(fallback.children[0]).not.toBe(first);
    expect(markers.report().count).toBe(1);
  });

  it("deletes by namespace and id, and everything on DELETEALL", () => {
    const { fallback, markers } = store();
    markers.apply([marker({ id: 1 }), marker({ id: 2 }), marker({ ns: "other", id: 1 })], 0);
    markers.apply([{ ...BASE, id: 1, action: 2 }], 0);
    expect(markers.report().count).toBe(2);
    markers.apply([{ action: 3 }], 0);
    expect(markers.report().count).toBe(0);
    expect(fallback.children).toHaveLength(0);
  });

  it("expires a marker when its lifetime runs out, and says when the next one does", () => {
    const { markers } = store();
    markers.apply([marker({ id: 1, lifetime: { sec: 1, nanosec: 500000000 } }), marker({ id: 2 })], 1000);
    expect(markers.nextExpiry()).toBe(2500);
    expect(markers.expire(2499)).toBe(false);
    expect(markers.expire(2500)).toBe(true);
    expect(markers.report().count).toBe(1);
    expect(markers.nextExpiry()).toBeNull();
    // Republishing the marker renews its lifetime.
    markers.apply([marker({ id: 2, lifetime: { sec: 0, nanosec: 500000000 } })], 3000);
    expect(markers.nextExpiry()).toBe(3500);
  });

  it("frees the geometry of what it removes", () => {
    const { fallback, markers } = store();
    markers.apply([marker({ id: 1 })], 0);
    const mesh = fallback.children[0] as Mesh;
    const geometry = vi.spyOn(mesh.geometry, "dispose");
    const material = vi.spyOn(mesh.material as { dispose: () => void }, "dispose");
    markers.clear();
    expect(geometry).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();
  });

  it("holds a place for a mesh marker and fills it when the mesh arrives", async () => {
    const base = new Group();
    const { loadMesh, markers, onChange } = store({ base_link: base });
    markers.apply(
      [marker({ type: 10, mesh_resource: "package://pkg/meshes/hand.stl", scale: { x: 2, y: 2, z: 2 } })],
      0,
    );
    expect(markers.report()).toEqual({ count: 1, loading: 1, unplaced: 0 });
    expect(loadMesh).toHaveBeenCalledWith("package://pkg/meshes/hand.stl");
    await Promise.resolve();
    await Promise.resolve();
    const holder = base.children[0] as Group;
    expect(holder.children).toHaveLength(1);
    expect(markers.report().loading).toBe(0);
    expect(holder.children[0]?.scale.x).toBe(2);
    expect(onChange).toHaveBeenCalled();
  });

  it("leaves the shared geometry of a mesh marker alone when disposing it", () => {
    const shared = new Mesh();
    shared.userData.sharedGeometry = true;
    const spy = vi.spyOn(shared.geometry, "dispose");
    disposeObject(shared);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores a mesh marker without a resource and an action it does not know", () => {
    const { markers } = store();
    markers.apply([marker({ type: 10 }), marker({ id: 2, action: 7 })], 0);
    expect(markers.report().count).toBe(0);
  });
});
