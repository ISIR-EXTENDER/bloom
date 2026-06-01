import "./App.css";

import { dashboardPrinciples, dashboardSteps } from "./app/dashboard-content";
import { createDashboardConfigurationClient, type ConfigurationClient } from "./configurations/configuration-client";
import { useConfigurations } from "./configurations/use-configurations";

const defaultConfigurationClient = createDashboardConfigurationClient();

type AppProps = {
  configurationClient?: ConfigurationClient;
};

export function App({ configurationClient = defaultConfigurationClient }: AppProps) {
  const configurationState = useConfigurations(configurationClient);

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

      <section className="configuration-panel" aria-labelledby="configuration-panel-title">
        <div>
          <p className="eyebrow">Live configuration</p>
          <h2 id="configuration-panel-title">Available interfaces</h2>
        </div>
        <ConfigurationPanel state={configurationState} />
      </section>
    </main>
  );
}

type ConfigurationPanelProps = {
  state: ReturnType<typeof useConfigurations>;
};

function ConfigurationPanel({ state }: ConfigurationPanelProps) {
  if (state.status === "loading") {
    return <p className="configuration-status">Loading configurations...</p>;
  }

  if (state.status === "error") {
    return (
      <p className="configuration-status configuration-status-error" role="alert">
        {state.message}
      </p>
    );
  }

  if (state.configurations.length === 0) {
    return <p className="configuration-status">No configurations found yet.</p>;
  }

  return (
    <ul className="configuration-list">
      {state.configurations.map(({ id, bundle }) => (
        <li key={id}>
          <span>{bundle.applications[0]?.name ?? id}</span>
          <small>{id}</small>
        </li>
      ))}
    </ul>
  );
}
