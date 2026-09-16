import type { ApplicationConfig, WidgetConfig } from "@bloom/api-client";
import { resolveWidgetDestination } from "@bloom/widgets";
import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { guidedTourProgressKey, useGuidedTourProgress } from "../ui/guided-tour-progress";

type BuilderTourStepId = "geometry" | "touch" | "frame" | "topics" | "profile" | "ship";

type BuilderGuidedTourProps = {
  application: ApplicationConfig;
  onClose: () => void;
  onOpenConfiguration: () => void;
  onOpenScreenBuilder: (selection: WorkspaceSelection) => void;
  onPreviewRuntime: (selection: WorkspaceSelection) => void;
  selection: WorkspaceSelection;
};

type BuilderTourStep = {
  action: string;
  complete: boolean;
  detail: string;
  id: BuilderTourStepId;
  title: string;
  why: string;
};

const INTERACTIVE_WIDGET_KINDS = new Set(["command-button", "gesture-pad", "joystick", "slider", "toggle"]);

export function BuilderGuidedTour({
  application,
  onClose,
  onOpenConfiguration,
  onOpenScreenBuilder,
  onPreviewRuntime,
  selection,
}: BuilderGuidedTourProps) {
  const firstScreen = application.screens[0];
  const tourKey = guidedTourProgressKey("builder", selection.configId, selection.appId);
  const { completedStepIds, completeStep } = useGuidedTourProgress(tourKey);
  const checks = useMemo(() => evaluateBuilderTour(application), [application]);
  const topicProblem = useMemo(() => findFirstTopicProblem(application), [application]);
  const steps = useMemo(
    () => createBuilderTourSteps(application, checks, completedStepIds, Boolean(firstScreen), topicProblem),
    [application, checks, completedStepIds, firstScreen, topicProblem],
  );
  const [activeStepId, setActiveStepId] = useState<BuilderTourStepId>(
    () => steps.find((step) => !step.complete)?.id ?? steps[0]?.id ?? "ship",
  );
  const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0];
  const completedCount = steps.filter((step) => step.complete).length;

  useEffect(() => {
    for (const [stepId, complete] of Object.entries(checks)) {
      if (complete && stepId !== "profile") {
        completeStep(stepId);
      }
    }
  }, [checks, completeStep]);

  if (!activeStep) {
    return null;
  }

  const screenSelection = firstScreen ? { ...selection, screenId: firstScreen.id } : selection;
  const activeScreenSelection =
    activeStep.id === "topics" && topicProblem ? { ...selection, screenId: topicProblem.screen.id } : screenSelection;

  return (
    <section className="builder-guided-tour" aria-label="Builder review checklist">
      <header className="builder-tour-header">
        <div>
          <p className="eyebrow">Builder review</p>
          <h1>{application.name}</h1>
        </div>
        <button aria-label="Close builder review" onClick={onClose} title="Close builder review" type="button">
          ×
        </button>
      </header>

      <div className="builder-tour-body">
        <nav aria-label="Builder review steps" className="builder-tour-rail">
          {steps.map((step, index) => (
            <button
              aria-current={activeStep.id === step.id ? "step" : undefined}
              className="builder-tour-step"
              key={step.id}
              onClick={() => setActiveStepId(step.id)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.title}</strong>
              <span aria-hidden="true">{step.complete ? "✓" : ""}</span>
              {step.complete ? <span className="sr-only">Complete</span> : null}
            </button>
          ))}
        </nav>

        <main className="builder-tour-main">
          <div
            aria-label={`${completedCount} of ${steps.length} builder checks complete`}
            aria-valuemax={steps.length}
            aria-valuemin={0}
            aria-valuenow={completedCount}
            className="builder-tour-progress"
            role="progressbar"
          >
            <span style={{ transform: `scaleX(${steps.length > 0 ? completedCount / steps.length : 0})` }} />
          </div>
          <article className="builder-tour-panel">
            <div>
              <p className="eyebrow">{activeStep.complete ? "Check passed" : "Action required"}</p>
              <h2>{activeStep.title}</h2>
              <p>{activeStep.detail}</p>
            </div>
            <aside>
              <strong>Why this matters</strong>
              <p>{activeStep.why}</p>
            </aside>
            <div className="builder-tour-action">
              <button
                onClick={() => {
                  if (activeStep.id === "ship") {
                    downloadApplication(application);
                    completeStep("ship");
                    return;
                  }
                  if (activeStep.id === "frame") {
                    onOpenConfiguration();
                    return;
                  }
                  if (activeStep.id === "profile") {
                    completeStep("profile");
                    onPreviewRuntime(activeScreenSelection);
                    return;
                  }
                  onOpenScreenBuilder(activeScreenSelection);
                }}
                type="button"
              >
                {activeStep.complete && activeStep.id !== "ship" ? "Review again" : activeStep.action}
              </button>
            </div>
          </article>
        </main>
      </div>
    </section>
  );
}

export function evaluateBuilderTour(
  application: ApplicationConfig,
): Record<Exclude<BuilderTourStepId, "ship">, boolean> {
  const interactiveWidgets = application.screens.flatMap((screen) =>
    screen.widgets.filter((widget) => INTERACTIVE_WIDGET_KINDS.has(widget.kind)),
  );
  const destinations = collectWidgetDestinations(application);

  return {
    geometry:
      application.screens.length > 0 &&
      application.screens.every((screen) => screen.canvas.preset_id === "native-1280x720"),
    touch:
      interactiveWidgets.length > 0 &&
      interactiveWidgets.every((widget) => widget.layout.width >= 44 && widget.layout.height >= 44) &&
      application.screens.every((screen) => !hasInteractiveOverlap(screen.widgets)),
    frame: Boolean(application.runtime_policy.command_frame_id),
    topics:
      destinations.length > 0 &&
      destinations.every(({ destination, widget }) => isTopicDestinationAllowed(application, widget, destination)),
    profile: application.profiles.length > 0,
  };
}

function createBuilderTourSteps(
  application: ApplicationConfig,
  checks: ReturnType<typeof evaluateBuilderTour>,
  completedStepIds: readonly string[],
  hasScreen: boolean,
  topicProblem: WidgetTopicProblem | null,
): BuilderTourStep[] {
  const stepDefinitions: BuilderTourStep[] = [
    {
      id: "geometry",
      title: "Start from the panel, not the desktop",
      detail: checks.geometry
        ? "Every screen uses the native 1280x720 panel geometry."
        : "Set each screen to native 1280x720 in the screen builder.",
      why: "Authoring at another size can scale controls down on the installed display.",
      action: "Open screen geometry",
      complete: checks.geometry,
    },
    {
      id: "touch",
      title: "Place controls, watch the bounds",
      detail: checks.touch
        ? "Interactive widget frames meet the 44 px floor and do not overlap."
        : "A control is too small, overlaps another control, or no control has been placed yet.",
      why: "Touch checks belong in the authoring loop, before the app reaches the lab.",
      action: "Inspect control bounds",
      complete: checks.touch,
    },
    {
      id: "frame",
      title: "Say which way is forward",
      detail: checks.frame
        ? `Operator commands use ${application.runtime_policy.command_frame_id}.`
        : "Choose an explicit Cartesian command frame in Adapter guardrails.",
      why: "A robot base frame may not match forward for the person operating a side-mounted arm.",
      action: "Open adapter guardrails",
      complete: checks.frame,
    },
    {
      id: "topics",
      title: "Bind to allowed topics",
      detail: checks.topics
        ? "Every modeled widget destination is present in the matching app policy."
        : topicProblem
          ? `${topicProblem.widget.title} on ${topicProblem.screen.title} has no topic or its destination is absent from the matching app policy.`
          : "Add a widget with a modeled data destination before reviewing topic policy.",
      why: "The builder and runtime must agree on where data flows before the robot is connected.",
      action: "Inspect widget bindings",
      complete: checks.topics,
    },
    {
      id: "profile",
      title: "Test as the person, not as you",
      detail: checks.profile
        ? `${application.profiles.length} operator profile${application.profiles.length === 1 ? " is" : "s are"} available for preview.`
        : "This app has no executable operator profile to preview.",
      why: "The motor and display profile can change whether a control is reachable at all.",
      action: "Open profile preview",
      complete: checks.profile && completedStepIds.includes("profile"),
    },
    {
      id: "ship",
      title: "Ship it to the tablet",
      detail: "Export the reviewed application JSON for the tracked seed and SQLite publish workflow.",
      why: "The tablet should run the same reviewed bundle that the repository and deployment store share.",
      action: "Export reviewed app",
      complete: completedStepIds.includes("ship"),
    },
  ];

  return stepDefinitions.filter((step) => {
    if (["geometry", "touch", "topics", "profile"].includes(step.id)) {
      return hasScreen && (step.id !== "profile" || checks.profile);
    }
    return true;
  });
}

type WidgetTopicProblem = {
  destination: NonNullable<ReturnType<typeof resolveWidgetDestination>>;
  screen: ApplicationConfig["screens"][number];
  widget: WidgetConfig;
};

function collectWidgetDestinations(application: ApplicationConfig): WidgetTopicProblem[] {
  return application.screens.flatMap((screen) =>
    screen.widgets.flatMap((widget) => {
      const destination = resolveWidgetDestination(widget.kind, widget.settings);
      return destination ? [{ destination, screen, widget }] : [];
    }),
  );
}

function findFirstTopicProblem(application: ApplicationConfig): WidgetTopicProblem | null {
  return (
    collectWidgetDestinations(application).find(
      ({ destination, widget }) => !isTopicDestinationAllowed(application, widget, destination),
    ) ?? null
  );
}

function isTopicDestinationAllowed(
  application: ApplicationConfig,
  widget: WidgetConfig,
  destination: NonNullable<ReturnType<typeof resolveWidgetDestination>>,
): boolean {
  if (!destination.topic) {
    return false;
  }
  if (destination.direction === "reads") {
    return true;
  }
  const runtimeBinding = asRecord(widget.settings.runtime_binding);
  return runtimeBinding.adapter === "teleop"
    ? application.runtime_policy.allowed_teleop_targets.includes(destination.topic)
    : application.runtime_policy.allowed_publish_topics.includes(destination.topic);
}

function hasInteractiveOverlap(widgets: readonly WidgetConfig[]): boolean {
  const interactive = widgets.filter((widget) => INTERACTIVE_WIDGET_KINDS.has(widget.kind));
  return interactive.some((left, index) =>
    interactive.slice(index + 1).some((right) => {
      const leftRight = left.layout.x + left.layout.width;
      const rightRight = right.layout.x + right.layout.width;
      const leftBottom = left.layout.y + left.layout.height;
      const rightBottom = right.layout.y + right.layout.height;
      return (
        left.layout.x < rightRight &&
        leftRight > right.layout.x &&
        left.layout.y < rightBottom &&
        leftBottom > right.layout.y
      );
    }),
  );
}

function downloadApplication(application: ApplicationConfig): void {
  const blob = new Blob([`${JSON.stringify(application, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = `${application.id}.json`;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
