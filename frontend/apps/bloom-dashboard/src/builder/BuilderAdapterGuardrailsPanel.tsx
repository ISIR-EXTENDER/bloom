import type { RuntimeAdapterPolicy, RuntimeCapabilityReport } from "@bloom/api-client";
import { getTouchEditingProps } from "../ui/touchEditing";
import { formatLines } from "./app-config-model";

type BuilderAdapterGuardrailsPanelProps = {
  commandFrameUnavailable: boolean;
  onCommandFrameChange: (frameId: string) => void;
  onPolicyListChange: (field: keyof RuntimeAdapterPolicy, value: string) => void;
  onSyncFromPresets: () => void;
  policy: RuntimeAdapterPolicy;
  runtimeCapabilityReport: RuntimeCapabilityReport | null;
};

const POLICY_LISTS: ReadonlyArray<{ field: keyof RuntimeAdapterPolicy; label: string }> = [
  { field: "allowed_publish_topics", label: "Allowed publish topics" },
  { field: "allowed_message_types", label: "Allowed message types" },
  { field: "allowed_service_calls", label: "Allowed service calls" },
  { field: "allowed_teleop_targets", label: "Allowed teleop targets" },
  { field: "allowed_recording_topics", label: "Allowed recording topics" },
];

export function BuilderAdapterGuardrailsPanel({
  commandFrameUnavailable,
  onCommandFrameChange,
  onPolicyListChange,
  onSyncFromPresets,
  policy,
  runtimeCapabilityReport,
}: BuilderAdapterGuardrailsPanelProps) {
  const selectedCommandFrameId = policy.command_frame_id ?? "";
  const refusedTeleopTargets = teleopTargetsTheServerRefuses(
    policy.allowed_teleop_targets,
    runtimeCapabilityReport?.teleop_targets,
  );
  const supportedCommandFrameIds = runtimeCapabilityReport?.command_frame_ids;
  const commandFrameIds = Array.from(
    new Set([...(supportedCommandFrameIds ?? []), ...(selectedCommandFrameId ? [selectedCommandFrameId] : [])]),
  );

  return (
    <section className="builder-config-panel" aria-labelledby="builder-runtime-policy-title">
      <div className="builder-config-panel-header">
        <div>
          <p className="eyebrow">Runtime</p>
          <h2 id="builder-runtime-policy-title">Adapter guardrails</h2>
        </div>
        <span className="builder-section-badge">App level</span>
      </div>
      <p className="builder-inspector-copy">
        These lists help the runtime block accidental commands before they reach backend safety policies. Leave a list
        empty only for unrestricted local demos.
      </p>
      <label className="builder-settings-field">
        <span>Cartesian command frame</span>
        <select
          aria-describedby={commandFrameUnavailable ? "builder-command-frame-error" : undefined}
          aria-invalid={commandFrameUnavailable}
          onChange={(event) => onCommandFrameChange(event.target.value)}
          value={selectedCommandFrameId}
        >
          <option value="">
            {runtimeCapabilityReport?.command_frame_id
              ? `Backend default (${runtimeCapabilityReport.command_frame_id})`
              : "Backend default"}
          </option>
          {commandFrameIds.map((frameId) => (
            <option
              disabled={Boolean(supportedCommandFrameIds && !supportedCommandFrameIds.includes(frameId))}
              key={frameId}
              value={frameId}
            >
              {frameId}
              {supportedCommandFrameIds && !supportedCommandFrameIds.includes(frameId) ? " (unavailable)" : ""}
            </option>
          ))}
        </select>
      </label>
      {commandFrameUnavailable ? (
        <p className="builder-inline-error" id="builder-command-frame-error" role="alert">
          This frame is not available on the connected robot. Choose a supported frame before saving.
        </p>
      ) : null}
      <button className="builder-secondary-action" onClick={onSyncFromPresets} type="button">
        Sync publish guardrails from presets
      </button>
      {POLICY_LISTS.map(({ field, label }) => (
        <label className="builder-settings-field" key={field}>
          <span>{label}</span>
          <textarea
            {...getTouchEditingProps("text")}
            onChange={(event) => onPolicyListChange(field, event.target.value)}
            placeholder="One value per line"
            rows={3}
            value={formatLines(policy[field] as readonly string[])}
          />
          {field === "allowed_teleop_targets" && refusedTeleopTargets.length > 0 ? (
            <p className="builder-inline-error" role="alert">
              This robot's Bloom server does not allow teleop on {refusedTeleopTargets.join(", ")}, so a joystick sent
              there is refused. The app can only narrow the server's list: add the topic to BLOOM_ALLOWED_TELEOP_TARGETS
              where the server runs, then restart it.
            </p>
          ) : null}
        </label>
      ))}
    </section>
  );
}

/** Topics the app lists that the server's own teleop list does not, when the server has said what it allows. */
export function teleopTargetsTheServerRefuses(
  appTargets: readonly string[],
  serverTargets: readonly string[] | undefined,
): string[] {
  if (!serverTargets || serverTargets.includes("*")) {
    return [];
  }
  return appTargets.filter((target) => target !== "*" && !serverTargets.includes(target));
}
