import type {
  CommandStateEntry,
  CommandStateSource,
  RosTopicPublishRequest,
  RuntimeCommandStateMessage,
} from "@bloom/api-client";
import { modeCommandBinding, normalizeCommandPayload } from "@bloom/widget-renderers";

/** The backend's command-state push, faked: a test writes keys and every listener gets the whole snapshot. */
export function createCommandStateServer(self = "me0000000000") {
  const listeners = new Set<(message: RuntimeCommandStateMessage | null) => void>();
  const snapshot: Record<string, CommandStateEntry> = {};
  let revision = 0;
  const message = (): RuntimeCommandStateMessage => ({
    type: "command_state",
    revision,
    self,
    snapshot: { ...snapshot },
  });
  return {
    self,
    addRuntimeCommandStateListener(listener: (message: RuntimeCommandStateMessage | null) => void) {
      listeners.add(listener);
      listener(revision > 0 ? message() : null);
      return () => {
        listeners.delete(listener);
      };
    },
    write(entries: Record<string, unknown>, by = self, source: CommandStateSource = "commanded") {
      for (const [key, value] of Object.entries(entries)) {
        revision += 1;
        snapshot[key] = { value, source, by, revision, updated_at: "2026-09-28T12:00:00+00:00" };
      }
      for (const listener of listeners) {
        listener(message());
      }
    },
    /** What the backend writes for an accepted publish: the topic, a digital output's pins, the manager's modes. */
    recordPublish(request: RosTopicPublishRequest, by = self) {
      const value = normalizeCommandPayload(
        request.topic,
        request.message_type,
        request.payload ?? request.payload_text,
      ) as { data?: unknown } | undefined;
      if (value === undefined) {
        return;
      }
      const writes: Record<string, unknown> = { [request.topic]: value };
      if (request.topic.endsWith("mode_request") && typeof value.data === "string") {
        for (const { key, value: held } of modeCommandBinding(request.topic, value.data)?.writes ?? []) {
          writes[key] = held;
        }
      }
      this.write(writes, by);
    },
    disconnect() {
      for (const listener of listeners) {
        listener(null);
      }
    },
  };
}
