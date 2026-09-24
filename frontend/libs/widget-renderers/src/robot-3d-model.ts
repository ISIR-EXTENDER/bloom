import { Color, Group, LoadingManager, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import URDFLoader, { type URDFRobot } from "urdf-loader";
import { disposeObject } from "./robot-3d-markers";
import type { RobotModelSource } from "./types";

export const ROBOT_COLOR = new Color("#7e967e");

export type MeshReport = { count: number; firstError?: string };

/** Mesh files by URI, fetched once each; every caller gets its own clone over the shared geometry. */
export type MeshCache = {
  dispose: () => void;
  load: (uri: string) => Promise<Object3D | null>;
};

export function createMeshCache(source: RobotModelSource): MeshCache {
  const loaded = new Map<string, Promise<Object3D | null>>();
  return {
    load: (uri) => {
      let entry = loaded.get(uri);
      if (!entry) {
        entry = source
          .asset(uri)
          .then((bytes) => (bytes ? parseMesh(uri, bytes) : null))
          .catch((error: Error) => {
            throw new Error(`${uri}: ${error.message}`);
          });
        loaded.set(uri, entry);
      }
      return entry.then((object) => (object ? object.clone() : null));
    },
    dispose: () => {
      for (const entry of loaded.values()) {
        void entry.then((object) => object && disposeObject(object)).catch(() => undefined);
      }
      loaded.clear();
    },
  };
}

/** STL, Collada, OBJ and glTF, the formats the API serves; anything else is a mesh the view cannot draw. */
export async function parseMesh(path: string, bytes: ArrayBuffer): Promise<Object3D | null> {
  const lower = path.toLowerCase().replace(/[?#].*$/, "");
  if (lower.endsWith(".stl")) {
    return new Mesh(new STLLoader().parse(bytes));
  }
  if (lower.endsWith(".obj")) {
    return new OBJLoader().parse(new TextDecoder().decode(bytes));
  }
  if (lower.endsWith(".dae")) {
    const collada = new ColladaLoader().parse(new TextDecoder().decode(bytes), "") as {
      scene?: Object3D | null;
    } | null;
    return withoutStrays(collada?.scene ?? null);
  }
  if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().parse(bytes, "", (gltf) => resolve(withoutStrays(gltf.scene)), reject);
    });
  }
  return null;
}

/** A DAE or glTF export carries its own lights and cameras; fifteen of them stacked wash the arm to white. */
function withoutStrays(scene: Object3D | null): Object3D | null {
  if (!scene) {
    return null;
  }
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
  return scene;
}

/**
 * The URDF as a three.js robot, its meshes through the cache. `meshes` settles once every mesh the
 * URDF names has been drawn or failed; the count and the first failure are what the view reports.
 */
export function parseRobot(urdf: string, meshes: MeshCache): { meshes: Promise<MeshReport>; robot: URDFRobot } {
  const pending: Promise<void>[] = [];
  let count = 0;
  let firstError: string | undefined;
  const loader = new URDFLoader(new LoadingManager());
  loader.packages = (targetPackage) => `package://${targetPackage}`;
  loader.loadMeshCb = (path, _manager, _material, done) => {
    pending.push(
      meshes
        .load(path)
        .then((object) => {
          if (!object) {
            firstError ??= `no mesh at ${path}`;
            done(new Group(), new Error(firstError));
            return;
          }
          object.traverse((child) => {
            // The geometry is the cache's; the sage material is this robot's own.
            child.userData.sharedGeometry = true;
            if (child instanceof Mesh) {
              child.material = new MeshStandardMaterial({ color: ROBOT_COLOR, metalness: 0.05, roughness: 0.85 });
            }
          });
          count += 1;
          done(object);
        })
        .catch((error: Error) => {
          firstError ??= error.message;
          done(new Group(), error);
        }),
    );
  };
  const robot = loader.parse(urdf);
  // Every mesh callback has been issued by the time parse returns.
  return { meshes: Promise.all(pending).then(() => ({ count, firstError })), robot };
}

/** The link a marker or an axes triad attaches to: a link first, then any frame the URDF declares. */
export function resolveRobotFrame(robot: URDFRobot, frameId: string): Object3D | null {
  return robot.links[frameId] ?? robot.frames[frameId] ?? null;
}

/** The tool: the named link, or the last link the URDF declares when no name matches. */
export function resolveToolLink(robot: URDFRobot, eeLink: string): Object3D | null {
  const names = Object.keys(robot.links);
  return robot.links[eeLink] ?? robot.links[names.at(-1) ?? ""] ?? null;
}
