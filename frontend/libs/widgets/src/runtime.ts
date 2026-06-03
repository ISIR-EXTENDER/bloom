import type { WidgetConfig, WidgetKind } from "@bloom/api-client";
import { normalizeWidgetSettings } from "./settings";

export type ToggleState = "off" | "on";

export type Vector2Value = {
  x: number;
  y: number;
};

export type RuntimeActionFeedbackMode = "none" | "progress" | "result";

export type RuntimeActionContract = {
  actionId: string;
  cancellable: boolean;
  expectedFeedback: RuntimeActionFeedbackMode;
  label: string;
};

export type RuntimeActionProgress = {
  current?: number;
  detail?: string;
  percent?: number;
  total?: number;
};

export type RuntimeActionLifecycleStatus =
  | "accepted"
  | "cancel-requested"
  | "cancelled"
  | "failed"
  | "progress"
  | "running"
  | "succeeded";

export type RuntimeActionLifecycleEvent = {
  actionId: string;
  detail?: string;
  progress?: RuntimeActionProgress;
  status: RuntimeActionLifecycleStatus;
  widgetId?: string;
};

export type RuntimeActionCancelIntent = {
  actionId: string;
  reason?: string;
  type: "action-cancel";
  widgetId?: string;
};

export type WidgetActionEvent =
  | {
      type: "press";
    }
  | {
      nextState: ToggleState;
      type: "toggle";
    }
  | {
      type: "set-value";
      value: number;
    }
  | {
      type: "set-vector";
      value: Vector2Value;
    };

export type WidgetActionIntent =
  | {
      action?: RuntimeActionContract;
      command: string;
      type: "command";
      widgetId: string;
      widgetKind: WidgetKind;
    }
  | {
      messageType?: string;
      nextState?: ToggleState;
      payload: unknown;
      payloadText?: string;
      topic: string;
      type: "topic-publish";
      widgetId: string;
      widgetKind: WidgetKind;
    }
  | {
      nextState: ToggleState;
      payload: unknown;
      type: "toggle-state";
      value: boolean;
      widgetId: string;
      widgetKind: WidgetKind;
    }
  | {
      binding?: string;
      modeId?: string;
      publishRateHz?: number;
      runtimeBinding?: unknown;
      type: "value-change";
      value: number | Vector2Value;
      widgetId: string;
      widgetKind: WidgetKind;
      zeroOnRelease?: boolean;
    }
  | {
      eventType: WidgetActionEvent["type"];
      reason: string;
      type: "unsupported";
      widgetId: string;
      widgetKind: WidgetKind;
    };

export function createWidgetActionIntent(widget: WidgetConfig, event: WidgetActionEvent): WidgetActionIntent {
  const normalizedSettings = normalizeWidgetSettings(widget.kind, widget.settings);
  if (!normalizedSettings.success) {
    return createUnsupportedIntent(
      widget,
      event,
      `Invalid widget settings: ${normalizedSettings.errors.map((error) => `${error.field}: ${error.message}`).join("; ")}`,
    );
  }

  if (widget.kind === "button" || widget.kind === "command-button") {
    return createCommandLikeIntent(widget, event, normalizedSettings.settings);
  }
  if (widget.kind === "toggle") {
    return createToggleIntent(widget, event, normalizedSettings.settings);
  }
  if (widget.kind === "slider") {
    return createScalarInputIntent(widget, event, normalizedSettings.settings);
  }
  if (widget.kind === "joystick") {
    return createVectorInputIntent(widget, event, normalizedSettings.settings);
  }
  return createUnsupportedIntent(widget, event, `Widget kind "${widget.kind}" does not produce runtime actions.`);
}

function createCommandLikeIntent(
  widget: WidgetConfig,
  event: WidgetActionEvent,
  settings: Record<string, unknown>,
): WidgetActionIntent {
  if (event.type !== "press") {
    return createUnsupportedIntent(widget, event, `Widget kind "${widget.kind}" only supports press actions.`);
  }

  const topic = getOptionalString(settings, "topic");
  if (topic) {
    return createTopicPublishIntent(widget, topic, {
      messageType: getOptionalString(settings, "messageType"),
      payload: resolveCommandPayload(settings),
    });
  }

  const command = getOptionalString(settings, "command");
  if (!command) {
    return createUnsupportedIntent(widget, event, `Widget "${widget.id}" has no command or topic configured.`);
  }

  const action = createRuntimeActionContract(widget, settings, command);
  return {
    type: "command",
    widgetId: widget.id,
    widgetKind: widget.kind,
    command,
    ...(action ? { action } : {}),
  };
}

function createToggleIntent(
  widget: WidgetConfig,
  event: WidgetActionEvent,
  settings: Record<string, unknown>,
): WidgetActionIntent {
  if (event.type !== "toggle") {
    return createUnsupportedIntent(widget, event, `Widget kind "${widget.kind}" only supports toggle actions.`);
  }

  const payload = event.nextState === "on" ? settings.onPayload : settings.offPayload;
  const topic = getOptionalString(settings, "topic");
  if (topic) {
    return createTopicPublishIntent(widget, topic, {
      messageType: getOptionalString(settings, "messageType"),
      nextState: event.nextState,
      payload,
    });
  }

  return {
    type: "toggle-state",
    widgetId: widget.id,
    widgetKind: widget.kind,
    nextState: event.nextState,
    value: event.nextState === "on",
    payload,
  };
}

function createScalarInputIntent(
  widget: WidgetConfig,
  event: WidgetActionEvent,
  settings: Record<string, unknown>,
): WidgetActionIntent {
  if (event.type !== "set-value") {
    return createUnsupportedIntent(widget, event, `Widget kind "${widget.kind}" only supports scalar value actions.`);
  }

  return {
    type: "value-change",
    widgetId: widget.id,
    widgetKind: widget.kind,
    value: event.value,
    binding: getOptionalString(settings, "binding"),
  };
}

function createVectorInputIntent(
  widget: WidgetConfig,
  event: WidgetActionEvent,
  settings: Record<string, unknown>,
): WidgetActionIntent {
  if (event.type !== "set-vector") {
    return createUnsupportedIntent(widget, event, `Widget kind "${widget.kind}" only supports vector value actions.`);
  }

  return {
    type: "value-change",
    widgetId: widget.id,
    widgetKind: widget.kind,
    value: event.value,
    binding: getOptionalString(settings, "binding"),
    modeId: getOptionalString(settings, "mode_id"),
    publishRateHz: getOptionalNumber(settings, "publish_rate_hz"),
    runtimeBinding: settings.runtime_binding,
    zeroOnRelease: getOptionalBoolean(settings, "zero_on_release"),
  };
}

function createTopicPublishIntent(
  widget: WidgetConfig,
  topic: string,
  options: {
    messageType?: string;
    nextState?: ToggleState;
    payload: unknown;
  },
): WidgetActionIntent {
  return {
    type: "topic-publish",
    widgetId: widget.id,
    widgetKind: widget.kind,
    topic,
    messageType: options.messageType,
    nextState: options.nextState,
    payload: options.payload,
    payloadText: typeof options.payload === "string" ? options.payload : undefined,
  };
}

function createUnsupportedIntent(widget: WidgetConfig, event: WidgetActionEvent, reason: string): WidgetActionIntent {
  return {
    type: "unsupported",
    widgetId: widget.id,
    widgetKind: widget.kind,
    eventType: event.type,
    reason,
  };
}

function createRuntimeActionContract(
  widget: WidgetConfig,
  settings: Record<string, unknown>,
  command: string,
): RuntimeActionContract | undefined {
  const actionId = getOptionalString(settings, "action_id");
  const expectedFeedback = getRuntimeActionFeedbackMode(settings.action_feedback);
  const cancellable = getOptionalBoolean(settings, "cancellable") ?? false;

  if (!actionId && expectedFeedback === "none" && !cancellable) {
    return undefined;
  }

  return {
    actionId: actionId ?? `${widget.id}:${command}`,
    cancellable,
    expectedFeedback,
    label: getOptionalString(settings, "action_label") ?? widget.title,
  };
}

function resolveCommandPayload(settings: Record<string, unknown>): unknown {
  if ("payload" in settings) {
    return settings.payload;
  }
  return getOptionalString(settings, "command") ?? "";
}

function getRuntimeActionFeedbackMode(value: unknown): RuntimeActionFeedbackMode {
  return typeof value === "string" && ["none", "progress", "result"].includes(value)
    ? (value as RuntimeActionFeedbackMode)
    : "none";
}

function getOptionalString(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function getOptionalNumber(settings: Record<string, unknown>, key: string): number | undefined {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getOptionalBoolean(settings: Record<string, unknown>, key: string): boolean | undefined {
  const value = settings[key];
  return typeof value === "boolean" ? value : undefined;
}
