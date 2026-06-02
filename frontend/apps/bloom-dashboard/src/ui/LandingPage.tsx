import { BloomButton, BloomCard } from "@bloom/ui";

import { dashboardPrinciples, dashboardSteps } from "../app/dashboard-content";
import type { ProductView } from "./ProductNavigation";

type LandingPageProps = {
  onOpenView: (view: ProductView) => void;
};

export function LandingPage({ onOpenView }: LandingPageProps) {
  return (
    <>
      <section className="hero" aria-labelledby="dashboard-title">
        <BloomCard className="hero-card" tone="canvas">
          <p className="eyebrow">Bloom dashboard</p>
          <h1 id="dashboard-title">Robot interfaces that grow cleanly.</h1>
          <p className="hero-copy">
            Bloom is the new web foundation for configurable robot teleoperation, supervision, and device control across
            ISIR projects.
          </p>
          <div className="hero-actions">
            <BloomButton onClick={() => onOpenView("builder")} tone="primary">
              Open builder preview
            </BloomButton>
            <BloomButton onClick={() => onOpenView("runtime")}>Open runtime preview</BloomButton>
          </div>
        </BloomCard>

        <BloomCard className="principles-card" tone="soft">
          <h2 id="principles-title">Architecture promises</h2>
          <ul>
            {dashboardPrinciples.map((principle) => (
              <li key={principle}>{principle}</li>
            ))}
          </ul>
        </BloomCard>
      </section>

      <section className="steps" aria-label="Bloom workflow">
        {dashboardSteps.map((step) => (
          <BloomCard className="step-card" key={step.id} tone="soft">
            <h2>{step.title}</h2>
            <p>{step.description}</p>
          </BloomCard>
        ))}
      </section>
    </>
  );
}
