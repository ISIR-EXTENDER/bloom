import type { WidgetActionIntent } from "@bloom/widgets";

type RuntimeIntentPanelProps = {
  intents: readonly WidgetActionIntent[];
};

export function RuntimeIntentPanel({ intents }: RuntimeIntentPanelProps) {
  return (
    <aside className="runtime-panel" aria-labelledby="runtime-panel-title">
      <div>
        <p className="eyebrow">Runtime test bench</p>
        <h2 id="runtime-panel-title">Action intents</h2>
      </div>
      <p>
        Interact with buttons, toggles, sliders, or joystick widgets to verify the UI emits clean runtime intents before
        ROS adapters are connected.
      </p>
      {intents.length === 0 ? (
        <p className="runtime-empty">No runtime intents yet.</p>
      ) : (
        <ol className="runtime-intent-list">
          {intents.map((intent) => (
            <li key={formatIntent(intent)}>
              <strong>{intent.type}</strong>
              <code>{formatIntent(intent)}</code>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function formatIntent(intent: WidgetActionIntent): string {
  return JSON.stringify(intent, null, 2);
}
