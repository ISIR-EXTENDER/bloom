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
 * `.../share/pkg/meshes/a.dae` (with or without `file://`) that xacro's `$(find pkg)` expands to. The last
 * `share` segment is the package's: a workspace may itself live under a directory of that name.
 */
export function resolvePackageAsset(uri: string): { packageName: string; path: string } | null {
  const packaged = /^package:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (packaged?.[1] && packaged[2]) {
    return { packageName: packaged[1], path: packaged[2] };
  }
  const absolute = uri.replace(/^file:\/\//, "");
  for (let share = absolute.lastIndexOf("/share/"); share >= 0; share = absolute.lastIndexOf("/share/", share - 1)) {
    const [packageName, ...rest] = absolute.slice(share + "/share/".length).split("/");
    if (packageName && rest.length > 0 && rest.every(Boolean)) {
      return { packageName, path: rest.join("/") };
    }
  }
  return null;
}
