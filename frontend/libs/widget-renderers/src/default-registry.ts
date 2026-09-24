import { CommandLikeWidget, LabelWidget, ToggleWidget } from "./action-renderers";
import { CameraWidget } from "./camera-renderer";
import { TopicDebugWidget } from "./debug-renderers";
import { JacobianWidget, JointTableWidget } from "./debug-table-renderers";
import { EventLogWidget, GaugeWidget, PlotWidget } from "./display-renderers";
import { PlaceholderWidget } from "./fallback-renderers";
import { GesturePadWidget } from "./gesture-pad-renderer";
import { JoystickWidget } from "./joystick-renderer";
import { PlotBoardWidget, PlotPickerWidget, ValueStripWidget } from "./plot-board-renderer";
import { PositionLibraryWidget } from "./position-library-renderer";
import { Robot3dWidget } from "./robot-3d-renderer";
import { SliderWidget } from "./slider-renderer";
import type { WidgetRendererRegistration } from "./types";

export const DEFAULT_WIDGET_RENDERERS: readonly WidgetRendererRegistration[] = [
  { kind: "command-button", render: CommandLikeWidget },
  { kind: "event-log", render: EventLogWidget },
  { kind: "label", render: LabelWidget },
  { kind: "toggle", render: ToggleWidget },
  { kind: "slider", render: SliderWidget },
  { kind: "joystick", render: JoystickWidget },
  { kind: "camera", render: CameraWidget },
  { kind: "gauge", render: GaugeWidget },
  { kind: "gesture-pad", render: GesturePadWidget },
  { kind: "jacobian", render: JacobianWidget },
  { kind: "joint-table", render: JointTableWidget },
  { kind: "plot", render: PlotWidget },
  { kind: "plot-board", render: PlotBoardWidget },
  { kind: "plot-picker", render: PlotPickerWidget },
  { kind: "position-library", render: PositionLibraryWidget },
  { kind: "robot-3d", render: Robot3dWidget },
  { kind: "topic-echo", render: TopicDebugWidget },
  { kind: "topic-plot", render: TopicDebugWidget },
  { kind: "unknown", render: PlaceholderWidget },
  { kind: "value-strip", render: ValueStripWidget },
];
