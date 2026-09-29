/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render } from "@testing-library/react";
import {
  AxesHelper,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  Vector3,
} from "three";
import type { URDFRobot } from "urdf-loader";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RobotScene, { MODEL_REFRESH_MS, MODEL_RETRY_MS, type SceneStatus } from "./robot-3d-scene";
import type { RobotModelSource } from "./types";

// jsdom has no GPU: the renderer is the one thing stubbed, and it keeps what it was asked to draw so the
// tests can read the scene graph the way the screen would show it.
const gpu = vi.hoisted(() => ({ camera: null as PerspectiveCamera | null, scene: null as Scene | null }));
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize() {}
    render(scene: Scene, camera: PerspectiveCamera) {
      gpu.scene = scene;
      gpu.camera = camera;
    }
    dispose() {}
  }
  return { ...actual, WebGLRenderer };
});

/** A binary STL with one triangle. */
function stlBytes(): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + 50);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true);
  const floats = [0, 0, 1, 0, 0, 0, 0.2, 0, 0, 0, 0.2, 0];
  floats.forEach((value, index) => {
    view.setFloat32(84 + index * 4, value, true);
  });
  return buffer;
}

const ARM = `<robot name="arm">
  <link name="base_link"><visual><geometry><mesh filename="package://arm/meshes/base.stl"/></geometry></visual></link>
  <link name="upper"><visual><geometry><mesh filename="package://arm/meshes/base.stl"/></geometry></visual></link>
  <link name="finger_l"/>
  <link name="finger_r"/>
  <link name="tool"/>
  <joint name="shoulder" type="revolute"><parent link="base_link"/><child link="upper"/><origin xyz="0 0 0.3"/><axis xyz="0 0 1"/><limit lower="-3" upper="3" effort="1" velocity="1"/></joint>
  <joint name="finger" type="prismatic"><parent link="upper"/><child link="finger_l"/><axis xyz="1 0 0"/><limit lower="0" upper="0.05" effort="1" velocity="1"/></joint>
  <joint name="finger_mirror" type="prismatic"><parent link="upper"/><child link="finger_r"/><axis xyz="1 0 0"/><limit lower="0" upper="0.05" effort="1" velocity="1"/><mimic joint="finger"/></joint>
  <joint name="wrist" type="fixed"><parent link="upper"/><child link="tool"/><origin xyz="0 0 0.4"/></joint>
</robot>`;

const TWO_LINKS = `<robot name="stub">
  <link name="base_link"><visual><geometry><mesh filename="package://arm/meshes/base.stl"/></geometry></visual></link>
  <link name="tip"/>
  <joint name="only" type="revolute"><parent link="base_link"/><child link="tip"/><axis xyz="0 0 1"/><limit lower="-1" upper="1" effort="1" velocity="1"/></joint>
</robot>`;

function modelSource(urdf: () => string | null | Promise<string | null>): RobotModelSource {
  return {
    asset: async (uri) => (uri.endsWith("missing.stl") ? null : stlBytes()),
    load: async () => urdf(),
  };
}

type SceneProps = Partial<Parameters<typeof RobotScene>[0]>;

function mountScene(props: SceneProps = {}, host?: HTMLElement) {
  const reports: SceneStatus[] = [];
  const source = props.robotModel ?? modelSource(() => ARM);
  const base = {
    eeLink: "tool",
    fitRequest: 0,
    frameAxes: false,
    onStatus: (status: SceneStatus) => reports.push(status),
    robotModel: source,
    showAxes: false,
  };
  const view = render(<RobotScene {...base} {...props} robotModel={source} />, {
    container: host ? host.appendChild(document.createElement("div")) : undefined,
  });
  return {
    ...view,
    last: () => reports.at(-1) as SceneStatus,
    reports,
    update: (next: SceneProps) => view.rerender(<RobotScene {...base} {...props} {...next} robotModel={source} />),
  };
}

/** Lets the model load, its meshes parse and the next frame draw. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(40));

function robotRoot(): Group {
  const root = gpu.scene?.children.find((child) => child instanceof Group && child.rotation.x === -Math.PI / 2);
  if (!root) {
    throw new Error("the stage has not been drawn");
  }
  return root as Group;
}

/** The drawn robot and its translucent twin, in that order. */
function robots(): [URDFRobot, URDFRobot] {
  const found = robotRoot().children.filter((child) => (child as { isURDFRobot?: boolean }).isURDFRobot);
  return found as [URDFRobot, URDFRobot];
}

function commandIndicator(): Group {
  const root = robotRoot().children.find(
    (child) =>
      child instanceof Group && child.children.some((m) => m instanceof Mesh && m.geometry.type === "ConeGeometry"),
  );
  if (!root) {
    throw new Error("no command indicator on the stage");
  }
  return root as Group;
}

function gridOf(scene: Scene): GridHelper {
  return scene.children.find((child) => child instanceof GridHelper) as GridHelper;
}

function meshMaterials(object: Object3D): MeshStandardMaterial[] {
  const materials: MeshStandardMaterial[] = [];
  object.traverse((child) => {
    if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
      materials.push(child.material);
    }
  });
  return materials;
}

const axesOn = (link: Object3D) => link.children.filter((child) => child instanceof AxesHelper).length;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });
  gpu.scene = null;
  gpu.camera = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the 3D stage", () => {
  it("draws the robot the API serves and reports its links and meshes once every mesh has settled", async () => {
    const view = mountScene();
    await settle();
    expect(view.last()).toMatchObject({ links: 5, meshes: 2, model: "ready", meshError: undefined });
    const [robot, ghost] = robots();
    expect(robot.visible).toBe(true);
    expect(ghost.visible).toBe(false);
    // The twin is see-through in the command colour; the robot itself is opaque in the theme's sage.
    expect(meshMaterials(ghost).every((material) => material.transparent && material.opacity === 0.35)).toBe(true);
    expect(meshMaterials(robot).every((material) => !material.transparent)).toBe(true);
    expect(view.container.querySelector("canvas")).not.toBeNull();
  });

  it("names the first mesh it could not fetch while still drawing the rest", async () => {
    const urdf = ARM.replace(
      '<link name="tool"/>',
      '<link name="tool"><visual><geometry><mesh filename="package://arm/meshes/missing.stl"/></geometry></visual></link>',
    );
    const view = mountScene({ robotModel: modelSource(() => urdf) });
    await settle();
    expect(view.last()).toMatchObject({
      meshes: 2,
      meshError: "no mesh at package://arm/meshes/missing.stl",
      model: "ready",
    });
  });

  it("drives the joints from a joint state, leaves a mimic to its master, and redraws only on movement", async () => {
    const view = mountScene({
      jointState: { name: ["shoulder", "finger", "finger_mirror", "unknown"], position: [0.5, 0.02, 0.9, 1] },
    });
    await settle();
    const [robot] = robots();
    expect(robot.joints.shoulder?.angle).toBeCloseTo(0.5);
    expect(robot.joints.finger?.angle).toBeCloseTo(0.02);
    // The mirror follows the finger, whatever the state claimed for it.
    expect(robot.joints.finger_mirror?.angle).toBeCloseTo(0.02);
    expect(view.last().joints).toEqual({ driven: 2, total: 2 });
    expect(view.last().updates).toBe(1);

    // The same state again, as a still robot publishes it, moves nothing.
    view.update({ jointState: { name: ["shoulder", "finger"], position: [0.5, 0.02] } });
    await settle();
    expect(view.last().updates).toBe(1);

    view.update({ jointState: { name: ["shoulder"], position: [-1] } });
    await settle();
    expect(robot.joints.shoulder?.angle).toBeCloseTo(-1);
    expect(view.last().joints).toEqual({ driven: 1, total: 2 });
  });

  it("reports the count once a second, not on every sample", async () => {
    const view = mountScene({ jointState: { name: ["shoulder"], position: [0] } });
    await settle();
    const before = view.reports.length;
    for (let step = 1; step < 29; step += 1) {
      view.update({ jointState: { name: ["shoulder"], position: [step * 0.01] } });
    }
    expect(view.reports.length).toBe(before);
    view.update({ jointState: { name: ["shoulder"], position: [0.31] } });
    expect(view.reports.length).toBe(before + 1);
    expect(view.last().updates).toBe(30);
  });

  it("says the model is unavailable, asks again, and draws the robot once a description appears", async () => {
    let urdf: string | null = null;
    const view = mountScene({ robotModel: modelSource(() => urdf) });
    await settle();
    expect(view.last().model).toBe("unavailable");
    expect(view.last().links).toBe(0);
    urdf = ARM;
    await act(() => vi.advanceTimersByTimeAsync(MODEL_RETRY_MS - 100));
    expect(view.last().model).toBe("unavailable");
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(view.last()).toMatchObject({ links: 5, model: "ready" });
  });

  it("treats a failing description request as no robot", async () => {
    const view = mountScene({ robotModel: modelSource(() => Promise.reject(new Error("503"))) });
    await settle();
    expect(view.last().model).toBe("unavailable");
  });

  it("swaps the robot when the API starts serving a different description, and drops it when it stops", async () => {
    let urdf: string | null = ARM;
    const view = mountScene({
      jointState: { name: ["shoulder"], position: [0.3] },
      robotModel: modelSource(() => urdf),
    });
    await settle();
    expect(view.last().links).toBe(5);
    urdf = TWO_LINKS;
    await act(() => vi.advanceTimersByTimeAsync(MODEL_REFRESH_MS + 100));
    expect(view.last()).toMatchObject({ links: 2, model: "ready" });
    // The joint state is applied to the new robot, which only knows one of its joints.
    expect(view.last().joints).toEqual({ driven: 0, total: 1 });
    expect(robots()[0].robotName).toBe("stub");
    urdf = null;
    await act(() => vi.advanceTimersByTimeAsync(MODEL_REFRESH_MS + 100));
    expect(view.last()).toMatchObject({ links: 0, model: "unavailable" });
    expect(robotRoot().children.some((child) => (child as { isURDFRobot?: boolean }).isURDFRobot)).toBe(false);
  });

  it("shows a joint target as the translucent twin, and hides it on an empty JointState", async () => {
    const view = mountScene({ target: { name: ["shoulder", "finger_mirror"], position: [1.2, 0.04] } });
    await settle();
    const [robot, ghost] = robots();
    expect(view.last().target).toBe(true);
    expect(ghost.visible).toBe(true);
    expect(ghost.joints.shoulder?.angle).toBeCloseTo(1.2);
    // A target naming only a mimic drives nothing; the robot itself is untouched by the target.
    expect(ghost.joints.finger_mirror?.angle).toBe(0);
    expect(robot.joints.shoulder?.angle).toBe(0);

    view.update({ target: { name: [], position: [] } });
    await settle();
    expect(view.last().target).toBe(false);
    expect(ghost.visible).toBe(false);
  });

  it("draws a pose triad in the frame it names, on the base for an unknown frame, and hides it when the pose goes", async () => {
    const view = mountScene({
      pose: { header: { frame_id: "/upper" }, pose: { position: { x: 0.1, y: 0, z: 0.2 }, orientation: { w: 1 } } },
    });
    await settle();
    const [robot] = robots();
    const triad = robot.links.upper?.children.find((child) => child instanceof AxesHelper) as AxesHelper;
    expect(view.last().pose).toBe(true);
    expect(triad.visible).toBe(true);
    expect(triad.position.toArray()).toEqual([0.1, 0, 0.2]);

    view.update({
      pose: {
        header: { frame_id: "map" },
        pose: { position: { x: 1, y: 1, z: 1 }, orientation: { x: 0, y: 0, z: 0, w: 0 } },
      },
    });
    await settle();
    expect(triad.parent).toBe(robotRoot());
    // A zero quaternion is not an orientation; the triad stays upright rather than vanishing.
    expect(triad.quaternion.toArray()).toEqual([0, 0, 0, 1]);

    view.update({ pose: undefined });
    await settle();
    expect(view.last().pose).toBe(false);
    expect(triad.visible).toBe(false);
  });

  it("draws the shared-control goals and soft goal, and says how many goals the manager would ignore", async () => {
    const at = (x: number) => ({ position: { x, y: 0, z: 0.3 }, orientation: { w: 1 } });
    const view = mountScene({
      goals: { header: { frame_id: "base_link" }, poses: [at(0.1), at(0.2)] },
      softGoal: { header: { frame_id: "" }, pose: at(0.15) },
    });
    await settle();
    expect(view.last()).toMatchObject({ goals: 2, goalsIgnored: 0, softGoal: true });
    expect(robotRoot().getObjectByName("goal_1")?.position.x).toBeCloseTo(0.2);

    view.update({ goals: { header: { frame_id: "camera_link" }, poses: [at(0.1)] }, softGoal: undefined });
    await settle();
    expect(view.last()).toMatchObject({ goals: 0, goalsIgnored: 1, softGoal: false });
    expect(robotRoot().getObjectByName("goal_0")).toBeUndefined();
  });

  it("keeps a marker for its lifetime, attaches it to the link its frame names, and honours deletes", async () => {
    const marker = (overrides: Record<string, unknown>) => ({
      action: 0,
      color: { r: 1, g: 0, b: 0, a: 1 },
      header: { frame_id: "upper" },
      id: 1,
      ns: "goals",
      pose: { position: { x: 0, y: 0, z: 0.1 }, orientation: { w: 1 } },
      scale: { x: 0.05, y: 0.05, z: 0.05 },
      type: 2,
      ...overrides,
    });
    const view = mountScene({ markers: [marker({ lifetime: { sec: 1, nanosec: 0 } })] });
    await settle();
    const [robot] = robots();
    expect(view.last()).toMatchObject({ markers: 1, unplaced: 0 });
    expect(robot.links.upper?.children.some((child) => child.userData.bloomMarker === true)).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(view.last().markers).toBe(0);
    expect(robot.links.upper?.children.some((child) => child.userData.bloomMarker === true)).toBe(false);

    // A frame the robot does not know is drawn on the base and counted as unplaced, until a delete removes it.
    view.update({ markers: [marker({ header: { frame_id: "camera_optical" }, id: 2 })] });
    await settle();
    expect(view.last()).toMatchObject({ markers: 1, unplaced: 1 });
    view.update({ markers: [marker({ action: 2, id: 2 })] });
    await settle();
    expect(view.last()).toMatchObject({ markers: 0, unplaced: 0 });
  });

  it("draws the commanded motion from the tool, an arc for a rotation in the effector frame, and nothing at rest", async () => {
    const view = mountScene({ command: { angular: { x: 0, y: 0, z: 0 }, linear: { x: 0, y: 0, z: 1 } } });
    await settle();
    const indicator = commandIndicator();
    expect(indicator.visible).toBe(true);
    const arrow = indicator.children[0] as Group;
    expect(arrow.visible).toBe(true);
    // The tool sits 0.7 m up the base's Z: the arrow starts there.
    expect(arrow.position.z).toBeCloseTo(0.7);
    expect(indicator.children.filter((child) => child.type === "Line")).toHaveLength(0);

    view.update({
      command: { angular: { x: 0, y: 0, z: 0.5 }, linear: { x: 0, y: 0, z: 0 }, frameId: "effector_frame" },
    });
    await settle();
    expect(arrow.visible).toBe(false);
    expect(indicator.children.filter((child) => child.type === "Line")).toHaveLength(1);

    view.update({ command: undefined });
    await settle();
    expect(indicator.visible).toBe(false);
  });

  it("puts a triad on the tool and on every link when asked, and takes them away again", async () => {
    const view = mountScene({ showAxes: true });
    await settle();
    const [robot] = robots();
    const tool = robot.links.tool as Object3D;
    expect(axesOn(tool)).toBe(1);
    expect(axesOn(robot.links.upper as Object3D)).toBe(0);

    view.update({ frameAxes: true, showAxes: true });
    await settle();
    expect(axesOn(tool)).toBe(1);
    expect(Object.values(robot.links).every((link) => axesOn(link) === 1)).toBe(true);

    view.update({ frameAxes: false, showAxes: false });
    await settle();
    expect(Object.values(robot.links).every((link) => axesOn(link) === 0)).toBe(true);
  });

  it("follows the theme: a new palette recolours the robot, its twin and the grid without a reload", async () => {
    const themed = document.createElement("div");
    themed.setAttribute("data-bloom-theme", "bloom");
    themed.style.setProperty("--bloom-color-sage", "#7e967e");
    themed.style.setProperty("--bloom-color-command", "#3b6fd1");
    document.body.append(themed);
    mountScene({}, themed);
    await settle();
    const scene = gpu.scene as Scene;
    const firstGrid = gridOf(scene);
    const [robot, ghost] = robots();
    expect(meshMaterials(robot)[0]?.color.getHexString()).toBe("7e967e");

    // The same palette under a new theme name changes nothing.
    themed.setAttribute("data-bloom-theme", "still-bloom");
    await settle();
    expect(gridOf(scene)).toBe(firstGrid);

    themed.style.setProperty("--bloom-color-sage", "#112233");
    themed.style.setProperty("--bloom-color-command", "#445566");
    themed.setAttribute("data-bloom-theme", "night");
    await settle();
    expect(gridOf(scene)).not.toBe(firstGrid);
    expect(meshMaterials(robot).every((material) => material.color.getHexString() === "112233")).toBe(true);
    expect(meshMaterials(ghost).every((material) => material.color.getHexString() === "445566")).toBe(true);
    themed.remove();
  });

  it("frames the robot on request and on a double-click, from the front-right and above", async () => {
    const view = mountScene();
    await settle();
    const camera = gpu.camera as PerspectiveCamera;
    const fitted = camera.position.clone();
    expect(fitted.x).toBeGreaterThan(0);
    expect(fitted.y).toBeGreaterThan(0);
    expect(fitted.z).toBeGreaterThan(0);
    expect(camera.near).toBeGreaterThan(0);

    camera.position.set(9, 9, 9);
    view.update({ fitRequest: 1 });
    await settle();
    expect(camera.position.distanceTo(fitted)).toBeLessThan(1e-6);

    camera.position.set(-5, 0, 0);
    view.container.querySelector("canvas")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await settle();
    expect(camera.position.distanceTo(fitted)).toBeLessThan(1e-6);
  });

  it("fits the view to its container and asks a lost WebGL context to come back", async () => {
    const observers: Array<() => void> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    const host = document.createElement("div");
    document.body.append(host);
    const view = mountScene({}, host);
    await settle();
    const camera = gpu.camera as PerspectiveCamera;
    const container = view.container.querySelector(".bloom-robot-3d-canvas") as HTMLElement;
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 500 });
    act(() => {
      for (const observer of observers) observer();
    });
    expect(camera.aspect).toBeCloseTo(1.6);

    const canvas = view.container.querySelector("canvas") as HTMLCanvasElement;
    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    host.remove();
  });

  it("stops reporting and takes the canvas down when it unmounts", async () => {
    const view = mountScene({
      markers: [{ action: 0, id: 1, ns: "n", type: 2, lifetime: { sec: 1 }, scale: { x: 0.1, y: 0.1, z: 0.1 } }],
    });
    await settle();
    const container = view.container.querySelector(".bloom-robot-3d-canvas") as HTMLElement;
    expect(container.querySelector("canvas")).not.toBeNull();
    const reported = view.reports.length;
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(MODEL_REFRESH_MS + 2000));
    expect(view.reports.length).toBe(reported);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("frames the robot's meshes, not the hidden command arrow, and stays put when there is nothing to frame", async () => {
    // The arm's two small meshes reach 0.3 m up; the hidden arrow at the base would reach a metre.
    const view = mountScene();
    await settle();
    const camera = gpu.camera as PerspectiveCamera;
    expect(camera.position.y).toBeLessThan(0.9);
    view.unmount();

    const bare = ARM.replace(/<visual>.*?<\/visual>/g, "");
    const empty = mountScene({ robotModel: modelSource(() => bare) });
    await settle();
    expect(empty.last()).toMatchObject({ meshes: 0, model: "ready" });
    const parked = new Vector3(1.4, 1.0, 1.4);
    expect((gpu.camera as PerspectiveCamera).position.distanceTo(parked)).toBeLessThan(1e-6);
    empty.update({ fitRequest: 2 });
    await settle();
    expect((gpu.camera as PerspectiveCamera).position.distanceTo(parked)).toBeLessThan(1e-6);
  });
});
