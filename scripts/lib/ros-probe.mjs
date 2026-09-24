/**
 * A Python rclpy probe as a child process, speaking one JSON object per line: `{topic, data}` for a
 * sample, `{subscribers}` for a graph reading. The script decides what it subscribes to and
 * publishes; this side keeps the samples and answers "did X happen after time T".
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const KEPT_PER_TOPIC = 4000;

export async function startRosProbe({ source, readyTopic, readyTimeoutMs = 30000, settleMs = 1500 }) {
  const child = spawn("python3", ["-u", "-c", source], { stdio: ["ignore", "pipe", "inherit"] });
  const messages = new Map();
  let subscribers = {};
  createInterface({ input: child.stdout }).on("line", (line) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (parsed.subscribers) {
      subscribers = parsed.subscribers;
      return;
    }
    const list = messages.get(parsed.topic) ?? [];
    list.push({ data: parsed.data, t: Date.now() });
    if (list.length > KEPT_PER_TOPIC) {
      list.splice(0, list.length - KEPT_PER_TOPIC);
    }
    messages.set(parsed.topic, list);
  });
  const exited = new Promise((resolvePromise) => child.on("exit", resolvePromise));

  const probe = {
    latest: (topic) => messages.get(topic)?.at(-1),
    since: (topic, time) => (messages.get(topic) ?? []).filter((message) => message.t >= time),
    stop: () => child.kill("SIGINT"),
    subscribers: (topic) => subscribers[topic] ?? [],
    async waitFor(topic, predicate, { since = 0, timeoutMs = 5000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = probe.since(topic, since).find((message) => predicate(message.data));
        if (found) {
          return found.data;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      const seen = probe
        .since(topic, since)
        .slice(-3)
        .map((message) => JSON.stringify(message.data));
      throw new Error(`timed out after ${timeoutMs} ms on ${topic}; last seen: ${seen.join(" ") || "nothing"}`);
    },
  };

  const ready = await Promise.race([
    probe.waitFor(readyTopic, () => true, { timeoutMs: readyTimeoutMs }).then(() => true),
    exited.then(() => false),
  ]).catch(() => false);
  if (!ready) {
    child.kill("SIGKILL");
    console.error(
      `No ${readyTopic} on ROS_DOMAIN_ID=${process.env.ROS_DOMAIN_ID ?? 0}; is ROS sourced and the robot up?`,
    );
    process.exit(1);
  }
  // Discovery of subscribers lags the first samples.
  await new Promise((resolvePromise) => setTimeout(resolvePromise, settleMs));
  return probe;
}
