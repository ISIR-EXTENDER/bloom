import { BloomButton } from "@bloom/ui";

import type { ProductView } from "./ProductNavigation";

type LandingPageProps = {
  onOpenView: (view: ProductView) => void;
};

const DOCS_URL = "https://github.com/ISIR-EXTENDER/bloom/tree/main/docs";

/**
 * Straight to a robot, for someone who just arrived and does not know where to look.
 *
 * Real links, not buttons: the same address works as a bookmark on the tablet's home screen. They
 * land on the runtime library with the app focused; opening a role stays the person's own press.
 */
const SHORTCUTS = [
  { hash: "#/runtime/open/explorer-manager/explorer-manager", title: "Explorer", body: "Drive the Explorer arm" },
  { hash: "#/runtime/open/kinova-manager/kinova-manager", title: "Kinova", body: "Drive the Kinova gen3" },
  { hash: "#/runtime/open/bloom-debug/bloom-debug", title: "Debug", body: "Watch topics, joints and the Jacobian" },
];

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
        {/* A real capture of the product, refreshed by scripts/capture-readme-screenshots.mjs. */}
        <figure className="landing-photo">
          <img
            alt="The Explorer Manager Drive screen: joysticks, speed segments and the STOP rail."
            src="/landing-drive.png"
          />
        </figure>
      </section>

      <section aria-label="Go straight to a robot" className="landing-shortcuts">
        <p className="eyebrow">Already at the bench?</p>
        <div className="landing-shortcut-row">
          {SHORTCUTS.map((shortcut) => (
            <a className="landing-shortcut" href={shortcut.hash} key={shortcut.title}>
              <strong>{shortcut.title}</strong>
              <span>{shortcut.body}</span>
            </a>
          ))}
        </div>
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
