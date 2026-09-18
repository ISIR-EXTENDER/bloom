import { readJacobian, readJointLimits, readJointStates, yoshikawaManipulability } from "@bloom/widgets";
import { type CSSProperties, useRef } from "react";
import { formatSignedValue } from "./control-renderers";
import { getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";
import { isSampleStale, useNow } from "./use-now";

/** Coloured at 80 %: that is when an engineer needs to look before the arm stops (design 5b). */
const PROXIMITY_WARN = 0.6;
const PROXIMITY_LIMIT = 0.8;
const STRONG_ENTRY = 0.8;
const MANIPULABILITY_SESSION_GAP_MS = 5000;

export function JointTableWidget({ data, descriptor }: WidgetRendererProps) {
  const settings = descriptor.widget.settings;
  const topic = getStringSetting(settings, "topic", "/joint_states");
  const latest = data?.type === "topic-echo" ? data.messages.at(-1) : undefined;
  const rows = readJointStates(latest?.value, readJointLimits(settings.joint_limits));
  // A frozen pose read as the arm's current one is how an operator plans a move from where it was.
  const stale = isSampleStale(latest?.receivedAt, useNow(1000));

  return (
    <div className="bloom-joint-table bloom-info-card" data-stale={stale ? "true" : undefined}>
      <header className="bloom-widget-head">
        <strong>{descriptor.widget.title}</strong>
        <span className="bloom-widget-readout">{stale ? `${topic} · stale` : topic}</span>
      </header>
      {rows.length === 0 ? (
        <p className="bloom-debug-empty">Waiting for {topic}.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Joint</th>
              <th scope="col">Position</th>
              <th scope="col">Velocity</th>
              <th scope="col">Effort</th>
              <th scope="col">Limit proximity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td>{formatSignedValue(row.position)}</td>
                <td>{row.velocity === null ? "—" : formatSigned(row.velocity, 3)}</td>
                <td>{row.effort === null ? "—" : formatSigned(row.effort, 1)}</td>
                <td>
                  {row.proximity === null ? (
                    <span className="bloom-debug-unreported">not reported</span>
                  ) : (
                    <span
                      className="bloom-joint-proximity"
                      data-level={
                        row.proximity >= PROXIMITY_LIMIT ? "limit" : row.proximity >= PROXIMITY_WARN ? "near" : "clear"
                      }
                      style={{ "--bloom-proximity": `${Math.round(row.proximity * 100)}%` } as CSSProperties}
                    >
                      <span aria-hidden="true" className="bloom-joint-proximity-bar" />
                      {Math.round(row.proximity * 100)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function JacobianWidget({ data, descriptor }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "/ee_jac");
  const latest = data?.type === "topic-echo" ? data.messages.at(-1) : undefined;
  const jacobian = readJacobian(latest?.value);
  const manipulability = jacobian ? yoshikawaManipulability(jacobian) : null;
  // The absolute value depends on the arm and its units, so the bar compares against this session's best.
  // A new topic or matrix shape, missing data or a gap (a reconnect, a restarted publisher) starts a new session.
  const bestRef = useRef({ best: 0, lastAt: Number.NaN, stream: "" });
  const stream = jacobian ? `${topic}|${jacobian.rows}x${jacobian.columns}` : "";
  const receivedAt = latest ? Date.parse(latest.receivedAt) : Number.NaN;
  const gap = receivedAt - bestRef.current.lastAt > MANIPULABILITY_SESSION_GAP_MS;
  if (!latest || stream !== bestRef.current.stream || gap) {
    bestRef.current = { best: 0, lastAt: receivedAt, stream };
  }
  bestRef.current.lastAt = receivedAt;
  if (manipulability !== null) {
    bestRef.current.best = Math.max(bestRef.current.best, manipulability);
  }
  const share = manipulability !== null && bestRef.current.best > 0 ? manipulability / bestRef.current.best : 0;

  return (
    <div className="bloom-jacobian bloom-info-card">
      <header className="bloom-widget-head">
        <strong>{descriptor.widget.title}</strong>
        <span className="bloom-widget-readout">
          {topic}
          {jacobian ? ` · ${jacobian.rows}×${jacobian.columns}` : ""}
        </span>
      </header>
      {jacobian ? (
        <>
          <table
            aria-label={`${descriptor.widget.title}, ${jacobian.rows} by ${jacobian.columns}`}
            className="bloom-jacobian-grid"
          >
            <tbody>
              {Array.from({ length: jacobian.rows }, (_, row) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a matrix row is its position.
                <tr key={row}>
                  {jacobian.values.slice(row * jacobian.columns, (row + 1) * jacobian.columns).map((value, column) => (
                    <td
                      data-strong={Math.abs(value) >= STRONG_ENTRY ? "true" : undefined}
                      // biome-ignore lint/suspicious/noArrayIndexKey: a matrix cell is its position.
                      key={column}
                    >
                      {formatSignedValue(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="bloom-jacobian-manipulability">
            <strong>Manipulability</strong>
            <output>{formatManipulability(manipulability ?? 0)}</output>
            <span
              aria-hidden="true"
              className="bloom-jacobian-bar"
              style={{ "--bloom-share": `${Math.round(share * 100)}%` } as CSSProperties}
            />
            <span className="bloom-debug-unreported">{Math.round(share * 100)}% of this session's best</span>
          </footer>
        </>
      ) : (
        <p className="bloom-debug-empty">
          {latest ? `The message on ${topic} is not a Jacobian: not reported.` : `No Jacobian received on ${topic}.`}
        </p>
      )}
    </div>
  );
}

function formatSigned(value: number, digits: number): string {
  const rounded = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `${rounded < 0 ? "−" : "+"}${Math.abs(rounded).toFixed(digits)}`;
}

/** Explorer's w sits near 1e-4, which three decimals would show as a flat zero. */
export function formatManipulability(value: number): string {
  if (value === 0) {
    return "0";
  }
  return value >= 0.01 ? value.toFixed(3) : value.toExponential(2);
}
