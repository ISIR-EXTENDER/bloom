import type { ApplicationConfig } from "@bloom/api-client";
import { useId } from "react";
import { getTouchEditingProps } from "../ui/touchEditing";
import { RequiredTextInput } from "./RequiredTextInput";

type BuilderAppDetailsPanelProps = {
  application: ApplicationConfig;
  isDirty: boolean;
  onChange: (patch: Partial<ApplicationConfig>) => void;
};

export function BuilderAppDetailsPanel({ application, isDirty, onChange }: BuilderAppDetailsPanelProps) {
  const nameId = useId();
  return (
    <section className="builder-config-panel" aria-labelledby="builder-app-details-title">
      <div className="builder-config-panel-header">
        <div>
          <p className="eyebrow">Identity</p>
          <h2 id="builder-app-details-title">App details</h2>
        </div>
        <span className="builder-section-badge">{isDirty ? "Draft" : "Saved"}</span>
      </div>
      <label className="builder-settings-field" htmlFor={nameId}>
        <span>Name</span>
        <RequiredTextInput
          id={nameId}
          {...getTouchEditingProps("name")}
          fallback="Untitled app"
          onCommit={(name) => onChange({ name })}
          value={application.name}
        />
      </label>
      <label className="builder-settings-field">
        <span>Description</span>
        <textarea
          {...getTouchEditingProps("text")}
          onChange={(event) => onChange({ description: event.target.value })}
          rows={4}
          value={application.description}
        />
      </label>
    </section>
  );
}
