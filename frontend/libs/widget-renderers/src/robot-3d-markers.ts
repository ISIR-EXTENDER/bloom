import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";

/** One `visualization_msgs/msg/Marker`, as the runtime socket hands it over: a plain record. */
export type MarkerSample = Record<string, unknown>;

/** Where a marker's frame lives: a link or frame of the robot, or nothing the view knows. */
export type MarkerFrames = {
  fallback: Object3D;
  resolve: (frameId: string) => Object3D | null;
};

/** A `package://` mesh for a MESH_RESOURCE marker, or null when it cannot be had. */
export type MarkerMeshLoader = (uri: string) => Promise<Object3D | null>;

export type MarkerReport = {
  /** Markers currently drawn. */
  count: number;
  /** Mesh markers whose file has not arrived yet. */
  loading: number;
  /** Markers whose frame the robot does not know, drawn in the base frame instead. */
  unplaced: number;
};

const MARKER = {
  ARROW: 0,
  CUBE: 1,
  SPHERE: 2,
  CYLINDER: 3,
  LINE_STRIP: 4,
  LINE_LIST: 5,
  CUBE_LIST: 6,
  SPHERE_LIST: 7,
  POINTS: 8,
  TEXT_VIEW_FACING: 9,
  MESH_RESOURCE: 10,
  TRIANGLE_LIST: 11,
} as const;

const ACTION = { ADD: 0, DELETE: 2, DELETEALL: 3 } as const;

/** rviz's arrow proportions: the head is this share of the length unless the marker says otherwise. */
const ARROW_HEAD_SHARE = 0.23;

type Entry = {
  expiresAt: number | null;
  object: Object3D;
  placed: boolean;
  signature: string;
};

/** A mesh marker's holder carries this until its file is drawn. */
const LOADING = "bloomMarkerLoading";
/** Every marker object carries this, so the camera fit can tell the robot from what is drawn on it. */
export const MARKER_FLAG = "bloomMarker";

export function isMarkerObject(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData[MARKER_FLAG] === true) {
      return true;
    }
  }
  return false;
}

/**
 * Markers the way rviz keeps them: one object per namespace and id, replaced when the marker's shape
 * changes and merely moved when only its pose does, expired by lifetime, deleted by action.
 */
export class MarkerStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly frames: MarkerFrames,
    private readonly loadMesh: MarkerMeshLoader,
    private readonly onChange: () => void,
  ) {}

  apply(markers: readonly MarkerSample[], now: number): void {
    for (const marker of markers) {
      const action = numberOf(marker.action);
      if (action === ACTION.DELETEALL) {
        this.clear();
        continue;
      }
      const key = `${String(marker.ns ?? "")}/${numberOf(marker.id)}`;
      if (action === ACTION.DELETE) {
        this.remove(key);
        continue;
      }
      if (action !== ACTION.ADD) {
        continue;
      }
      const signature = shapeSignature(marker);
      const existing = this.entries.get(key);
      let object: Object3D;
      if (existing && existing.signature === signature) {
        object = existing.object;
      } else {
        this.remove(key);
        const built = this.build(marker);
        if (!built) {
          continue;
        }
        object = built;
        object.userData[MARKER_FLAG] = true;
      }
      const frameId = frameIdOf(marker);
      const frame = frameId ? this.frames.resolve(frameId) : this.frames.fallback;
      const parent = frame ?? this.frames.fallback;
      if (object.parent !== parent) {
        parent.add(object);
      }
      applyPose(object, marker);
      const lifetime = durationMs(marker.lifetime);
      this.entries.set(key, {
        expiresAt: lifetime > 0 ? now + lifetime : null,
        object,
        placed: frame !== null,
        signature,
      });
    }
  }

  /** Drops every marker whose lifetime has passed; true when one did. */
  expire(now: number): boolean {
    let dropped = false;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.remove(key);
        dropped = true;
      }
    }
    return dropped;
  }

  /** When the next lifetime runs out, or null while nothing expires. */
  nextExpiry(): number | null {
    let next: number | null = null;
    for (const entry of this.entries.values()) {
      if (entry.expiresAt !== null && (next === null || entry.expiresAt < next)) {
        next = entry.expiresAt;
      }
    }
    return next;
  }

  clear(): void {
    for (const key of [...this.entries.keys()]) {
      this.remove(key);
    }
  }

  report(): MarkerReport {
    let loading = 0;
    let unplaced = 0;
    for (const entry of this.entries.values()) {
      if (!entry.placed) {
        unplaced += 1;
      }
      if (entry.object.userData[LOADING] === true) {
        loading += 1;
      }
    }
    return { count: this.entries.size, loading, unplaced };
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    this.entries.delete(key);
    entry.object.removeFromParent();
    disposeObject(entry.object);
  }

  private build(marker: MarkerSample): Object3D | null {
    const type = numberOf(marker.type);
    if (type !== MARKER.MESH_RESOURCE) {
      return buildMarkerShape(marker);
    }
    const uri = typeof marker.mesh_resource === "string" ? marker.mesh_resource : "";
    if (!uri) {
      return null;
    }
    // The mesh arrives later; the group holds its place so a pose update or a delete finds it.
    const group = new Group();
    group.userData[LOADING] = true;
    const scale = vector(marker.scale, 1);
    const paint = marker.mesh_use_embedded_materials === true ? null : markerMaterial(marker);
    void this.loadMesh(uri).then((mesh) => {
      if (!mesh || !group.parent) {
        return;
      }
      if (paint) {
        mesh.traverse((child) => {
          if (child instanceof Mesh) {
            child.material = paint;
          }
        });
      }
      mesh.scale.copy(scale);
      mesh.userData.sharedGeometry = true;
      group.add(mesh);
      group.userData[LOADING] = false;
      this.onChange();
    });
    return group;
  }
}

/** The shape of a marker without its pose or frame: what changing means rebuilding rather than moving. */
function shapeSignature(marker: MarkerSample): string {
  return JSON.stringify([
    marker.type,
    marker.scale,
    marker.color,
    marker.points,
    marker.colors,
    marker.text,
    marker.mesh_resource,
    marker.mesh_use_embedded_materials,
  ]);
}

function frameIdOf(marker: MarkerSample): string {
  const header = asRecord(marker.header);
  return typeof header.frame_id === "string" ? header.frame_id.replace(/^\//, "") : "";
}

function applyPose(object: Object3D, marker: MarkerSample): void {
  const pose = asRecord(marker.pose);
  const position = vector(pose.position, 0);
  const orientation = asRecord(pose.orientation);
  object.position.copy(position);
  const quaternion = new Quaternion(
    numberOf(orientation.x),
    numberOf(orientation.y),
    numberOf(orientation.z),
    numberOf(orientation.w),
  );
  object.quaternion.copy(quaternion.lengthSq() > 0 ? quaternion.normalize() : new Quaternion());
}

export function buildMarkerShape(marker: MarkerSample): Object3D | null {
  const type = numberOf(marker.type);
  const scale = vector(marker.scale, 0);
  const material = markerMaterial(marker);
  const points = Array.isArray(marker.points) ? marker.points.map((point) => vector(point, 0)) : [];
  const colors = pointColors(marker, points.length);
  const object = shapeOf(type, scale, material, points, colors, marker);
  if (object && markerAlpha(marker) === 0) {
    // As in rviz: an alpha of zero is a marker nobody can see, not one drawn opaque by accident.
    object.visible = false;
  }
  return object;
}

function shapeOf(
  type: number,
  scale: Vector3,
  material: MeshStandardMaterial,
  points: Vector3[],
  colors: Float32Array | null,
  marker: MarkerSample,
): Object3D | null {
  switch (type) {
    case MARKER.ARROW:
      return arrowMarker(points, scale, material);
    case MARKER.CUBE:
      return scaled(new Mesh(new BoxGeometry(1, 1, 1), material), scale);
    case MARKER.SPHERE:
      return scaled(new Mesh(new SphereGeometry(0.5, 24, 16), material), scale);
    case MARKER.CYLINDER:
      // rviz: x and y are the diameters, z the height, along the marker's z axis.
      return scaled(new Mesh(new CylinderGeometry(0.5, 0.5, 1, 24).rotateX(Math.PI / 2), material), scale);
    case MARKER.LINE_STRIP:
    case MARKER.LINE_LIST: {
      const geometry = pointGeometry(points, colors);
      const line = new LineBasicMaterial({
        color: colors ? 0xffffff : material.color,
        opacity: material.opacity,
        transparent: material.transparent,
        vertexColors: colors !== null,
      });
      material.dispose();
      return type === MARKER.LINE_STRIP ? new Line(geometry, line) : new LineSegments(geometry, line);
    }
    case MARKER.CUBE_LIST:
      return instanced(new BoxGeometry(1, 1, 1), material, points, scale, colors);
    case MARKER.SPHERE_LIST:
      return instanced(new SphereGeometry(0.5, 16, 12), material, points, scale, colors);
    case MARKER.POINTS: {
      const geometry = pointGeometry(points, colors);
      const dots = new PointsMaterial({
        color: colors ? 0xffffff : material.color,
        opacity: material.opacity,
        size: scale.x,
        sizeAttenuation: true,
        transparent: material.transparent,
        vertexColors: colors !== null,
      });
      material.dispose();
      return new Points(geometry, dots);
    }
    case MARKER.TEXT_VIEW_FACING: {
      const sprite = textSprite(String(marker.text ?? ""), scale.z, material.color, material.opacity);
      material.dispose();
      return sprite;
    }
    case MARKER.TRIANGLE_LIST: {
      const geometry = pointGeometry(points.slice(0, points.length - (points.length % 3)), colors);
      geometry.computeVertexNormals();
      material.vertexColors = colors !== null;
      if (colors) {
        material.color.set(0xffffff);
      }
      return scaled(new Mesh(geometry, material), scale);
    }
    default:
      material.dispose();
      return null;
  }
}

function scaled(object: Object3D, scale: Vector3): Object3D {
  object.scale.copy(scale);
  return object;
}

function instanced(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  points: Vector3[],
  scale: Vector3,
  colors: Float32Array | null,
): Object3D {
  const mesh = new InstancedMesh(geometry, material, points.length);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  points.forEach((point, index) => {
    mesh.setMatrixAt(index, matrix.compose(point, rotation, scale));
    if (colors) {
      mesh.setColorAt(index, new Color(colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2]));
    }
  });
  if (colors) {
    material.color.set(0xffffff);
  }
  return mesh;
}

/**
 * rviz's two arrows. With two points: the shaft is scale.x wide, the head scale.y wide and scale.z long
 * when set. Without points: along the marker's x axis, scale.x long, the shaft scale.y and the head
 * scale.z wide.
 */
function arrowMarker(points: Vector3[], scale: Vector3, material: MeshStandardMaterial): Object3D | null {
  const [start, end] = points;
  if (start && end) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length === 0) {
      material.dispose();
      return null;
    }
    const headLength = scale.z > 0 ? Math.min(scale.z, length) : length * ARROW_HEAD_SHARE;
    const arrow = arrowAlongZ(length - headLength, scale.x, headLength, scale.y, material);
    arrow.position.copy(start);
    arrow.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction.normalize());
    const holder = new Group();
    holder.add(arrow);
    return holder;
  }
  if (scale.x <= 0) {
    material.dispose();
    return null;
  }
  const arrow = arrowAlongZ(scale.x * (1 - ARROW_HEAD_SHARE), scale.y, scale.x * ARROW_HEAD_SHARE, scale.z, material);
  arrow.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(1, 0, 0));
  return arrow;
}

/** A shaft and a head from the origin along +z, as meshes so they have width. */
export function arrowAlongZ(
  shaftLength: number,
  shaftDiameter: number,
  headLength: number,
  headDiameter: number,
  material: MeshStandardMaterial,
): Group {
  const group = new Group();
  const shaftRadius = Math.max(shaftDiameter, 1e-4) / 2;
  const headRadius = Math.max(headDiameter, shaftDiameter * 2, 1e-4) / 2;
  if (shaftLength > 0) {
    const shaft = new Mesh(
      new CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 16).rotateX(Math.PI / 2),
      material,
    );
    shaft.position.z = shaftLength / 2;
    group.add(shaft);
  }
  const head = new Mesh(new ConeGeometry(headRadius, headLength, 16).rotateX(Math.PI / 2), material);
  head.position.z = shaftLength + headLength / 2;
  group.add(head);
  return group;
}

function pointGeometry(points: Vector3[], colors: Float32Array | null): BufferGeometry {
  const geometry = new BufferGeometry().setFromPoints(points);
  if (colors) {
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  }
  return geometry;
}

/** Per-point colours, when the marker gives exactly one per point as rviz requires. */
function pointColors(marker: MarkerSample, count: number): Float32Array | null {
  const colors = Array.isArray(marker.colors) ? marker.colors : [];
  if (count === 0 || colors.length !== count) {
    return null;
  }
  const values = new Float32Array(count * 3);
  colors.forEach((color, index) => {
    const record = asRecord(color);
    values[index * 3] = numberOf(record.r);
    values[index * 3 + 1] = numberOf(record.g);
    values[index * 3 + 2] = numberOf(record.b);
  });
  return values;
}

function textSprite(text: string, height: number, color: Color, opacity: number): Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const font = "bold 48px sans-serif";
  let width = 256;
  if (context) {
    context.font = font;
    width = Math.max(64, Math.ceil(context.measureText(text).width) + 24);
  }
  canvas.width = width;
  canvas.height = 64;
  if (context) {
    context.font = font;
    context.fillStyle = `#${color.getHexString()}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, 32);
  }
  const sprite = new Sprite(
    new SpriteMaterial({ map: new CanvasTexture(canvas), opacity, transparent: true, depthTest: false }),
  );
  const size = height > 0 ? height : 0.1;
  sprite.scale.set((size * width) / 64, size, 1);
  return sprite;
}

function markerMaterial(marker: MarkerSample): MeshStandardMaterial {
  const record = asRecord(marker.color);
  const opacity = markerAlpha(marker);
  return new MeshStandardMaterial({
    color: new Color(numberOf(record.r), numberOf(record.g), numberOf(record.b)),
    opacity,
    side: DoubleSide,
    transparent: opacity < 1,
  });
}

function markerAlpha(marker: MarkerSample): number {
  const alpha = asRecord(marker.color).a;
  return typeof alpha === "number" && Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
}

/** A `builtin_interfaces/msg/Duration` in milliseconds; zero means forever, as in rviz. */
function durationMs(value: unknown): number {
  const record = asRecord(value);
  return numberOf(record.sec) * 1000 + numberOf(record.nanosec) / 1e6;
}

/** Frees what an object owns; a mesh shared with the robot (a MESH_RESOURCE clone) keeps its geometry. */
export function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    const shared = child.userData.sharedGeometry === true;
    const drawable = child as Object3D & { geometry?: BufferGeometry; material?: unknown };
    if (!shared) {
      drawable.geometry?.dispose();
    }
    const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
    for (const material of materials) {
      if (material && typeof material === "object" && !shared) {
        const owned = material as { dispose?: () => void; map?: { dispose?: () => void } | null };
        owned.map?.dispose?.();
        owned.dispose?.();
      }
    }
  });
}

export function vector(value: unknown, fallback: number): Vector3 {
  const record = asRecord(value);
  return new Vector3(
    typeof record.x === "number" && Number.isFinite(record.x) ? record.x : fallback,
    typeof record.y === "number" && Number.isFinite(record.y) ? record.y : fallback,
    typeof record.z === "number" && Number.isFinite(record.z) ? record.z : fallback,
  );
}

export function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
