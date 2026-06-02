import { dashboardPrinciples, dashboardSteps } from "../app/dashboard-content";
import type { ProductView } from "./ProductNavigation";

type LandingPageProps = {
  onOpenView: (view: ProductView) => void;
};

export function LandingPage({ onOpenView }: LandingPageProps) {
  return (
    <>
      <section className="hero" aria-labelledby="dashboard-title">
        <div className="hero-card">
          <p className="eyebrow">Bloom dashboard</p>
          <h1 id="dashboard-title">Robot interfaces that grow cleanly.</h1>
          <p className="hero-copy">
            Bloom is the new web foundation for configurable robot teleoperation, supervision, and device control across
            ISIR projects.
          </p>
          <div className="hero-actions">
            <button className="primary-action" onClick={() => onOpenView("builder")} type="button">
              Open builder preview
            </button>
            <button className="secondary-action" onClick={() => onOpenView("runtime")} type="button">
              Open runtime preview
            </button>
          </div>
        </div>

        <aside className="principles-card" aria-labelledby="principles-title">
          <h2 id="principles-title">Architecture promises</h2>
          <ul>
            {dashboardPrinciples.map((principle) => (
              <li key={principle}>{principle}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="steps" aria-label="Bloom workflow">
        {dashboardSteps.map((step) => (
          <article className="step-card" key={step.id}>
            <h2>{step.title}</h2>
            <p>{step.description}</p>
          </article>
        ))}
      </section>
    </>
  );
}
