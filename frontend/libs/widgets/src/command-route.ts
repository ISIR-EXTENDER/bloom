import type { RuntimeActionPreset } from "@bloom/api-client";
import { resolveTeleopFrameId, type TopicPublishIntent, type WidgetActionIntent } from "./runtime";

/** Where a command press goes. The dispatcher, the Builder's inspector, checklist and CLI preview read the same answer. */
export type CommandRoute =
  | { kind: "preset"; preset: RuntimeActionPreset }
  | { kind: "teleop-frame"; frameId: string }
  | { kind: "topic"; publish: TopicPublishIntent }
  | { kind: "none" };

type CommandIntent = Extract<WidgetActionIntent, { type: "command" }>;

/**
 * A picked preset wins when the button has no topic or frame of its own, or names the preset's own command (the
 * shape the Builder saves). Otherwise the frame, then the button's own topic, then a preset by id or command.
 */
export function resolveCommandRoute(intent: CommandIntent, presets: readonly RuntimeActionPreset[]): CommandRoute {
  const picked = intent.presetId ? presets.find((candidate) => candidate.id === intent.presetId) : undefined;
  const hasOwnRoute = intent.fallback !== undefined || intent.runtimeBinding !== undefined;
  if (picked && (!hasOwnRoute || (intent.ownCommand !== undefined && intent.ownCommand === picked.command))) {
    return { kind: "preset", preset: picked };
  }
  const frameId = resolveTeleopFrameId(intent.runtimeBinding);
  if (frameId) {
    return { kind: "teleop-frame", frameId };
  }
  if (intent.fallback) {
    return { kind: "topic", publish: intent.fallback };
  }
  const byCommand = picked ?? presets.find((preset) => preset.command && preset.command === intent.command);
  return byCommand ? { kind: "preset", preset: byCommand } : { kind: "none" };
}
