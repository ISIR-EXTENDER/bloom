import "./App.css";

import { dashboardPrinciples, dashboardSteps } from "./app/dashboard-content";

export function App() {
  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="dashboard-title">
        <div className="hero-card">
          <img className="brand-mark" src="/logo.png" alt="" aria-hidden="true" />
          <p className="eyebrow">Bloom dashboard</p>
          <h1 id="dashboard-title">Robot interfaces that grow cleanly.</h1>
          <p className="hero-copy">
            Bloom is the new web foundation for configurable robot teleoperation,
            supervision, and device control across ISIR projects.
          </p>
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
    </main>
  );
}
