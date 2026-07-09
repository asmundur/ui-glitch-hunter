# UI Glitch Hunter

Playwright Test utility for detecting transient visual glitches during page load
and scripted interaction. In CDP mode it processes every screencast frame
Chromium emits; screenshot mode samples at the configured FPS. It checks for
blank flashes, dark flashes, large visual jumps, unstable frame ranges, known
runtime error text, and optional baseline drift.

## Install

```bash
npm install
npx playwright install chromium
```

## Basic Usage

```ts
import { expectNoVisualGlitches } from "ui-glitch-hunter";

test("dashboard loads without visual glitches", async ({ page }) => {
  await page.goto("/dashboard");

  await expectNoVisualGlitches(page, {
    name: "dashboard-load",
    durationMs: 6000,
    fps: 20,
  });
});
```

For interaction capture:

```ts
import { captureVisualTimeline } from "ui-glitch-hunter";

test("sidebar opens cleanly", async ({ page }) => {
  await page.goto("/dashboard");

  await captureVisualTimeline(page, {
    name: "sidebar-open",
    durationMs: 2500,
    fps: 30,
    action: async () => {
      await page.getByRole("button", { name: "Menu" }).click();
    },
  });
});
```

To install the matcher:

```ts
import { expect } from "@playwright/test";
import { installVisualGlitchMatcher } from "ui-glitch-hunter";

installVisualGlitchMatcher(expect);

test("dashboard loads without visual glitches", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveNoVisualGlitches({
    name: "dashboard-load",
    durationMs: 6000,
  });
});
```

## Baselines

Playwright rejects arbitrary test flags, so baseline updates use an environment
flag:

```bash
VISUAL_GLITCH_UPDATE=1 npx playwright test
```

Baselines are written to `tests/visual-baselines/<name>/` by default.

## Configuration

Create `visual-glitch.config.ts` in the project root:

```ts
import type { VisualGlitchUserConfig } from "ui-glitch-hunter";

export default {
  outputDir: "test-results/visual-glitches",
  baselineDir: "tests/visual-baselines",
  capture: {
    mode: "cdp",
    fps: 20,
    durationMs: 5000,
    imageFormat: "jpeg",
    quality: 80,
    viewport: { width: 1440, height: 900 },
  },
  thresholds: {
    maxFrameDelta: 0.35,
    maxBlankFrameRatio: 0.92,
    maxDarkFrameRatio: 0.92,
    minTextVisibilityRatio: 0.02,
    maxConsecutiveUnstableFrames: 6,
    maxBaselineDistance: 0.25,
  },
  masks: ["[data-visual-ignore]", ".timestamp", ".animated-spinner"],
} satisfies VisualGlitchUserConfig;
```

## Capture Modes

`mode: "cdp"` uses Chromium's screencast stream with `everyNthFrame: 1` and
analyzes every `Page.screencastFrame` event received from the browser. This is
the default mode and is intended for catching glitches that would be missed by
FPS sampling. The configured `fps` value is still recorded as metadata.

`mode: "screenshot"` uses repeated Playwright screenshots and is sampled at the
configured `fps`. It is useful as a portable fallback, but very short flashes can
fall between samples.

## Reports

On failure, reports are written under
`test-results/visual-glitches/<name>/` and include:

- `report.json`
- `report.html`
- captured current frames
- copied baseline frames when available
- diff images when a baseline exists

## Proof Suite

The source-backed proof suite exercises a scoped subset of documented visual
failure classes. It is evidence for those named behaviors only, not a claim of
complete UI glitch coverage.

```bash
npm run proof
```

Runs the proof project with hosted external proofs skipped by default.

```bash
npm run proof:external
```

Runs the hosted proofs with `VISUAL_GLITCH_PROOF_EXTERNAL=1`; use this for
manual or nightly verification rather than required PR gates.

Generated proof summaries are written under `proof/results/`, which is ignored.
Playwright and visual report artifacts are written under `test-results/`. See
`proof/README.md` and `proof/offline-corpus.md` for source references,
limitations, and artifact details.

## Offline Frame Files

Use `analyzeVisualFrameFiles` to run the same metrics, detectors, optional
baseline comparison, and report generation against an ordered set of local image
frames.

```ts
import { analyzeVisualFrameFiles } from "ui-glitch-hunter";

const result = await analyzeVisualFrameFiles({
  name: "offline-fixture",
  frames: ["frame-000.png", "frame-001.png"],
  baselineFrames: ["baseline-000.png", "baseline-001.png"],
  outputDir: "test-results/visual-glitches",
});
```
