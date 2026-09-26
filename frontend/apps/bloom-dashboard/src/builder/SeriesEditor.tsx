import type { WidgetConfig } from "@bloom/api-client";
import { fieldSuggestionsFor, isRecord, TOPIC_SUGGESTIONS } from "@bloom/widgets";
import { useId } from "react";

export const SERIES_KINDS: ReadonlySet<string> = new Set(["plot-board", "value-strip"]);

/** A new row reads something every arm publishes, so it plots the moment it is added. */
const NEW_SERIES = {
  enabled: true,
  field_path: "pose.position.x",
  label: "Hand x",
  message_type: "geometry_msgs/msg/PoseStamped",
  topic: "/ee_pose",
  unit: "m",
};

type SeriesRow = Record<string, unknown>;

function readRows(widget: WidgetConfig): SeriesRow[] {
  const series = widget.settings?.series;
  return Array.isArray(series) ? series.filter(isRecord) : [];
}

function text(row: SeriesRow, key: string): string {
  const value = row[key] ?? (key === "field_path" ? row.fieldPath : undefined);
  return typeof value === "string" ? value : "";
}

/** Why a row plots nothing, as the renderer decides it; empty when it plots. */
function rowProblem(row: SeriesRow): string {
  if (!text(row, "topic").startsWith("/")) return "Needs a topic starting with /.";
  if (!text(row, "field_path")) return "Needs a field, such as pose.position.z.";
  return "";
}

/**
 * The series of a plot board or value strip, one row each, instead of a JSON array. An author adding a
 * series had to know the keys, and a row with a typo was dropped at runtime without a word.
 */
export function SeriesEditor({
  onUpdateSettings,
  widget,
}: {
  onUpdateSettings: (settings: Record<string, unknown>) => string | null;
  widget: WidgetConfig;
}) {
  const listId = useId();
  if (!SERIES_KINDS.has(widget.kind)) {
    return null;
  }
  const rows = readRows(widget);
  const commit = (next: SeriesRow[]) => onUpdateSettings({ ...widget.settings, series: next });
  const edit = (index: number, patch: SeriesRow) =>
    commit(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));

  return (
    <section aria-label="Series" className="builder-series-editor">
      <h4>Series</h4>
      {rows.length === 0 ? <p className="builder-inspector-copy">No series yet: nothing is drawn.</p> : null}
      {rows.map((row, index) => {
        const problem = rowProblem(row);
        const name = text(row, "label") || `Series ${index + 1}`;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id, and reordering is not offered.
          <fieldset className="builder-series-row" key={index}>
            <legend>{name}</legend>
            {(["label", "topic", "field_path", "unit"] as const).map((key) => (
              <label className="builder-settings-field" key={key}>
                <span>{{ label: "Label", topic: "Topic", field_path: "Field", unit: "Unit" }[key]}</span>
                <input
                  list={
                    key === "topic"
                      ? `${listId}-topics`
                      : key === "field_path"
                        ? `${listId}-fields-${index}`
                        : undefined
                  }
                  onChange={(event) =>
                    // A new topic takes its type from the graph; the old one's kept the subscription waiting.
                    edit(
                      index,
                      key === "topic"
                        ? { topic: event.target.value, message_type: undefined, messageType: undefined }
                        : { [key]: event.target.value },
                    )
                  }
                  type="text"
                  value={text(row, key)}
                />
              </label>
            ))}
            <label className="builder-settings-checkbox">
              <input
                checked={row.enabled !== false}
                onChange={(event) => edit(index, { enabled: event.target.checked })}
                type="checkbox"
              />
              <span>Shown</span>
            </label>
            {widget.kind === "plot-board" ? (
              <label className="builder-settings-checkbox">
                <input
                  checked={row.emphasis === true}
                  onChange={(event) => edit(index, { emphasis: event.target.checked })}
                  type="checkbox"
                />
                <span>Emphasis</span>
              </label>
            ) : null}
            <datalist id={`${listId}-fields-${index}`}>
              {fieldSuggestionsFor(text(row, "topic")).map((fieldPath) => (
                <option key={fieldPath} value={fieldPath} />
              ))}
            </datalist>
            {problem ? (
              <small className="builder-settings-pending" role="status">
                Not plotted. {problem}
              </small>
            ) : null}
            <button
              aria-label={`Remove ${name}`}
              className="builder-secondary-action"
              onClick={() => commit(rows.filter((_, rowIndex) => rowIndex !== index))}
              type="button"
            >
              Remove
            </button>
          </fieldset>
        );
      })}
      <datalist id={`${listId}-topics`}>
        {TOPIC_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion.topic} value={suggestion.topic} />
        ))}
      </datalist>
      <button className="builder-secondary-action" onClick={() => commit([...rows, { ...NEW_SERIES }])} type="button">
        Add series
      </button>
    </section>
  );
}
