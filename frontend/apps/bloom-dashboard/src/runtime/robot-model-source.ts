import type { RobotModelSource } from "@bloom/widget-renderers";
import type { RuntimeActionClient } from "./runtime-protocol";

/** The 3D robot view's source: the API's robot description and its package assets, or nothing without them. */
export function createRobotModelSource(client: RuntimeActionClient): RobotModelSource | undefined {
  const readModel = client.readRobotModel;
  const readAsset = client.readRobotModelAsset;
  if (!readModel || !readAsset) {
    return undefined;
  }
  return {
    load: async () => (await readModel()).urdf,
    asset: async (uri) => {
      const location = resolvePackageAsset(uri);
      return location ? readAsset(location.packageName, location.path) : null;
    },
  };
}

/**
 * A mesh's package and path from the way a URDF names it: `package://pkg/meshes/a.dae`, or the absolute
 * `.../share/pkg/meshes/a.dae` (with or without `file://`) that xacro's `$(find pkg)` expands to.
 */
export function resolvePackageAsset(uri: string): { packageName: string; path: string } | null {
  const match =
    /^package:\/\/([^/]+)\/(.+)$/.exec(uri) ?? /\/share\/([^/]+)\/(.+)$/.exec(uri.replace(/^file:\/\//, ""));
  return match?.[1] && match[2] ? { packageName: match[1], path: match[2] } : null;
}
