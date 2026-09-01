#!/usr/bin/env node
/**
 * Three files carry Bloom's version independently. Nothing enforced that they
 * agree, so a release could ship a dashboard and an API reporting different
 * versions, and the mismatch would only surface in a bug report where the
 * reported version was wrong.
 */
import { readFileSync } from "node:fs";

const SOURCES = [
  {
    label: "package.json",
    path: "package.json",
    read: (text) => JSON.parse(text).version,
  },
  {
    label: "backend/pyproject.toml",
    path: "backend/pyproject.toml",
    read: (text) => text.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
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
  console.log(`  ${item.label.padEnd(38)} ${item.version ?? `unreadable (${item.error ?? "no match"})`}`);
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
