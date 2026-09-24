import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  ArrowHelper,
  AxesHelper,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import URDFLoader, { type URDFRobot } from "urdf-loader";
import type { RobotModelSource } from "./types";

export type JointStateSample = { name?: unknown; position?: unknown };
export type MarkerSample = Record<string, unknown>;

type RobotSceneProps = {
  eeLink: string;
  jointState?: JointStateSample;
  markers?: readonly MarkerSample[];
  onStatus: (status: SceneStatus) => void;
  robotModel: RobotModelSource;
  showAxes: boolean;
};

export type SceneStatus = {
  links: number;
  markers: number;
  meshes: number;
  meshError?: string;
  model: "loading" | "ready" | "unavailable";
};

const ROBOT_COLOR = new Color("#7e967e");
const MARKER_ACTION_DELETE = 2;
const MARKER_ACTION_DELETE_ALL = 3;

/** The running robot in three.js: its URDF from the API, its meshes by package, its joints from ROS. */
export default function RobotScene({ eeLink, jointState, markers, onStatus, robotModel, showAxes }: RobotSceneProps) {
  const mount = useRef<HTMLDivElement>(null);
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  const markerGroup = useRef(new Group());
  const markerObjects = useRef(new Map<string, Object3D>());
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const meshReport = useRef<{ meshes: number; meshError?: string }>({ meshes: 0 });

  // The stage: renderer, camera, lights, grid, and the robot once it is parsed.
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
    scene.add(markerGroup.current);

    let disposed = false;
    let frame = 0;
    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(container);
    resize();
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    loadRobot(robotModel)
      .then((loaded) => {
        if (disposed || !loaded) {
          if (!disposed) {
            onStatusRef.current({ model: "unavailable", links: 0, markers: 0, meshes: 0 });
          }
          return;
        }
        // ROS is Z-up, three.js is Y-up.
        loaded.robot.rotation.x = -Math.PI / 2;
        scene.add(loaded.robot);
        loaded.robot.add(markerGroup.current);
        loaded.meshes.settled.then(() => {
          if (disposed) {
            return;
          }
          fitCamera(loaded.robot, camera, controls);
          setRobot(loaded.robot);
          meshReport.current = { meshes: loaded.meshes.count(), meshError: loaded.meshes.firstError() };
          onStatusRef.current({
            model: "ready",
            links: Object.keys(loaded.robot.links).length,
            markers: 0,
            ...meshReport.current,
          });
        });
      })
      .catch(() => {
        if (!disposed) {
          onStatusRef.current({ model: "unavailable", links: 0, markers: 0, meshes: 0 });
        }
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [robotModel]);

  // Frames on the tool: an axes triad on the named link, or on the last link the URDF declares.
  useEffect(() => {
    if (!robot || !showAxes) {
      return;
    }
    const links = Object.keys(robot.links);
    const target = robot.links[eeLink] ?? robot.links[links.at(-1) ?? ""];
    if (!target) {
      return;
    }
    const axes = new AxesHelper(0.12);
    target.add(axes);
    return () => {
      target.remove(axes);
    };
  }, [robot, eeLink, showAxes]);

  // Joint states drive the model; a name the URDF does not know is ignored.
  useEffect(() => {
    if (!robot || !jointState) {
      return;
    }
    const names = Array.isArray(jointState.name) ? jointState.name : [];
    const positions = Array.isArray(jointState.position) ? jointState.position : [];
    const values: Record<string, number> = {};
    names.forEach((name, index) => {
      const position = positions[index];
      if (typeof name === "string" && typeof position === "number" && robot.joints[name]) {
        values[name] = position;
      }
    });
    robot.setJointValues(values);
  }, [robot, jointState]);

  // Markers, as rviz reads them: by namespace and id, in the frame they name when it is a link.
  useEffect(() => {
    if (!robot || !markers) {
      return;
    }
    for (const marker of markers) {
      applyMarker(robot, markerGroup.current, markerObjects.current, marker);
    }
    onStatusRef.current({
      model: "ready",
      links: Object.keys(robot.links).length,
      markers: markerObjects.current.size,
      ...meshReport.current,
    });
  }, [robot, markers]);

  return <div className="bloom-robot-3d-canvas" ref={mount} />;
}

type MeshReport = { count: () => number; firstError: () => string | undefined; settled: Promise<void> };

async function loadRobot(robotModel: RobotModelSource): Promise<{ meshes: MeshReport; robot: URDFRobot } | null> {
  const urdf = await robotModel.load();
  if (!urdf) {
    return null;
  }
  const pending: Promise<void>[] = [];
  let drawn = 0;
  let firstError: string | undefined;
  const loader = new URDFLoader(new LoadingManager());
  loader.packages = (targetPackage) => `package://${targetPackage}`;
  loader.loadMeshCb = (path, _manager, _material, done) => {
    const task = robotModel
      .asset(path)
      .then((bytes) => (bytes ? parseMesh(path, bytes) : null))
      .then((object) => {
        if (object) {
          object.traverse((child) => {
            if (child instanceof Mesh) {
              child.material = new MeshStandardMaterial({ color: ROBOT_COLOR, metalness: 0.05, roughness: 0.85 });
            }
          });
          drawn += 1;
          done(object);
        } else {
          firstError ??= `no mesh at ${path}`;
          done(new Group(), new Error(firstError));
        }
      })
      .catch((error: Error) => {
        firstError ??= `${path}: ${error.message}`;
        done(new Group(), error);
      });
    pending.push(task);
  };
  const robot = loader.parse(urdf);
  // Every mesh callback has been issued by the time parse returns; settle them all before fitting the camera.
  const settled = Promise.all(pending).then(() => undefined);
  return { meshes: { count: () => drawn, firstError: () => firstError, settled }, robot };
}

function parseMesh(path: string, bytes: ArrayBuffer): Object3D | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".stl")) {
    return new Mesh(new STLLoader().parse(bytes));
  }
  if (lower.endsWith(".dae")) {
    const text = new TextDecoder().decode(bytes);
    const collada = new ColladaLoader().parse(text, "") as { scene?: Object3D | null } | null;
    const scene = collada?.scene ?? null;
    if (scene) {
      // A DAE export carries its own lights and cameras; fifteen of them stacked wash the arm to white.
      const strays: Object3D[] = [];
      scene.traverse((child) => {
        const object = child as Object3D & { isCamera?: boolean; isLight?: boolean };
        if (object.isLight || object.isCamera) {
          strays.push(child);
        }
      });
      for (const stray of strays) {
        stray.removeFromParent();
      }
    }
    return scene;
  }
  return null;
}

/** Frames what is drawn: the meshes, not the empty links a URDF may declare metres away. */
function fitCamera(robot: Object3D, camera: PerspectiveCamera, controls: OrbitControls) {
  robot.updateMatrixWorld(true);
  const box = new Box3();
  robot.traverse((child) => {
    if (child instanceof Mesh) {
      box.expandByObject(child);
    }
  });
  if (box.isEmpty()) {
    return;
  }
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3()).length();
  controls.target.copy(center);
  camera.position.copy(center).add(new Vector3(size * 0.8, size * 0.55, size * 0.8));
  camera.near = size / 100;
  camera.far = size * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

function applyMarker(robot: URDFRobot, fallback: Group, objects: Map<string, Object3D>, marker: MarkerSample) {
  const action = numberOf(marker.action);
  if (action === MARKER_ACTION_DELETE_ALL) {
    for (const object of objects.values()) {
      object.removeFromParent();
    }
    objects.clear();
    return;
  }
  const key = `${String(marker.ns ?? "")}/${numberOf(marker.id)}`;
  objects.get(key)?.removeFromParent();
  objects.delete(key);
  if (action === MARKER_ACTION_DELETE) {
    return;
  }
  const object = buildMarker(marker);
  if (!object) {
    return;
  }
  const header = asRecord(marker.header);
  const frameId = typeof header.frame_id === "string" ? header.frame_id.replace(/^\//, "") : "";
  (robot.links[frameId] ?? fallback).add(object);
  objects.set(key, object);
}

function buildMarker(marker: MarkerSample): Object3D | null {
  const type = numberOf(marker.type);
  const scale = vector(marker.scale, 0.05);
  const color = markerColor(marker.color);
  const points = Array.isArray(marker.points) ? marker.points.map((point) => vector(point, 0)) : [];
  let object: Object3D | null = null;
  if (type === 0) {
    object = arrow(points, scale, color.color);
  } else if (type === 1) {
    object = new Mesh(new BoxGeometry(scale.x, scale.y, scale.z), material(color));
  } else if (type === 2) {
    object = new Mesh(new SphereGeometry(scale.x / 2, 24, 16), material(color));
  } else if (type === 3) {
    const cylinder = new Mesh(
      new CylinderGeometry(scale.x / 2, scale.y / 2 || scale.x / 2, scale.z, 24),
      material(color),
    );
    cylinder.rotation.x = Math.PI / 2;
    object = cylinder;
  } else if (type === 4 || type === 5) {
    const geometry = new BufferGeometry().setFromPoints(points);
    const lineMaterial = new LineBasicMaterial({
      color: color.color,
      transparent: color.opacity < 1,
      opacity: color.opacity,
    });
    object = type === 4 ? new Line(geometry, lineMaterial) : new LineSegments(geometry, lineMaterial);
  } else if (type === 6 || type === 7 || type === 8) {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        points.flatMap((point) => [point.x, point.y, point.z]),
        3,
      ),
    );
    object = new Points(geometry, new PointsMaterial({ color: color.color, size: scale.x, sizeAttenuation: true }));
  } else if (type === 9) {
    object = textSprite(String(marker.text ?? ""), scale.z, color.color);
  }
  if (!object) {
    return null;
  }
  const pose = asRecord(marker.pose);
  const position = vector(pose.position, 0);
  const orientation = asRecord(pose.orientation);
  object.position.set(position.x, position.y, position.z);
  object.quaternion.copy(
    new Quaternion(
      numberOf(orientation.x),
      numberOf(orientation.y),
      numberOf(orientation.z),
      numberOf(orientation.w) || 1,
    ),
  );
  return object;
}

function arrow(points: Vector3[], scale: Vector3, color: Color): Object3D {
  const [start, end] = points;
  if (start && end) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    return new ArrowHelper(direction.normalize(), start, length, color, Math.min(length, scale.y * 3), scale.y * 2);
  }
  // Without points the arrow points along the marker's own x axis; scale.x is its length.
  return new ArrowHelper(new Vector3(1, 0, 0), new Vector3(), scale.x, color, scale.x * 0.3, scale.y * 2);
}

function textSprite(text: string, height: number, color: Color): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.font = "bold 40px sans-serif";
    context.fillStyle = `#${color.getHexString()}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 32);
  }
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true }));
  const scale = height || 0.1;
  sprite.scale.set(scale * 4, scale, 1);
  return sprite;
}

function material(color: { color: Color; opacity: number }): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: color.color,
    opacity: color.opacity,
    side: DoubleSide,
    transparent: color.opacity < 1,
  });
}

function markerColor(value: unknown): { color: Color; opacity: number } {
  const record = asRecord(value);
  const color = new Color(numberOf(record.r), numberOf(record.g), numberOf(record.b));
  const opacity = typeof record.a === "number" ? record.a : 1;
  return { color, opacity: opacity > 0 ? opacity : 1 };
}

function vector(value: unknown, fallback: number): Vector3 {
  const record = asRecord(value);
  return new Vector3(
    typeof record.x === "number" ? record.x : fallback,
    typeof record.y === "number" ? record.y : fallback,
    typeof record.z === "number" ? record.z : fallback,
  );
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
