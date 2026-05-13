import fs from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
import type {
  CaptureConfig,
  ThresholdConfig,
  VisualGlitchConfig,
  VisualGlitchOptions,
  VisualGlitchUserConfig,
} from "./types";

export const defaultCaptureConfig: CaptureConfig = {
  mode: "cdp",
  fps: 20,
  durationMs: 5000,
  imageFormat: "jpeg",
  quality: 80,
  viewport: {
    width: 1440,
    height: 900,
  },
};

export const defaultThresholdConfig: ThresholdConfig = {
  maxFrameDelta: 0.35,
  maxBlankFrameRatio: 0.92,
  maxDarkFrameRatio: 0.92,
  minTextVisibilityRatio: 0.02,
  maxConsecutiveUnstableFrames: 6,
  maxBaselineDistance: 0.25,
};

export const defaultConfig: VisualGlitchConfig = {
  outputDir: "test-results/visual-glitches",
  baselineDir: "tests/visual-baselines",
  capture: defaultCaptureConfig,
  thresholds: defaultThresholdConfig,
  masks: ["[data-visual-ignore]", ".timestamp", ".animated-spinner"],
};

export function isUpdateMode(): boolean {
  return /^(1|true|yes)$/i.test(process.env.VISUAL_GLITCH_UPDATE ?? "");
}

export function loadVisualGlitchConfig(
  cwd = process.cwd(),
): VisualGlitchConfig {
  const candidates = [
    "visual-glitch.config.ts",
    "visual-glitch.config.mts",
    "visual-glitch.config.cts",
    "visual-glitch.config.js",
    "visual-glitch.config.mjs",
    "visual-glitch.config.cjs",
  ];
  const configPath = candidates
    .map((candidate) => path.resolve(cwd, candidate))
    .find((candidate) => fs.existsSync(candidate));

  if (!configPath) {
    return normalizeConfig(defaultConfig, cwd);
  }

  const jiti = createJiti(cwd, { interopDefault: true });
  const loaded = jiti(configPath) as
    | VisualGlitchUserConfig
    | { default: VisualGlitchUserConfig };
  const userConfig =
    loaded && typeof loaded === "object" && "default" in loaded
      ? loaded.default
      : loaded;

  return normalizeConfig(userConfig ?? {}, cwd);
}

export function resolveRunConfig(
  options: VisualGlitchOptions,
  cwd = process.cwd(),
): VisualGlitchConfig {
  const loaded = loadVisualGlitchConfig(cwd);
  return normalizeConfig(
    {
      ...loaded,
      outputDir: options.outputDir ?? loaded.outputDir,
      baselineDir: options.baselineDir ?? loaded.baselineDir,
      masks: options.masks ?? loaded.masks,
      capture: {
        ...loaded.capture,
        mode: options.mode ?? loaded.capture.mode,
        fps: options.fps ?? loaded.capture.fps,
        durationMs: options.durationMs ?? loaded.capture.durationMs,
        imageFormat: options.imageFormat ?? loaded.capture.imageFormat,
        quality: options.quality ?? loaded.capture.quality,
        viewport: options.viewport ?? loaded.capture.viewport,
      },
      thresholds: {
        ...loaded.thresholds,
        ...options.thresholds,
      },
    },
    cwd,
  );
}

function normalizeConfig(
  config: VisualGlitchUserConfig,
  cwd: string,
): VisualGlitchConfig {
  const capture = {
    ...defaultCaptureConfig,
    ...config.capture,
    viewport: {
      ...defaultCaptureConfig.viewport,
      ...config.capture?.viewport,
    },
  };
  const thresholds = {
    ...defaultThresholdConfig,
    ...config.thresholds,
  };

  return {
    outputDir: path.resolve(cwd, config.outputDir ?? defaultConfig.outputDir),
    baselineDir: path.resolve(
      cwd,
      config.baselineDir ?? defaultConfig.baselineDir,
    ),
    capture,
    thresholds,
    masks: [...(config.masks ?? defaultConfig.masks)],
  };
}
