import type { ApplicationConfig, WidgetConfig } from "@bloom/api-client";
import { asRecord, INTERACTIVE_WIDGET_KINDS, resolveDeviceClass, resolveWidgetDestination } from "@bloom/widgets";
import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { guidedTourProgressKey, useGuidedTourProgress } from "../ui/guided-tour-progress";
import {
  densityFloorFor,
  findUndersizedWidgets,
  glassPx,
  resolveBuilderPanel,
  reviewScreens,
} from "./builder-geometry";

type ReviewRuleId = "minimum" | "symmetry" | "pads" | "profiles" | "pairs";
type BuilderTourStepId = "geometry" | "touch" | ReviewRuleId | "frame" | "topics" | "profile" | "ship";

type BuilderGuidedTourProps = {
  application: ApplicationConfig;
  onClose: () => void;
  onOpenConfiguration: () => void;
  onOpenScreenBuilder: (selection: WorkspaceSelection) => void;
  onPreviewRuntime: (selection: WorkspaceSelection) => void;
  selection: WorkspaceSelection;
  /** Other apps in the configuration, for the paired-app policy check. */
  siblings?: readonly ApplicationConfig[];
};

type BuilderTourStep = {
  action: string;
  complete: boolean;
  detail: string;
  id: BuilderTourStepId;
  title: string;
  why: string;
};

const PANEL_PRESETS = new Set(["full-hd", "hd", "native-1280x720"]);
const NO_SIBLINGS: readonly ApplicationConfig[] = [];

export function BuilderGuidedTour({
  application,
  onClose,
  onOpenConfiguration,
  onOpenScreenBuilder,
  onPreviewRuntime,
  selection,
  siblings = NO_SIBLINGS,
}: BuilderGuidedTourProps) {
  const firstScreen = application.screens[0];
  const tourKey = guidedTourProgressKey("builder", selection.configId, selection.appId);
  const { completedStepIds, completeStep } = useGuidedTourProgress(tourKey);
  const checks = useMemo(() => evaluateBuilderTour(application, siblings), [application, siblings]);
  const topicProblem = useMemo(() => findFirstTopicProblem(application), [application]);
  const touchProblem = useMemo(() => findTouchProblem(application), [application]);
  const steps = useMemo(
    () =>
      createBuilderTourSteps(
        application,
        checks,
        completedStepIds,
        Boolean(firstScreen),
        topicProblem,
        touchProblem,
        siblings,
      ),
    [application, checks, completedStepIds, firstScreen, siblings, topicProblem, touchProblem],
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
  const undersizedScreen = application.screens.find((screen) => findUndersizedWidgets(screen).length > 0);
  const problemScreenId =
    activeStep.id === "topics"
      ? topicProblem?.screen.id
      : activeStep.id === "touch"
        ? touchProblem?.kind === "empty"
          ? undefined
          : touchProblem?.screen.id
        : activeStep.id === "minimum"
          ? undersizedScreen?.id
          : undefined;
  const activeScreenSelection = problemScreenId ? { ...selection, screenId: problemScreenId } : screenSelection;

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
                  if (activeStep.id === "frame" || activeStep.id === "profiles" || activeStep.id === "pairs") {
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
  siblings: readonly ApplicationConfig[] = [],
): Record<Exclude<BuilderTourStepId, "ship">, boolean> {
  const rules = Object.fromEntries(reviewScreens(application, siblings).map((rule) => [rule.id, rule.passed]));
  const destinations = collectWidgetDestinations(application);

  return {
    // native-1280x720 and hd are the same tablet panel; full-hd is the desktop one.
    geometry:
      application.screens.length > 0 &&
      application.screens.every((screen) => PANEL_PRESETS.has(screen.canvas.preset_id)),
    // Measured on the glass: the target inside each control, at the class's smallest panel.
    touch: findTouchProblem(application) === null,
    minimum: rules.minimum === true,
    symmetry: rules.symmetry === true,
    pads: rules.pads === true,
    profiles: rules.profiles === true,
    pairs: rules.pairs === true,
    // Empty is a choice too: the manager reads the command in its default input frame, base_link.
    frame: true,
    topics:
      destinations.length > 0 &&
      destinations.every(({ destination, widget }) => isTopicDestinationAllowed(application, widget, destination)),
    profile: application.profiles.length > 0,
  };
}

const REVIEW_RULE_WHY: Record<ReviewRuleId, string> = {
  minimum: "A card smaller than its content grows past its slot and covers the next control.",
  symmetry: "Controls of one kind side by side read as a group only when they match.",
  pads: "Two pads at different sizes or heights ask the hand to relearn each one.",
  profiles: "A role that names a missing screen opens the wrong layout for the person using it.",
  pairs: "A tablet and desktop app that publish differently make a bench test say nothing about the operator.",
};

function createBuilderTourSteps(
  application: ApplicationConfig,
  checks: ReturnType<typeof evaluateBuilderTour>,
  completedStepIds: readonly string[],
  hasScreen: boolean,
  topicProblem: WidgetTopicProblem | null,
  touchProblem: WidgetTouchProblem | null,
  siblings: readonly ApplicationConfig[] = [],
): BuilderTourStep[] {
  const stepDefinitions: BuilderTourStep[] = [
    {
      id: "geometry",
      title: "Start from the panel, not the desktop",
      detail: checks.geometry
        ? "Every screen uses a panel preset: 1280×720 for tablet, 1920×1080 for desktop."
        : "Set each screen to the 1280×720 tablet panel, or 1920×1080 for a desktop app.",
      why: "Authoring at another size can scale controls down on the installed display.",
      action: "Open screen geometry",
      complete: checks.geometry,
    },
    {
      id: "touch",
      title: "Place controls, watch the bounds",
      detail:
        touchProblem === null
          ? "Every control's target meets the 44 px floor on the glass of the smallest panel, and none overlap."
          : describeTouchProblem(touchProblem),
      why: "Touch checks belong in the authoring loop, before the app reaches the lab.",
      action: "Inspect control bounds",
      complete: checks.touch,
    },
    ...reviewScreens(application, siblings).map(
      (rule): BuilderTourStep => ({
        id: rule.id as ReviewRuleId,
        title: rule.title,
        detail: rule.detail,
        why: REVIEW_RULE_WHY[rule.id as ReviewRuleId],
        action: rule.id === "profiles" || rule.id === "pairs" ? "Open app configuration" : "Open screen builder",
        complete: rule.passed,
      }),
    ),
    {
      id: "frame",
      title: "Say which way is forward",
      detail: application.runtime_policy.command_frame_id
        ? `Operator commands use ${application.runtime_policy.command_frame_id}.`
        : "Operator commands use the manager's default frame, base_link. Pick another in Adapter guardrails if the arm is mounted sideways.",
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
    if (["geometry", "touch", "minimum", "symmetry", "pads", "topics", "profile"].includes(step.id)) {
      return hasScreen && (step.id !== "profile" || checks.profile);
    }
    return true;
  });
}

type TourScreen = ApplicationConfig["screens"][number];

type WidgetTopicProblem = {
  destination: NonNullable<ReturnType<typeof resolveWidgetDestination>>;
  screen: TourScreen;
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
  // As the backend narrows: an empty teleop list allows none, an empty publish list defers to the deployment.
  return runtimeBinding.adapter === "teleop"
    ? allowlistAllows(application.runtime_policy.allowed_teleop_targets, destination.topic)
    : application.runtime_policy.allowed_publish_topics.length === 0 ||
        allowlistAllows(application.runtime_policy.allowed_publish_topics, destination.topic);
}

function allowlistAllows(allowlist: readonly string[], topic: string): boolean {
  return allowlist.some(
    (entry) => entry === "*" || entry === topic || (entry.endsWith("/") && topic.startsWith(entry)),
  );
}

/** The three ways the touch step fails, each carrying what it takes to name the offender. */
type WidgetTouchProblem =
  | { kind: "empty" }
  | { floor: number; glass: number; kind: "small"; screen: TourScreen; widget: WidgetConfig }
  | { kind: "overlap"; other: WidgetConfig; screen: TourScreen; widget: WidgetConfig };

function findTouchProblem(application: ApplicationConfig): WidgetTouchProblem | null {
  const controlsOn = (screen: TourScreen) =>
    screen.widgets.filter((widget) => INTERACTIVE_WIDGET_KINDS.has(widget.kind));
  if (!application.screens.some((screen) => controlsOn(screen).length > 0)) {
    return { kind: "empty" };
  }

  for (const screen of application.screens) {
    const { glassScale } = resolveBuilderPanel(screen);
    const controls = controlsOn(screen);
    // The floor the inspector and the settings summary use: a desktop screen is clicked, not touched.
    const floor = densityFloorFor(resolveDeviceClass(screen));
    const small = controls.find((widget) => glassPx(widget, glassScale) < floor);
    if (small) {
      return { floor, glass: glassPx(small, glassScale), kind: "small", screen, widget: small };
    }
    const overlap = findInteractiveOverlap(controls);
    if (overlap) {
      return { kind: "overlap", other: overlap[1], screen, widget: overlap[0] };
    }
  }
  return null;
}

function describeTouchProblem(problem: WidgetTouchProblem): string {
  if (problem.kind === "empty") {
    return "No control has been placed yet, so there is no target to measure.";
  }
  if (problem.kind === "small") {
    return `${problem.widget.title} on ${problem.screen.title} is ${problem.glass} px on the glass, needs ${problem.floor}.`;
  }
  return `${problem.widget.title} overlaps ${problem.other.title} on ${problem.screen.title}.`;
}

function findInteractiveOverlap(controls: readonly WidgetConfig[]): [WidgetConfig, WidgetConfig] | null {
  for (const [index, left] of controls.entries()) {
    for (const right of controls.slice(index + 1)) {
      const leftRight = left.layout.x + left.layout.width;
      const rightRight = right.layout.x + right.layout.width;
      const leftBottom = left.layout.y + left.layout.height;
      const rightBottom = right.layout.y + right.layout.height;
      if (
        left.layout.x < rightRight &&
        leftRight > right.layout.x &&
        left.layout.y < rightBottom &&
        leftBottom > right.layout.y
      ) {
        return [left, right];
      }
    }
  }
  return null;
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
