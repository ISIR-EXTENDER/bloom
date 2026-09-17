/**
 * Render the README artwork from the design system tokens and fonts.
 *
 *   node scripts/render-readme-art.mjs --drive drive.png --debug debug.png --poster frame.png
 *
 * The inputs are live captures (1280×720 Drive, 1920×1080 Bloom Debug, a video frame). Outputs land in
 * docs/assets/readme/.
 */
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const readArgument = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const outputDirectory = resolve("docs/assets/readme");
const tokens = await readFile(resolve("frontend/libs/ui/src/styles.css"), "utf8");
const color = (name) => tokens.match(new RegExp(`--bloom-color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const dataUrl = async (path) => `data:image/png;base64,${(await readFile(resolve(path))).toString("base64")}`;

const palette = {
  cream: color("cream"),
  error: color("error"),
  forest: color("forest"),
  ink: color("ink"),
  inkSoft: color("ink-soft"),
  lilac: color("lilac"),
  mist: color("mist"),
  paper: color("paper"),
  petal: color("petal"),
  pollen: color("pollen"),
  sage: color("sage"),
};

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Cormorant+Garamond:wght@500;600&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">`;

const base = `
  * { box-sizing: border-box; margin: 0; }
  body { background: ${palette.paper}; color: ${palette.ink}; font-family: "Atkinson Hyperlegible", sans-serif; }
  .eyebrow { font: 700 15px/1 "Atkinson Hyperlegible"; letter-spacing: 0.18em; text-transform: uppercase; color: ${palette.sage}; }
  .display { font-family: "Cormorant Garamond", serif; font-weight: 600; letter-spacing: -0.01em; color: ${palette.forest}; }
  .mono { font-family: "JetBrains Mono", monospace; }
`;

const pages = [];

if (readArgument("--drive")) {
  pages.push({
    file: "hero.png",
    size: { height: 600, width: 1400 },
    html: `${fonts}<style>${base}
      body { width: 1400px; height: 600px; overflow: hidden; position: relative;
        background: radial-gradient(120% 90% at 0% 0%, ${palette.mist} 0%, transparent 55%),
          radial-gradient(80% 80% at 100% 100%, ${palette.cream} 0%, transparent 60%), ${palette.paper}; }
      .copy { position: absolute; left: 72px; top: 92px; width: 520px; }
      h1 { font-size: 92px; line-height: 0.95; margin: 18px 0 26px; }
      p { font-size: 21px; line-height: 1.5; color: ${palette.inkSoft}; }
      .chips { display: flex; gap: 10px; margin-top: 30px; }
      .chip { padding: 9px 18px; border-radius: 999px; font-weight: 700; font-size: 16px; }
      .chip.build { background: ${palette.forest}; color: ${palette.paper}; }
      .chip.operate { background: ${palette.pollen}; color: ${palette.ink}; }
      .chip.connect { border: 2px solid ${palette.sage}; color: ${palette.forest}; }
      .tablet { position: absolute; right: 64px; top: 78px; width: 700px; padding: 18px; border-radius: 34px;
        background: ${palette.forest}; box-shadow: 0 40px 80px rgb(37 61 53 / 28%), 0 6px 18px rgb(37 61 53 / 18%);
        transform: rotate(-2deg); }
      .tablet img { display: block; width: 100%; border-radius: 16px; }
      .petal { position: absolute; border-radius: 50%; filter: blur(2px); opacity: 0.7; }
    </style>
    <span class="petal" style="left:560px;top:40px;width:70px;height:70px;background:${palette.petal}"></span>
    <span class="petal" style="left:1300px;top:500px;width:46px;height:46px;background:${palette.lilac}"></span>
    <div class="copy">
      <div class="eyebrow">Bloom · ISIR Extender</div>
      <h1 class="display">Give the gesture back.</h1>
      <p>Build accessible robot interfaces without web code. Operate them in a kiosk where STOP is always live.</p>
      <div class="chips"><span class="chip build">Build</span><span class="chip operate">Operate</span><span class="chip connect">Connect</span></div>
    </div>
    <div class="tablet"><img src="${await dataUrl(readArgument("--drive"))}"></div>`,
  });
}

if (readArgument("--poster")) {
  pages.push({
    file: "demo-poster.png",
    size: { height: 540, width: 960 },
    html: `${fonts}<style>${base}
      body { width: 960px; height: 540px; overflow: hidden; position: relative; }
      img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(1.5px) saturate(0.9); }
      .veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgb(37 61 53 / 18%) 0%, rgb(37 61 53 / 40%) 45%, rgb(31 42 36 / 92%) 100%); }
      .play { position: absolute; left: 50%; top: 45%; width: 112px; height: 112px; margin: -56px 0 0 -56px; border-radius: 50%;
        background: ${palette.pollen}; box-shadow: 0 16px 40px rgb(0 0 0 / 30%); }
      .play::after { content: ""; position: absolute; left: 44px; top: 32px; border-style: solid; border-width: 24px 0 24px 38px;
        border-color: transparent transparent transparent ${palette.forest}; }
      .caption { position: absolute; left: 44px; bottom: 36px; color: ${palette.paper}; }
      .caption .display { color: ${palette.paper}; font-size: 48px; line-height: 1; }
      .caption .eyebrow { color: ${palette.pollen}; margin-bottom: 10px; }
    </style>
    <img src="${await dataUrl(readArgument("--poster"))}"><div class="veil"></div><div class="play"></div>
    <div class="caption"><div class="eyebrow">Walkthrough · 5 min · live Explorer simulation</div>
    <div class="display">From an empty screen to a moving arm</div></div>`,
  });
}

pages.push({
  file: "design-language.png",
  size: { height: 300, width: 1400 },
  html: `${fonts}<style>${base}
    body { width: 1400px; height: 300px; padding: 44px 56px; display: grid; grid-template-columns: 420px 1fr; gap: 48px; }
    .type .display { font-size: 64px; line-height: 1; margin: 14px 0 12px; }
    .type .ui { font-size: 20px; color: ${palette.inkSoft}; }
    .type .mono { font-size: 16px; color: ${palette.inkSoft}; margin-top: 10px; }
    .swatches { display: grid; grid-template-columns: repeat(8, 1fr); gap: 14px; align-content: center; }
    .swatch { height: 128px; border-radius: 20px; padding: 14px; display: flex; flex-direction: column; justify-content: flex-end;
      font-size: 14px; font-weight: 700; border: 1px solid rgb(37 61 53 / 10%); }
    .swatch small { font: 500 12px "JetBrains Mono"; opacity: 0.8; margin-top: 3px; }
  </style>
  <div class="type"><div class="eyebrow">Design language</div><div class="display">Calm, legible, honest.</div>
  <div class="ui">Atkinson Hyperlegible for every operator word</div><div class="mono">JetBrains Mono · 30 Hz · base_link</div></div>
  <div class="swatches">${[
    ["Forest", palette.forest, palette.paper],
    ["Sage", palette.sage, palette.paper],
    ["Mist", palette.mist, palette.ink],
    ["Cream", palette.cream, palette.ink],
    ["Pollen", palette.pollen, palette.ink],
    ["Petal", palette.petal, palette.ink],
    ["Lilac", palette.lilac, palette.ink],
    ["STOP", palette.error, palette.paper],
  ]
    .map(
      ([name, background, ink]) =>
        `<div class="swatch" style="background:${background};color:${ink}">${name}<small>${background}</small></div>`,
    )
    .join("")}</div>`,
});

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
try {
  for (const page of pages) {
    const tab = await browser.newPage({ deviceScaleFactor: 2, viewport: page.size });
    await tab.setContent(page.html, { waitUntil: "networkidle" });
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: resolve(outputDirectory, page.file) });
    await tab.close();
    console.log(`rendered ${page.file}`);
  }
} finally {
  await browser.close();
}
