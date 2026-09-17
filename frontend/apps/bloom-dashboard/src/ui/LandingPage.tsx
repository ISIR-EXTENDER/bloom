import { BloomButton } from "@bloom/ui";

import type { ProductView } from "./ProductNavigation";

type LandingPageProps = {
  onOpenView: (view: ProductView) => void;
};

const DOCS_URL = "https://github.com/ISIR-EXTENDER/bloom/tree/main/docs";

const PROMISES = [
  { title: "Reach", body: "One panel, laid out for the person using it — not for the axes the arm happens to have." },
  {
    title: "Change",
    body: "Screens are configuration. Move a control, grow a target, change a word, without touching the robot code.",
  },
  { title: "Trust", body: "Nothing on screen claims more than the robot reported. STOP is always in the same corner." },
];

/** The one surface allowed a voice (design 7b): one claim, the runtime first, a real photograph still to come. */
export function LandingPage({ onOpenView }: LandingPageProps) {
  return (
    <div className="landing">
      <section aria-labelledby="dashboard-title" className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Bloom · ISIR</p>
          <h1 id="dashboard-title">Give the gesture back.</h1>
          <p className="hero-copy">
            Bloom builds the panel a person actually reaches the robot through — and lets you change it without touching
            the robot.
          </p>
          <div className="hero-actions">
            <BloomButton onClick={() => onOpenView("runtime")} tone="primary">
              Open Runtime
            </BloomButton>
            <BloomButton onClick={() => onOpenView("builder")}>Open Builder</BloomButton>
            <BloomButton onClick={() => onOpenView("help")}>Get started</BloomButton>
          </div>
        </div>
        {/* Awaiting a photograph of the arm in use with a person; the placeholder says what belongs here. */}
        <figure className="landing-photo" data-placeholder="true">
          <figcaption>the arm in use, in a real room, with a person — not a product shot of a tablet</figcaption>
        </figure>
      </section>

      <section aria-label="What Bloom is for" className="landing-promises">
        {PROMISES.map((promise) => (
          <article className="landing-promise" key={promise.title}>
            <h2>{promise.title}</h2>
            <p>{promise.body}</p>
          </article>
        ))}
      </section>

      <footer className="landing-footer">
        <span>Built at ISIR for the Extender and Kinova arms.</span>
        <a href={DOCS_URL} rel="noreferrer" target="_blank">
          Architecture notes, ADRs and the design system live in the docs →
        </a>
      </footer>
    </div>
  );
}
