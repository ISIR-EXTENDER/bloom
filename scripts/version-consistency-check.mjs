#!/usr/bin/env node
/**
 * Every file that carries Bloom's version must agree, or a release ships a
 * dashboard and an API reporting different versions. The workspace packages
 * are read from package-lock.json, so a new one cannot be missed.
 */
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const workspacePaths = Object.keys(lock.packages).filter((path) => !path.includes("node_modules"));

const SOURCES = [
  ...workspacePaths.map((path) => {
    const manifest = path ? `${path}/package.json` : "package.json";
    return { label: manifest, path: manifest, read: (text) => JSON.parse(text).version };
  }),
  ...workspacePaths.map((path) => ({
    label: `package-lock.json (${path || "root"})`,
    path: "package-lock.json",
    read: (text) => JSON.parse(text).packages[path]?.version,
  })),
  {
    label: "backend/pyproject.toml",
    path: "backend/pyproject.toml",
    read: (text) => text.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  },
  {
    label: "backend/uv.lock (bloom-backend)",
    path: "backend/uv.lock",
    read: (text) => text.match(/^name = "bloom-backend"\nversion = "([^"]+)"/m)?.[1],
  },
  {
    label: "backend/apps/bloom_api/settings.py",
    path: "backend/apps/bloom_api/settings.py",
    read: (text) => text.match(/app_version:\s*str\s*=\s*"([^"]+)"/)?.[1],
  },
];

const found = SOURCES.map((source) => {
  let version;
  try {
    version = source.read(readFileSync(source.path, "utf8"));
  } catch (error) {
    return { ...source, version: undefined, error: error.message };
  }
  return { ...source, version };
});

const failures = found.filter((item) => !item.version);
const versions = new Set(found.filter((item) => item.version).map((item) => item.version));

for (const item of found) {
  console.log(`  ${item.label.padEnd(56)} ${item.version ?? `unreadable (${item.error ?? "no match"})`}`);
}

if (failures.length > 0) {
  console.error("\nVersion check failed: could not read a version from every source.");
  process.exit(1);
}

if (versions.size !== 1) {
  console.error(`\nVersion check failed: ${versions.size} different versions across ${found.length} sources.`);
  process.exit(1);
}

console.log(`\nVersion check passed: ${[...versions][0]} everywhere.`);
