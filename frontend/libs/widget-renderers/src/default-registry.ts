import { CommandLikeWidget, LabelWidget, ToggleWidget } from "./action-renderers";
import { CameraWidget } from "./camera-renderer";
import { JoystickWidget, SliderWidget } from "./control-renderers";
import { TopicDebugWidget } from "./debug-renderers";
import { GaugeWidget, PlotWidget, Robot3dWidget } from "./display-renderers";
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
  { kind: "gauge", render: GaugeWidget },
  { kind: "plot", render: PlotWidget },
  { kind: "robot-3d", render: Robot3dWidget },
  { kind: "topic-echo", render: TopicDebugWidget },
  { kind: "topic-plot", render: TopicDebugWidget },
  { kind: "unknown", render: PlaceholderWidget },
];
