import { CommandLikeWidget, LabelWidget, ToggleWidget } from "./action-renderers";
import { CameraWidget } from "./camera-renderer";
import { JoystickWidget, SliderWidget } from "./control-renderers";
import { TopicDebugWidget } from "./debug-renderers";
import { PlaceholderWidget } from "./fallback-renderers";
import type { WidgetRendererRegistration } from "./types";

export const DEFAULT_WIDGET_RENDERERS: readonly WidgetRendererRegistration[] = [
  { kind: "button", render: CommandLikeWidget },
  { kind: "command-button", render: CommandLikeWidget },
  { kind: "label", render: LabelWidget },
  { kind: "toggle", render: ToggleWidget },
  { kind: "slider", render: SliderWidget },
  { kind: "joystick", render: JoystickWidget },
  { kind: "camera", render: CameraWidget },
  { kind: "gauge", render: PlaceholderWidget },
  { kind: "plot", render: PlaceholderWidget },
  { kind: "topic-echo", render: TopicDebugWidget },
  { kind: "topic-plot", render: TopicDebugWidget },
  { kind: "unknown", render: PlaceholderWidget },
];
