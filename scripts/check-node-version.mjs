// Exits 1 when the running Node is older than the engines.node floor in package.json, patch included.
import { readFileSync } from "node:fs";

const { engines } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const floor = engines.node.replace(/^>=\s*/, "");
const required = floor.split(".").map(Number);
const current = process.versions.node.split(".").map(Number);
const index = required.findIndex((part, position) => current[position] !== part);

if (index !== -1 && current[index] < required[index]) {
  console.error(`Node ${process.versions.node} is older than the Node ${floor} floor in package.json.`);
  process.exit(1);
}
