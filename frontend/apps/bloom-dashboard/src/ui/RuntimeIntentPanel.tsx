import type { RuntimeActionRecord } from "../runtime/use-runtime-action-dispatcher";

type RuntimeIntentPanelProps = {
  records: readonly RuntimeActionRecord[];
};

export function RuntimeIntentPanel({ records }: RuntimeIntentPanelProps) {
  return (
    <aside className="runtime-panel" aria-labelledby="runtime-panel-title">
      <div>
        <p className="eyebrow">Runtime test bench</p>
        <h2 id="runtime-panel-title">Action intents</h2>
      </div>
      <p>
        Interact with buttons, toggles, sliders, or joystick widgets to verify the UI emits clean runtime intents and
        dispatches supported actions through backend adapters.
      </p>
      {records.length === 0 ? (
        <p className="runtime-empty">No runtime intents yet.</p>
      ) : (
        <ol className="runtime-intent-list">
          {records.map((record) => (
            <li key={record.id}>
              <div className="runtime-intent-header">
                <strong>{record.intent.type}</strong>
                <span data-runtime-status={record.status}>{record.status}</span>
              </div>
              <p className="runtime-intent-detail">{record.detail}</p>
              <code>{formatRecord(record)}</code>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function formatRecord(record: RuntimeActionRecord): string {
  return JSON.stringify(
    {
      intent: record.intent,
      request: record.request,
    },
    null,
    2,
  );
}
