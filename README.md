# UI Glitch Hunter

Playwright Test utility for detecting transient visual glitches during page load
and scripted interaction. It captures a short visual timeline and checks for
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

## Reports

On failure, reports are written under
`test-results/visual-glitches/<name>/` and include:

- `report.json`
- `report.html`
- captured current frames
- copied baseline frames when available
- diff images when a baseline exists
