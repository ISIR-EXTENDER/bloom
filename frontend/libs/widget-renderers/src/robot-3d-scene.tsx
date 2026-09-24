import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  AxesHelper,
  Box3,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { URDFRobot } from "urdf-loader";
import { COMMAND_COLOR, CommandIndicator, commandPose } from "./robot-3d-command";
import {
  asRecord,
  disposeObject,
  isMarkerObject,
  type MarkerSample,
  MarkerStore,
  numberOf,
  vector,
} from "./robot-3d-markers";
import { createMeshCache, fitDistance, parseRobot, resolveRobotFrame, resolveToolLink } from "./robot-3d-model";
import type { CommandedTwist, RobotModelSource } from "./types";

export type JointStateSample = { name?: unknown; position?: unknown };
export type PoseSample = { header?: unknown; pose?: unknown };
export type { MarkerSample } from "./robot-3d-markers";

type RobotSceneProps = {
  /** The twist being sent, to draw where the hand is being asked to go. */
  command?: CommandedTwist;
  eeLink: string;
  /** Counts up when the person asks to frame the robot again. */
  fitRequest: number;
  /** An axes triad on every link, the way rviz's TF display shows frames. */
  frameAxes: boolean;
  jointState?: JointStateSample;
  markers?: readonly MarkerSample[];
  onStatus: (status: SceneStatus) => void;
  /** A PoseStamped drawn as a triad in its frame. */
  pose?: PoseSample;
  robotModel: RobotModelSource;
  showAxes: boolean;
  /** A JointState drawn as a translucent copy of the robot: where a target is sending it. */
  target?: JointStateSample;
};

export type SceneStatus = {
  /** Joints the newest joint state drives, of those the URDF declares. */
  joints: { driven: number; total: number };
  links: number;
  /** Mesh markers whose file has not arrived yet. */
  loading: number;
  markers: number;
  meshes: number;
  meshError?: string;
  model: "loading" | "ready" | "unavailable";
  /** Whether a pose is drawn right now. */
  pose: boolean;
  /** Whether a joint target is drawn right now. */
  target: boolean;
  /** Markers whose frame the robot does not know, drawn in the base frame instead. */
  unplaced: number;
  /** Joint states that moved the model, as of the last report. */
  updates: number;
};

/** Without a description the view asks again this often; with one, it checks for a new robot this often. */
export const MODEL_RETRY_MS = 3000;
export const MODEL_REFRESH_MS = 10000;
/** A joint that moved less than this since the last draw has not moved. */
const JOINT_EPSILON = 1e-5;
/** The manager's name for the tool frame; the widget's own tool link counts as well. */
const EFFECTOR_FRAME_ID = "effector_frame";

type Stage = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  /** The translucent copy of the robot a joint target is drawn on. */
  ghost: () => URDFRobot | null;
  indicator: CommandIndicator;
  invalidate: () => void;
  poseAxes: AxesHelper;
  refit: () => void;
  report: () => void;
  robotRoot: Group;
  /** What the effects learned since the last report. */
  shown: { joints: SceneStatus["joints"]; pose: boolean; target: boolean; updates: number };
  store: MarkerStore;
};

/** The running robot in three.js: its URDF from the API, its meshes by package, its joints from ROS. */
export default function RobotScene({
  command,
  eeLink,
  fitRequest,
  frameAxes,
  jointState,
  markers,
  onStatus,
  pose,
  robotModel,
  showAxes,
  target,
}: RobotSceneProps) {
  const mount = useRef<HTMLDivElement>(null);
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  const stage = useRef<Stage | null>(null);
  const appliedJoints = useRef<Record<string, number>>({});
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
    const poseAxes = new AxesHelper(0.1);
    poseAxes.visible = false;
    robotRoot.add(poseAxes);

    let disposed = false;
    let frame = 0;
    let current: URDFRobot | null = null;
    let ghost: URDFRobot | null = null;
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
    const shown = { joints: { driven: 0, total: 0 }, pose: false, target: false, updates: 0 };
    const report = () => {
      if (disposed) {
        return;
      }
      const drawn = store.report();
      onStatusRef.current({
        joints: shown.joints,
        links: current ? Object.keys(current.links).length : 0,
        loading: drawn.loading,
        markers: drawn.count,
        meshes: meshes.count,
        meshError: meshes.firstError,
        model,
        pose: shown.pose,
        target: shown.target,
        unplaced: drawn.unplaced,
        updates: shown.updates,
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
    stage.current = {
      camera,
      controls,
      ghost: () => ghost,
      indicator,
      invalidate,
      poseAxes,
      refit,
      report,
      robotRoot,
      shown,
      store,
    };
    invalidate();

    const unmountRobot = () => {
      if (!current) {
        return;
      }
      appliedJoints.current = {};
      store.clear();
      current.removeFromParent();
      disposeObject(current);
      current = null;
      ghost?.removeFromParent();
      if (ghost) {
        disposeObject(ghost);
      }
      ghost = null;
      currentUrdf = null;
      meshes = { count: 0 };
      shown.joints = { driven: 0, total: 0 };
      shown.target = false;
      setRobot(null);
    };
    const mountRobot = async (urdf: string) => {
      unmountRobot();
      const parsed = parseRobot(urdf, cache);
      current = parsed.robot;
      currentUrdf = urdf;
      robotRoot.add(parsed.robot);
      // The same robot once more, see-through, for wherever a joint target is sending it.
      const twin = parseRobot(urdf, cache);
      ghost = twin.robot;
      ghost.visible = false;
      robotRoot.add(ghost);
      setRobot(parsed.robot);
      invalidate();
      const settled = await parsed.meshes;
      await twin.meshes;
      if (disposed || current !== parsed.robot) {
        return;
      }
      ghost.traverse((child) => {
        if (child instanceof Mesh) {
          child.material = new MeshStandardMaterial({
            color: COMMAND_COLOR,
            depthWrite: false,
            opacity: 0.35,
            transparent: true,
          });
        }
      });
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
    let changed = false;
    names.forEach((name, index) => {
      const position = positions[index];
      if (typeof name === "string" && typeof position === "number" && Number.isFinite(position) && robot.joints[name]) {
        values[name] = position;
        const previous = appliedJoints.current[name];
        changed ||= previous === undefined || Math.abs(previous - position) > JOINT_EPSILON;
      }
    });
    const driven = Object.keys(values).length;
    const total = Object.values(robot.joints).filter((joint) => joint.jointType !== "fixed").length;
    if (driven !== live.shown.joints.driven || total !== live.shown.joints.total) {
      live.shown.joints = { driven, total };
      live.report();
    }
    // A still robot publishes the same state thirty times a second; nothing to redraw.
    if (!changed) {
      return;
    }
    appliedJoints.current = values;
    robot.setJointValues(values);
    live.shown.updates += 1;
    // The first move and then about once a second: enough for the status, not a report per sample.
    if (live.shown.updates === 1 || live.shown.updates % 30 === 0) {
      live.report();
    }
    live.invalidate();
  }, [robot, jointState]);

  // A joint target: the translucent twin at the target configuration, gone on an empty JointState.
  useEffect(() => {
    const live = stage.current;
    const ghost = live?.ghost();
    if (!robot || !live || !ghost) {
      return;
    }
    const names = Array.isArray(target?.name) ? target.name : [];
    const positions = Array.isArray(target?.position) ? target.position : [];
    const values: Record<string, number> = {};
    names.forEach((name, index) => {
      const position = positions[index];
      if (typeof name === "string" && typeof position === "number" && Number.isFinite(position) && ghost.joints[name]) {
        values[name] = position;
      }
    });
    const visible = Object.keys(values).length > 0;
    if (visible) {
      ghost.setJointValues(values);
    }
    ghost.visible = visible;
    live.shown.target = visible;
    live.invalidate();
    live.report();
  }, [robot, target]);

  // A pose: a triad where a PoseStamped says, in the frame it names.
  useEffect(() => {
    const live = stage.current;
    if (!robot || !live) {
      return;
    }
    const axes = live.poseAxes;
    const body = asRecord(pose?.pose);
    const position = pose ? vector(body.position, 0) : null;
    if (!position) {
      axes.visible = false;
    } else {
      const frameId = String(asRecord(pose?.header).frame_id ?? "").replace(/^\//, "");
      const parent = (frameId && resolveRobotFrame(robot, frameId)) || live.robotRoot;
      if (axes.parent !== parent) {
        parent.add(axes);
      }
      const orientation = asRecord(body.orientation);
      const quaternion = new Quaternion(
        numberOf(orientation.x),
        numberOf(orientation.y),
        numberOf(orientation.z),
        numberOf(orientation.w),
      );
      axes.position.copy(position);
      axes.quaternion.copy(quaternion.lengthSq() > 0 ? quaternion.normalize() : new Quaternion());
      axes.visible = true;
    }
    if (live.shown.pose !== axes.visible) {
      live.shown.pose = axes.visible;
      live.report();
    }
    live.invalidate();
  }, [robot, pose]);

  // Frame the robot again on request.
  useEffect(() => {
    if (fitRequest > 0) {
      stage.current?.refit();
    }
  }, [fitRequest]);

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
  // From the front-right and a little above, as close as the whole robot fits in this view.
  const direction = new Vector3(0.8, 0.55, 0.8).normalize();
  camera.position.copy(center).addScaledVector(direction, fitDistance(box, direction, camera.fov, camera.aspect));
  camera.near = size / 100;
  camera.far = size * 20;
  camera.updateProjectionMatrix();
  controls.update();
}
