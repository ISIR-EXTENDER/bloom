import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  AxesHelper,
  Box3,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { URDFRobot } from "urdf-loader";
import { CommandIndicator, commandPose } from "./robot-3d-command";
import { disposeObject, isMarkerObject, type MarkerSample, MarkerStore } from "./robot-3d-markers";
import { createMeshCache, parseRobot, resolveRobotFrame, resolveToolLink } from "./robot-3d-model";
import type { CommandedTwist, RobotModelSource } from "./types";

export type JointStateSample = { name?: unknown; position?: unknown };
export type { MarkerSample } from "./robot-3d-markers";

type RobotSceneProps = {
  /** The twist being sent, to draw where the hand is being asked to go. */
  command?: CommandedTwist;
  eeLink: string;
  /** An axes triad on every link, the way rviz's TF display shows frames. */
  frameAxes: boolean;
  jointState?: JointStateSample;
  markers?: readonly MarkerSample[];
  onStatus: (status: SceneStatus) => void;
  robotModel: RobotModelSource;
  showAxes: boolean;
};

export type SceneStatus = {
  links: number;
  /** Mesh markers whose file has not arrived yet. */
  loading: number;
  markers: number;
  meshes: number;
  meshError?: string;
  model: "loading" | "ready" | "unavailable";
  /** Markers whose frame the robot does not know, drawn in the base frame instead. */
  unplaced: number;
};

/** Without a description the view asks again this often; with one, it checks for a new robot this often. */
export const MODEL_RETRY_MS = 3000;
export const MODEL_REFRESH_MS = 10000;
/** The manager's name for the tool frame; the widget's own tool link counts as well. */
const EFFECTOR_FRAME_ID = "effector_frame";

type Stage = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  indicator: CommandIndicator;
  invalidate: () => void;
  report: () => void;
  robotRoot: Group;
  store: MarkerStore;
};

/** The running robot in three.js: its URDF from the API, its meshes by package, its joints from ROS. */
export default function RobotScene({
  command,
  eeLink,
  frameAxes,
  jointState,
  markers,
  onStatus,
  robotModel,
  showAxes,
}: RobotSceneProps) {
  const mount = useRef<HTMLDivElement>(null);
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  const stage = useRef<Stage | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  // The stage: renderer, camera, lights, grid; then the robot, kept current with what the API serves.
  useEffect(() => {
    const container = mount.current;
    if (!container) {
      return;
    }
    const renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.01, 50);
    camera.position.set(1.4, 1.0, 1.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    // Physical light units: enough to shade the sage arm, not enough to clip it to white.
    scene.add(new AmbientLight(0xffffff, 0.45));
    const key = new DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.35);
    fill.position.set(-3, 2, -2);
    scene.add(fill);
    scene.add(new GridHelper(2, 20, 0xb7b1a3, 0xd9d4c7));
    // ROS is Z-up, three.js is Y-up: everything in the base frame lives under this one rotation.
    const robotRoot = new Group();
    robotRoot.rotation.x = -Math.PI / 2;
    scene.add(robotRoot);
    const markerRoot = new Group();
    robotRoot.add(markerRoot);
    const indicator = new CommandIndicator();
    indicator.attach(robotRoot);

    let disposed = false;
    let frame = 0;
    let current: URDFRobot | null = null;
    let currentUrdf: string | null = null;
    let model: SceneStatus["model"] = "loading";
    let meshes: { count: number; firstError?: string } = { count: 0 };
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const render = () => {
      frame = 0;
      renderer.render(scene, camera);
    };
    // On demand, never a loop: a still robot costs nothing.
    const invalidate = () => {
      if (!disposed && !frame) {
        frame = requestAnimationFrame(render);
      }
    };
    const report = () => {
      if (disposed) {
        return;
      }
      const drawn = store.report();
      onStatusRef.current({
        links: current ? Object.keys(current.links).length : 0,
        loading: drawn.loading,
        markers: drawn.count,
        meshes: meshes.count,
        meshError: meshes.firstError,
        model,
        unplaced: drawn.unplaced,
      });
    };
    const cache = createMeshCache(robotModel);
    const store = new MarkerStore(
      { fallback: markerRoot, resolve: (frameId) => (current ? resolveRobotFrame(current, frameId) : null) },
      cache.load,
      () => {
        invalidate();
        report();
      },
    );
    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            resize();
            invalidate();
          });
    observer?.observe(container);
    resize();
    const refit = () => {
      fitCamera(robotRoot, camera, controls);
      invalidate();
    };
    // A lost context (GPU reset, a tab parked for hours) comes back on its own once the default is prevented.
    const onContextLost = (event: Event) => event.preventDefault();
    const canvas = renderer.domElement;
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", invalidate);
    canvas.addEventListener("dblclick", refit);
    controls.addEventListener("change", invalidate);
    stage.current = { camera, controls, indicator, invalidate, report, robotRoot, store };
    invalidate();

    const unmountRobot = () => {
      if (!current) {
        return;
      }
      store.clear();
      current.removeFromParent();
      disposeObject(current);
      current = null;
      currentUrdf = null;
      meshes = { count: 0 };
      setRobot(null);
    };
    const mountRobot = async (urdf: string) => {
      unmountRobot();
      const parsed = parseRobot(urdf, cache);
      current = parsed.robot;
      currentUrdf = urdf;
      robotRoot.add(parsed.robot);
      setRobot(parsed.robot);
      invalidate();
      const settled = await parsed.meshes;
      if (disposed || current !== parsed.robot) {
        return;
      }
      meshes = settled;
      model = "ready";
      refit();
      report();
    };
    const poll = async () => {
      let urdf: string | null = null;
      try {
        urdf = await robotModel.load();
      } catch {
        urdf = null;
      }
      if (disposed) {
        return;
      }
      if (!urdf) {
        // The robot is down or not up yet: nothing to draw, ask again soon.
        unmountRobot();
        model = "unavailable";
        report();
        invalidate();
        pollTimer = setTimeout(poll, MODEL_RETRY_MS);
        return;
      }
      if (urdf !== currentUrdf) {
        await mountRobot(urdf);
      }
      if (!disposed) {
        pollTimer = setTimeout(poll, MODEL_REFRESH_MS);
      }
    };
    void poll();

    return () => {
      disposed = true;
      stage.current = null;
      clearTimeout(pollTimer);
      clearTimeout(expiryTimer);
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", invalidate);
      canvas.removeEventListener("dblclick", refit);
      controls.removeEventListener("change", invalidate);
      observer?.disconnect();
      store.clear();
      indicator.dispose();
      unmountRobot();
      cache.dispose();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [robotModel]);

  // Frames: a triad on the tool, and one on every link when asked, the way rviz's TF display shows them.
  useEffect(() => {
    const live = stage.current;
    if (!robot || !live) {
      return;
    }
    const triads: { axes: AxesHelper; link: Object3D }[] = [];
    const tool = resolveToolLink(robot, eeLink);
    if (showAxes && tool) {
      triads.push({ axes: new AxesHelper(0.12), link: tool });
    }
    if (frameAxes) {
      for (const link of Object.values(robot.links)) {
        if (link !== tool || !showAxes) {
          triads.push({ axes: new AxesHelper(0.06), link });
        }
      }
    }
    for (const triad of triads) {
      triad.link.add(triad.axes);
    }
    live.invalidate();
    return () => {
      for (const triad of triads) {
        triad.link.remove(triad.axes);
        triad.axes.dispose();
      }
      live.invalidate();
    };
  }, [robot, eeLink, showAxes, frameAxes]);

  // The commanded motion, from the tool: an arrow for the linear part, an arc for the angular part.
  useEffect(() => {
    const live = stage.current;
    if (!robot || !live) {
      return;
    }
    const tool = resolveToolLink(robot, eeLink);
    if (!command || !tool) {
      live.indicator.update(null);
      live.invalidate();
      return;
    }
    robot.updateMatrixWorld(true);
    live.robotRoot.updateMatrixWorld(true);
    const position = live.robotRoot.worldToLocal(tool.getWorldPosition(new Vector3()));
    const quaternion = live.robotRoot
      .getWorldQuaternion(new Quaternion())
      .invert()
      .multiply(tool.getWorldQuaternion(new Quaternion()));
    live.indicator.update(commandPose(command, { position, quaternion }, [EFFECTOR_FRAME_ID, eeLink]));
    live.invalidate();
  }, [robot, command, eeLink]);

  // Joint states drive the model; a name the URDF does not know is ignored.
  useEffect(() => {
    const live = stage.current;
    if (!robot || !live || !jointState) {
      return;
    }
    const names = Array.isArray(jointState.name) ? jointState.name : [];
    const positions = Array.isArray(jointState.position) ? jointState.position : [];
    const values: Record<string, number> = {};
    names.forEach((name, index) => {
      const position = positions[index];
      if (typeof name === "string" && typeof position === "number" && Number.isFinite(position) && robot.joints[name]) {
        values[name] = position;
      }
    });
    robot.setJointValues(values);
    live.invalidate();
  }, [robot, jointState]);

  // Markers, as rviz reads them: by namespace and id, in the frame they name, for as long as they say.
  useEffect(() => {
    const live = stage.current;
    if (!robot || !live || !markers) {
      return;
    }
    live.store.apply(markers, Date.now());
    live.invalidate();
    live.report();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const next = live.store.nextExpiry();
      if (next === null) {
        return;
      }
      timer = setTimeout(
        () => {
          if (live.store.expire(Date.now())) {
            live.invalidate();
            live.report();
          }
          arm();
        },
        Math.max(0, next - Date.now()),
      );
    };
    arm();
    return () => clearTimeout(timer);
  }, [robot, markers]);

  return <div className="bloom-robot-3d-canvas" ref={mount} />;
}

/** Frames what is drawn: the meshes, not the empty links a URDF may declare metres away. */
function fitCamera(root: Object3D, camera: PerspectiveCamera, controls: OrbitControls) {
  root.updateMatrixWorld(true);
  const box = new Box3();
  root.traverse((child) => {
    if (child instanceof Mesh && !isMarkerObject(child)) {
      box.expandByObject(child);
    }
  });
  if (box.isEmpty()) {
    return;
  }
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3()).length();
  controls.target.copy(center);
  // Far enough for the bounding sphere at a 45 degree field of view, from the front-right and a little above.
  camera.position.copy(center).add(new Vector3(0.8, 0.55, 0.8).normalize().multiplyScalar(size * 1.3));
  camera.near = size / 100;
  camera.far = size * 20;
  camera.updateProjectionMatrix();
  controls.update();
}
