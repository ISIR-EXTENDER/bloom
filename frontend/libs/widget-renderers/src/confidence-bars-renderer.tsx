import {
  AGNOSTIC_GOAL_ID,
  getBooleanSetting,
  getStringSetting,
  hidesTitle,
  readConfidences,
  SHARED_CONTROL_CONFIDENCES_TOPIC,
} from "@bloom/widgets";
import type { CSSProperties } from "react";
import { useBehaviourReported } from "./behaviour-feedback";
import { rendererStrings } from "./renderer-strings";
import type { WidgetRendererProps } from "./types";
import { isSampleStale, useNow } from "./use-now";

/**
 * One bar per shared-control goal, named as the manager names it. The manager publishes only while Assist is
 * on, so a quiet topic reads "not publishing" rather than as goals nobody aims at.
 */
export function ConfidenceBarsWidget({ data, descriptor, language }: WidgetRendererProps) {
  const text = rendererStrings(language);
  const settings = descriptor.widget.settings;
  const topic = getStringSetting(settings, "topic", SHARED_CONTROL_CONFIDENCES_TOPIC);
  const showDetails = getBooleanSetting(settings, "show_details", false);
  const latest = data?.type === "topic-echo" ? data.messages.at(-1) : undefined;
  const stale = isSampleStale(latest?.receivedAt, useNow(1000));
  // The store says at once when Assist went off; the sample's age covers a manager that stopped without saying.
  const silent = useBehaviourReported(topic) === false || stale;
  const goals = latest && !silent ? readConfidences(latest.value) : [];
  const live = goals.length > 0;
  const percent = new Intl.NumberFormat(language ?? "en", { maximumFractionDigits: 0, style: "percent" });
  const nameOf = (id: string) => (id === AGNOSTIC_GOAL_ID ? text.noGoal : id);

  return (
    <div
      className="bloom-confidence-bars bloom-info-card"
      data-live={live ? "true" : "false"}
      data-goals={goals.length}
    >
      {hidesTitle(settings) ? null : (
        <header className="bloom-display-header">
          <strong>{descriptor.widget.title}</strong>
          <span>{showDetails && live ? topic : live ? text.goalConfidence : text.notPublishing}</span>
        </header>
      )}
      {live ? (
        <ul aria-label={`${descriptor.widget.title}: ${text.goalConfidence}`} className="bloom-confidence-list">
          {goals.map((goal) => (
            <li
              className="bloom-confidence-row"
              data-goal={goal.id}
              data-confidence={goal.value.toFixed(2)}
              key={goal.id}
              style={{ "--bloom-confidence": `${Math.round(goal.value * 100)}%` } as CSSProperties}
            >
              <span className="bloom-confidence-name">{nameOf(goal.id)}</span>
              <meter
                aria-label={`${nameOf(goal.id)}: ${percent.format(goal.value)}`}
                max={1}
                min={0}
                value={goal.value}
              >
                {goal.value.toFixed(2)}
              </meter>
              <span className="bloom-confidence-value">{percent.format(goal.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bloom-confidence-empty">{silent || !latest ? text.assistOff(topic) : text.unreadable(topic)}</p>
      )}
    </div>
  );
}
