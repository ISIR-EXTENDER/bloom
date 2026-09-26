import type { CanvasSettings, WidgetConfig } from "@bloom/api-client";
import {
  buildCliPreview,
  INTERACTIVE_WIDGET_KINDS,
  resolveCanvasFitScale,
  resolveCanvasPresetSize,
  type WidgetDestination,
} from "@bloom/widgets";
import { glassPx } from "./builder-geometry";

const FIT_OVERFLOW_GUARD = 0.99;

/**
 * The same command on the terminal.
 *
 * A form is abstract. This is a sentence an author can paste into a shell and check against a running
 * robot without the app, without a session and without asking anyone -- and the first thing to try when
 * a control does nothing. A toggle sends two different messages, so it gets both lines.
 */
export function WidgetCliPreview({ widget }: { widget: WidgetConfig }) {
  const settings = widget.settings ?? {};
  const lines =
    widget.kind === "toggle"
      ? [
          ["ON", buildCliPreview(widget.kind, settings, settings.onPayload)],
          ["OFF", buildCliPreview(widget.kind, settings, settings.offPayload)],
        ]
      : [["", buildCliPreview(widget.kind, settings, settings.payload)]];
  const shown = lines.filter(([, line]) => line !== null);

  if (shown.length === 0) {
    return null;
  }

  return (
    <div className="builder-cli-preview">
      <p className="builder-inspector-copy">The same command on the terminal:</p>
      {shown.map(([label, line]) => (
        <code key={label}>
          {label ? `${label}: ` : ""}
          {line}
        </code>
      ))}
    </div>
  );
}

export function WidgetGlassSizeSummary({
  canvas,
  floorPx,
  panel,
  widget,
}: {
  canvas?: CanvasSettings;
  floorPx: number;
  panel: { height: number; width: number };
  widget: WidgetConfig;
}) {
  if (!canvas) {
    return null;
  }
  const artboard = resolveCanvasPresetSize(canvas);
  // Fit against the panel this screen's own device class is checked at, not the tablet every time.
  // Measured against 1024x600 regardless, a desktop screen was scaled to a panel it will never run on
  // and every interactive control on it reported a target below the floor, with nothing an author
  // could do about it.
  const scale = canvas.runtime_mode === "fit" ? resolveCanvasFitScale(canvas, artboard, panel) * FIT_OVERFLOW_GUARD : 1;
  const glassWidth = Math.round(widget.layout.width * scale);
  const glassHeight = Math.round(widget.layout.height * scale);
  // Measure what the hand meets as well as the card around it. The card alone could never fail for a
  // widget that met its minimum size, so it reassured an author while the inspector was warning; the
  // target alone misses a card too small to hold it, because some kinds declare a fixed target.
  const interactive = INTERACTIVE_WIDGET_KINDS.has(widget.kind);
  const target = interactive ? Math.min(glassPx(widget, scale), glassWidth, glassHeight) : null;
  const belowFloor = target !== null && target < floorPx;

  return (
    <div className="builder-glass-size" data-below-floor={belowFloor ? "true" : "false"}>
      {belowFloor ? (
        // The target comes first: the card's size below it was read as "the minimum I must reach".
        <p className="builder-glass-size-warning" role="alert">
          Its target is {target} px, below the {floorPx}px floor for this panel. The size tokens are honest; the fit
          scale discounts them — make the control larger instead of trusting the authored size.
        </p>
      ) : null}
      <p className="builder-inspector-copy">
        On the {panel.width}×{panel.height} panel {belowFloor ? "the card itself is" : ":"}{" "}
        <strong>{`${glassWidth} × ${glassHeight} px`}</strong> of glass (scale {scale.toFixed(2)})
        {belowFloor ? "; the target inside it is what is short." : "."}
      </p>
    </div>
  );
}

/**
 * States where the widget's output actually goes.
 *
 * The inspector previously showed an editable "Output topic" beside a runtime
 * binding that overrode it, with nothing saying which one won. A researcher
 * setting a topic and seeing no change has no way to tell whether the field is
 * ignored, the robot is disconnected, or they made a typo.
 */
export function WidgetDestinationSummary({
  allowedParameters,
  allowedTeleopTargets,
  destination,
  serverTeleopTargets,
  widget,
}: {
  allowedParameters?: readonly string[];
  allowedTeleopTargets?: readonly string[];
  destination: WidgetDestination | null;
  /** What this robot's server allows; the app's list can only narrow it. */
  serverTeleopTargets?: readonly string[];
  widget: WidgetConfig;
}) {
  // Kinds whose data flow is not modelled get no panel at all. A guess here is
  // worse than silence: it is what made the inspector misleading to begin with.
  if (!destination) {
    return null;
  }

  // Robin, 2026-09-23: "est-il possible de rendre paramétrable le nom du topic ? Lorsque l'on
  // remplace /joystick_cartesian_command par autre chose, ça ne fonctionne plus." It is
  // parameterisable; what stopped it is the app's own teleop list, which the runtime narrows the
  // socket to. Nothing said so until the control was live and refused.
  const teleopTarget =
    destination.direction === "publishes" && resolveTeleopAdapter(widget.settings) ? (destination.topic ?? "") : "";
  const outsidePolicy =
    Boolean(teleopTarget) &&
    Boolean(allowedTeleopTargets) &&
    !allowedTeleopTargets?.includes("*") &&
    !allowedTeleopTargets?.includes(teleopTarget);

  // Robin, 2026-09-25: added a topic to the app's list, picked it here, then got "Command failed". The
  // server's list, the manager's own inputs, did not have it, and nothing said so.
  const serverRefuses =
    Boolean(teleopTarget) &&
    Boolean(serverTeleopTargets) &&
    !serverTeleopTargets?.includes("*") &&
    !serverTeleopTargets?.includes(teleopTarget);

  const parameterTarget = resolveParameterTarget(widget.settings);
  const parameterOutsidePolicy =
    Boolean(parameterTarget) &&
    Boolean(allowedParameters) &&
    !allowedParameters?.includes("*") &&
    !allowedParameters?.includes(parameterTarget);

  const label = destination.direction === "reads" ? "Reads from" : parameterTarget ? "Sets parameter" : "Publishes to";
  const emptyLabel = destination.direction === "reads" ? "No topic set" : "Not configured";

  return (
    <div
      className="builder-settings-destination"
      data-direction={destination.direction}
      data-source={destination.source}
    >
      <span className="builder-settings-destination-label">{label}</span>
      {destination.topic ? (
        <code className="builder-settings-destination-topic">{destination.topic}</code>
      ) : (
        <span className="builder-settings-destination-topic builder-settings-destination-none">{emptyLabel}</span>
      )}
      {destination.detail ? <p className="builder-settings-destination-summary">{destination.detail}</p> : null}
      {outsidePolicy ? (
        <p className="builder-settings-destination-refusal" role="alert">
          This app does not allow teleop on {teleopTarget}, so the runtime will refuse it. Add it under App
          configuration, Adapter guardrails, Teleop targets.
        </p>
      ) : null}
      {serverRefuses ? (
        <p className="builder-settings-destination-refusal" role="alert">
          Nothing on this robot takes a joystick on {teleopTarget}, so the runtime will refuse it. The manager listens
          on {serverTeleopTargets?.join(", ")}.
        </p>
      ) : null}
      {parameterOutsidePolicy ? (
        <p className="builder-settings-destination-refusal" role="alert">
          This app does not allow setting {parameterTarget}, so the runtime will refuse it. Add it under App
          configuration, Adapter guardrails, Allowed parameters.
        </p>
      ) : null}
    </div>
  );
}

/** "<node>:<parameter>" for a parameter binding, which is what the parameter list governs. */
function resolveParameterTarget(settings: Record<string, unknown>): string {
  const binding = settings.runtime_binding;
  if (!binding || typeof binding !== "object" || (binding as { adapter?: unknown }).adapter !== "parameter") {
    return "";
  }
  const mapping = (binding as { value_mapping?: unknown }).value_mapping;
  if (!mapping || typeof mapping !== "object") {
    return "";
  }
  const { node, parameter } = mapping as { node?: unknown; parameter?: unknown };
  return typeof node === "string" && typeof parameter === "string" ? `${node}:${parameter}` : "";
}

/** True when this widget contributes to the composed twist, which is what the teleop list governs. */
function resolveTeleopAdapter(settings: Record<string, unknown>): boolean {
  const binding = settings.runtime_binding;
  return Boolean(binding && typeof binding === "object" && (binding as { adapter?: unknown }).adapter === "teleop");
}
