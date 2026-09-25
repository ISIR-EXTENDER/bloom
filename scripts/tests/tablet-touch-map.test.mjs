// The tablet touch helper against a fake X11: split devices, a replug while Bloom runs, and a desktop that
// overwrites the matrix. The real script runs; only xinput and xrandr are stand-ins.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";

const SCRIPT = resolve("scripts/extender-tablet-touch-map.sh");
const FAKES = resolve("scripts/tests/fake-x11");
const IDENTITY = "1 0 0 0 1 0 0 0 1";
// HDMI-1 is 1280x720 at +1920+0 on a 3200x1080 screen.
const TABLET_MATRIX = [0.4, 0, 0.6, 0, 720 / 1080, 0, 0, 0, 1];
const TABLET = "10176,2072"; // 27c0:0818 in decimal, as xinput reports it

function fakeX11(devices) {
  const dir = mkdtempSync(join(tmpdir(), "fake-x11-"));
  writeFileSync(
    join(dir, "xrandr"),
    [
      "Screen 0: minimum 320 x 200, current 3200 x 1080, maximum 16384 x 16384",
      "eDP-1 connected primary 1920x1080+0+0 (normal left inverted right x axis y axis) 344mm x 193mm",
      "HDMI-1 connected 1280x720+1920+0 (normal left inverted right x axis y axis) 0mm x 0mm",
      "",
    ].join("\n"),
  );
  setDevices(dir, devices);
  writeFileSync(join(dir, "calls"), "");
  return dir;
}

function setDevices(dir, devices) {
  writeFileSync(join(dir, "devices"), devices.map((d) => `${d.join("|")}\n`).join(""));
}

function matrixOf(dir, id) {
  const line = readFileSync(join(dir, "devices"), "utf8")
    .split("\n")
    .find((row) => row.startsWith(`${id}|`));
  return line ? line.split("|")[5].split(/\s+/).map(Number) : null;
}

function assertMatrix(actual, expected) {
  assert.ok(actual, "device is gone");
  for (const [index, value] of actual.entries()) {
    assert.ok(Math.abs(value - expected[index]) < 1e-3, `${actual} vs ${expected}`);
  }
}

const environment = (dir, extra = {}) => ({
  ...process.env,
  PATH: `${FAKES}:${process.env.PATH}`,
  FAKE_X11: dir,
  HOME: dir,
  WAIT_SECONDS: "0",
  WATCH_INTERVAL_SECONDS: "0.1",
  ...extra,
});

const run = (dir, args = [], extra = {}) =>
  spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8", env: environment(dir, extra) });

test("maps the controller's direct-touch pointer by id, not a name two devices share", () => {
  const dir = fakeX11([
    [12, "HID 27c0:0818", "pointer", TABLET, "touch", IDENTITY],
    [13, "HID 27c0:0818", "keyboard", TABLET, "", IDENTITY],
    [14, "HID 27c0:0818 Mouse", "pointer", TABLET, "", IDENTITY],
  ]);

  const result = run(dir);

  assert.equal(result.status, 0, result.stderr);
  assertMatrix(matrixOf(dir, 12), TABLET_MATRIX);
  assert.deepEqual(matrixOf(dir, 13), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(matrixOf(dir, 14), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test("leaves the display mode alone by default", () => {
  const dir = fakeX11([[12, "HID 27c0:0818", "pointer", TABLET, "touch", IDENTITY]]);

  run(dir);

  assert.doesNotMatch(readFileSync(join(dir, "calls"), "utf8"), /xrandr --output/);
});

test("installs the autostart with the tablet unplugged", () => {
  const dir = fakeX11([]);

  const result = run(dir, ["--install-autostart"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mapped at the next login/);
  assert.match(
    readFileSync(join(dir, ".config/autostart/extender-tablet-touch-map.desktop"), "utf8"),
    /APPLY_DISPLAY_MODE=0/,
  );
});

test("follows the tablet while Bloom runs: plugged in late, overwritten, unplugged and replugged", async () => {
  const dir = fakeX11([]);
  const watcher = spawn("bash", [SCRIPT, "--watch"], { env: environment(dir), detached: true });
  try {
    await wait(400);
    setDevices(dir, [[12, "HID 27c0:0818", "pointer", TABLET, "touch", IDENTITY]]);
    await wait(500);
    assertMatrix(matrixOf(dir, 12), TABLET_MATRIX);

    // The desktop puts its own matrix back after a display change.
    setDevices(dir, [[12, "HID 27c0:0818", "pointer", TABLET, "touch", IDENTITY]]);
    await wait(500);
    assertMatrix(matrixOf(dir, 12), TABLET_MATRIX);

    setDevices(dir, []);
    await wait(300);
    setDevices(dir, [[21, "HID 27c0:0818", "pointer", TABLET, "touch", IDENTITY]]);
    await wait(500);
    assertMatrix(matrixOf(dir, 21), TABLET_MATRIX);
    assert.equal(watcher.exitCode, null, "the watcher must survive an unplug");
  } finally {
    process.kill(-watcher.pid, "SIGTERM");
  }
});
