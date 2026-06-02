import type { ScreenConfig } from "@bloom/api-client";
import { renderScreenWidgets } from "@bloom/widget-renderers";
import { createDefaultWidgetRegistry, renderScreenDescriptors, resolveCanvasArtboardSize } from "@bloom/widgets";
import "./App.css";

import { dashboardPrinciples, dashboardSteps } from "./app/dashboard-content";
import { type ConfigurationClient, createDashboardConfigurationClient } from "./configurations/configuration-client";
import { useConfigurations } from "./configurations/use-configurations";

const defaultConfigurationClient = createDashboardConfigurationClient();
const widgetRegistry = createDefaultWidgetRegistry();

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
            Bloom is the new web foundation for configurable robot teleoperation, supervision, and device control across
            ISIR projects.
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

      <ScreenPreviewPanel state={configurationState} />
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

type ScreenPreviewPanelProps = {
  state: ReturnType<typeof useConfigurations>;
};

function ScreenPreviewPanel({ state }: ScreenPreviewPanelProps) {
  if (state.status !== "ready" || state.configurations.length === 0) {
    return null;
  }

  const firstConfiguration = state.configurations[0];
  const firstApplication = firstConfiguration?.bundle.applications[0];
  const firstScreen = firstApplication?.screens[0];
  if (!firstApplication || !firstScreen) {
    return null;
  }

  return (
    <section className="screen-preview-panel" aria-labelledby="screen-preview-title">
      <div className="screen-preview-heading">
        <div>
          <p className="eyebrow">Screen preview</p>
          <h2 id="screen-preview-title">{firstScreen.title}</h2>
        </div>
        <small>
          {firstApplication.name} · {firstScreen.widgets.length} widgets
        </small>
      </div>
      <ScreenPreview screen={firstScreen} />
    </section>
  );
}

type ScreenPreviewProps = {
  screen: ScreenConfig;
};

function ScreenPreview({ screen }: ScreenPreviewProps) {
  const descriptors = renderScreenDescriptors(screen, widgetRegistry);
  const artboardSize = resolveCanvasArtboardSize(screen.widgets, screen.canvas);

  return (
    <div
      className="screen-preview-artboard"
      style={{
        aspectRatio: `${artboardSize.width} / ${artboardSize.height}`,
      }}
    >
      {renderScreenWidgets(descriptors)}
    </div>
  );
}
