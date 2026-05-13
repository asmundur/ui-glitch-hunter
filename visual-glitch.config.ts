import type { VisualGlitchUserConfig } from "./src";

export default {
  outputDir: "test-results/visual-glitches",
  baselineDir: "tests/visual-baselines",

  capture: {
    mode: "cdp",
    fps: 20,
    durationMs: 5000,
    imageFormat: "jpeg",
    quality: 80,
    viewport: {
      width: 1440,
      height: 900,
    },
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
