/**
 * Install dependencies when the lockfile is newer than the last install.
 *
 * A pull that adds a dependency leaves `node_modules` a version behind, and Vite then fails to resolve an
 * import with a message that reads like broken code rather than a missing install. npm records each install
 * in `node_modules/.package-lock.json`, so comparing the two timestamps says whether one is owed.
 */
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function modifiedAt(path) {
  try {
    return statSync(resolve(repoRoot, path)).mtimeMs;
  } catch {
    return null;
  }
}

export function installIsStale(lockfileMs, installedMs) {
  if (lockfileMs === null) {
    return false;
  }
  return installedMs === null || installedMs < lockfileMs;
}

// import.meta.main, not a file:// comparison: a path with a space or through a symlink never matched it.
if (import.meta.main) {
  const lockfile = modifiedAt("package-lock.json");
  const installed = modifiedAt("node_modules/.package-lock.json");
  if (!installIsStale(lockfile, installed)) {
    process.exit(0);
  }
  console.log(
    installed === null
      ? "Dependencies are not installed yet. Running npm install..."
      : "package-lock.json is newer than the last install, so a dependency was added or changed. Running npm install...",
  );
  try {
    execFileSync("npm", ["install"], { cwd: repoRoot, stdio: "inherit" });
  } catch {
    console.error("npm install failed. Run it yourself in the Bloom repository before starting the dashboard.");
    process.exit(1);
  }
}
