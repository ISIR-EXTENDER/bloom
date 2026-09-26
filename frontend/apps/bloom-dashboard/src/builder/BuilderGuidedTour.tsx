import type { ApplicationConfig, WidgetConfig } from "@bloom/api-client";
import { allowlistAllows, INTERACTIVE_WIDGET_KINDS, resolveDeviceClass } from "@bloom/widgets";
import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { guidedTourProgressKey, useGuidedTourProgress } from "../ui/guided-tour-progress";
import { densityFloorFor, glassPx, resolveBuilderPanel, reviewScreens } from "./builder-geometry";
import { resolveWidgetRoute, type WidgetRoute } from "./widget-publish-route";

type ReviewRuleId = "minimum" | "overlap" | "device-class" | "symmetry" | "pads" | "profiles" | "pairs";
type BuilderTourStepId = "geometry" | "touch" | ReviewRuleId | "frame" | "topics" | "profile" | "ship";

type BuilderGuidedTourProps = {
  application: ApplicationConfig;
  onClose: () => void;
  onOpenConfiguration: () => void;
  /** Builder Home, where the app card's Share button writes the file the team gets. */
  onOpenHome?: () => void;
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
  onOpenHome,
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
  const problemScreenId =
    activeStep.id === "topics"
      ? topicProblem?.screen.id
      : activeStep.id === "touch"
        ? touchProblem?.kind === "empty"
          ? undefined
          : touchProblem?.screen.id
        : findRuleProblemScreenId(application, activeStep.id, siblings);
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
              {activeStep.id === "ship" && onOpenHome ? (
                <button
                  onClick={() => {
                    completeStep("ship");
                    onOpenHome();
                  }}
                  type="button"
                >
                  {activeStep.action}
                </button>
              ) : null}
              <button
                className={activeStep.id === "ship" && onOpenHome ? "builder-tour-secondary-action" : undefined}
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
                {activeStep.id === "ship"
                  ? "Download app JSON"
                  : activeStep.complete
                    ? "Review again"
                    : activeStep.action}
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
    overlap: rules.overlap === true,
    "device-class": rules["device-class"] === true,
    symmetry: rules.symmetry === true,
    pads: rules.pads === true,
    profiles: rules.profiles === true,
    pairs: rules.pairs === true,
    // Empty is a choice too: the manager reads the command in its default input frame, base_link.
    frame: true,
    topics: destinations.length > 0 && destinations.every(({ route }) => isTopicDestinationAllowed(application, route)),
    profile: application.profiles.length > 0,
  };
}

const REVIEW_RULE_WHY: Record<ReviewRuleId, string> = {
  minimum: "A card smaller than its content grows past its slot and covers the next control.",
  overlap: "A widget under another cannot be pressed or read, however right its settings are.",
  "device-class": "A desktop-only widget on a tablet screen does not render for the person holding the tablet.",
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
      detail:
        "Save, then press Share on this app's card in Builder home: it writes the file the team gets on clone. Commit that file afterwards.",
      why: "The tablet should run the same reviewed app that the repository ships, not a copy on one machine.",
      action: "Go to Share on Builder home",
      complete: completedStepIds.includes("ship"),
    },
  ];

  return stepDefinitions.filter((step) => {
    if (
      ["geometry", "touch", "minimum", "overlap", "device-class", "symmetry", "pads", "topics", "profile"].includes(
        step.id,
      )
    ) {
      return hasScreen && (step.id !== "profile" || checks.profile);
    }
    return true;
  });
}

type TourScreen = ApplicationConfig["screens"][number];

const SCREEN_RULE_IDS = new Set<string>(["minimum", "overlap", "device-class", "symmetry", "pads"]);

/** The first screen that fails this step, so its action opens the offender rather than the first screen. */
function findRuleProblemScreenId(
  application: ApplicationConfig,
  stepId: BuilderTourStepId,
  siblings: readonly ApplicationConfig[],
): string | undefined {
  if (stepId === "geometry") {
    return application.screens.find((screen) => !PANEL_PRESETS.has(screen.canvas.preset_id))?.id;
  }
  if (!SCREEN_RULE_IDS.has(stepId)) {
    return undefined;
  }
  return application.screens.find(
    (screen) =>
      reviewScreens({ ...application, screens: [screen] }, siblings).find((rule) => rule.id === stepId)?.passed ===
      false,
  )?.id;
}

type WidgetTopicProblem = {
  route: WidgetRoute;
  screen: TourScreen;
  widget: WidgetConfig;
};

function collectWidgetDestinations(application: ApplicationConfig): WidgetTopicProblem[] {
  return application.screens.flatMap((screen) =>
    screen.widgets.flatMap((widget) => {
      const route = resolveWidgetRoute(widget, application.action_presets);
      return route ? [{ route, screen, widget }] : [];
    }),
  );
}

function findFirstTopicProblem(application: ApplicationConfig): WidgetTopicProblem | null {
  return (
    collectWidgetDestinations(application).find(({ route }) => !isTopicDestinationAllowed(application, route)) ?? null
  );
}

function isTopicDestinationAllowed(application: ApplicationConfig, route: WidgetRoute): boolean {
  const { destination } = route;
  if (!destination.topic) {
    return false;
  }
  if (destination.direction === "reads") {
    return true;
  }
  const policy = application.runtime_policy;
  // A service-call preset is allowed by the service list, which an app naming none leaves empty.
  if (route.service) {
    return allowlistAllows(policy.allowed_service_calls ?? [], route.service);
  }
  // A parameter is allowed by name, and an app that names none tunes none, as the backend narrows it.
  if (route.parameter) {
    return allowlistAllows(policy.allowed_parameters ?? [], route.parameter);
  }
  // As the backend narrows: an empty teleop list allows none, an empty publish or type list defers to the deployment.
  if (route.teleop) {
    return allowlistAllows(policy.allowed_teleop_targets, destination.topic);
  }
  const allows = (list: readonly string[], value: string | null) =>
    list.length === 0 || (value !== null && allowlistAllows(list, value));
  return (
    allows(policy.allowed_publish_topics, destination.topic) && allows(policy.allowed_message_types, route.messageType)
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
