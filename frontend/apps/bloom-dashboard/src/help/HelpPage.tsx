import { BloomButton, BloomCard } from "@bloom/ui";
import type { ProductView } from "../ui/ProductNavigation";
import {
  BLOOM_CODE_REFERENCE_DATE,
  BLOOM_HELP_LAST_UPDATED,
  bloomCapabilities,
  getStartedSteps,
  helpMaintenanceChecklist,
} from "./help-content";

type HelpPageProps = {
  onOpenView: (view: ProductView) => void;
};

export function HelpPage({ onOpenView }: HelpPageProps) {
  const docsAreCurrent = BLOOM_HELP_LAST_UPDATED >= BLOOM_CODE_REFERENCE_DATE;

  return (
    <section className="help-page" aria-labelledby="help-page-title">
      <BloomCard className="help-hero-card" tone="canvas">
        <p className="eyebrow">Get started</p>
        <h1 id="help-page-title">Build Bloom apps with confidence.</h1>
        <p className="hero-copy">
          This guide explains what Bloom can do today and gives a step-by-step path for creating, editing, reusing, and
          running robot interface screens.
        </p>
        <div className="hero-actions">
          <BloomButton onClick={() => onOpenView("builder")} tone="primary">
            Start in Builder
          </BloomButton>
          <BloomButton onClick={() => onOpenView("runtime")}>Open Runtime</BloomButton>
        </div>
      </BloomCard>

      <div className="help-grid">
        <BloomCard className="help-panel" tone="soft">
          <div className="help-panel-heading">
            <p className="eyebrow">What is possible</p>
            <h2>Bloom capabilities</h2>
          </div>
          <div className="help-capability-list">
            {bloomCapabilities.map((capability) => (
              <article className="help-capability-card" key={capability.title}>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </article>
            ))}
          </div>
        </BloomCard>

        <BloomCard className="help-panel help-freshness-card" tone={docsAreCurrent ? "soft" : "canvas"}>
          <div className="help-panel-heading">
            <p className="eyebrow">Documentation freshness</p>
            <h2>{docsAreCurrent ? "Guide is aligned" : "Guide needs review"}</h2>
          </div>
          <dl>
            <div>
              <dt>Help guide</dt>
              <dd>{BLOOM_HELP_LAST_UPDATED}</dd>
            </div>
            <div>
              <dt>Code reference</dt>
              <dd>{BLOOM_CODE_REFERENCE_DATE}</dd>
            </div>
          </dl>
          <p>
            Keep this card up to date when workflows change. Later, Bloom can replace the manual code date with GitHub
            release or commit metadata.
          </p>
        </BloomCard>
      </div>

      <BloomCard className="help-panel" tone="soft">
        <div className="help-panel-heading">
          <p className="eyebrow">Step by step</p>
          <h2>First app workflow</h2>
        </div>
        <ol className="help-step-list">
          {getStartedSteps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </BloomCard>

      <BloomCard className="help-panel" tone="soft">
        <div className="help-panel-heading">
          <p className="eyebrow">For maintainers</p>
          <h2>Keep this useful after handover</h2>
        </div>
        <ul className="help-maintenance-list">
          {helpMaintenanceChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </BloomCard>
    </section>
  );
}
