import type { Page, TestInfo } from "@playwright/test";

export type CaptureMode = "cdp" | "screenshot";
export type ImageFormat = "jpeg" | "png";

export type ViewportSize = {
  width: number;
  height: number;
};

export type CaptureConfig = {
  mode: CaptureMode;
  fps: number;
  durationMs: number;
  imageFormat: ImageFormat;
  quality: number;
  viewport: ViewportSize;
};

export type ThresholdConfig = {
  maxFrameDelta: number;
  maxBlankFrameRatio: number;
  maxDarkFrameRatio: number;
  minTextVisibilityRatio: number;
  maxConsecutiveUnstableFrames: number;
  maxBaselineDistance: number;
};

export type VisualGlitchConfig = {
  outputDir: string;
  baselineDir: string;
  capture: CaptureConfig;
  thresholds: ThresholdConfig;
  masks: string[];
};

export type VisualGlitchUserConfig = Partial<
  Omit<VisualGlitchConfig, "capture" | "thresholds">
> & {
  capture?: Partial<CaptureConfig>;
  thresholds?: Partial<ThresholdConfig>;
};

export type VisualGlitchOptions = Partial<CaptureConfig> & {
  name: string;
  action?: () => Promise<unknown>;
  outputDir?: string;
  baselineDir?: string;
  masks?: string[];
  thresholds?: Partial<ThresholdConfig>;
  testInfo?: TestInfo;
};

export type CapturedFrame = {
  index: number;
  timestampMs: number;
  width: number;
  height: number;
  imagePath?: string;
  hash: string;
  perceptualHash: string;
  averageLuminance: number;
  blankRatio: number;
  darkRatio: number;
  frameDelta?: number;
  baselineDistance?: number;
};

export type RawFrame = {
  index: number;
  timestampMs: number;
  buffer: Buffer;
};

export type MaskRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GlitchEvent = {
  detector:
    | "blank-flash"
    | "dark-flash"
    | "large-delta"
    | "consecutive-instability"
    | "baseline-distance"
    | "bad-text";
  message: string;
  startFrame: number;
  endFrame: number;
  startTimeMs: number;
  endTimeMs: number;
  details?: Record<string, unknown>;
};

export type CaptureRun = {
  name: string;
  startedAt: string;
  mode: CaptureMode;
  fps: number;
  durationMs: number;
  viewport: ViewportSize;
  browserName: string;
  os: NodeJS.Platform;
  testTitle?: string;
  frames: CapturedFrame[];
  rawFrames: RawFrame[];
  badTextEvents: GlitchEvent[];
};

export type TimelineManifest = {
  name: string;
  createdAt: string;
  browser: string;
  viewport: ViewportSize;
  fps: number;
  durationMs: number;
  frameCount: number;
  frames: CapturedFrame[];
};

export type AnalysisResult = {
  name: string;
  passed: boolean;
  events: GlitchEvent[];
  reportJsonPath?: string;
  reportHtmlPath?: string;
  baselineManifest?: TimelineManifest;
};

export type CaptureTimelineResult = CaptureRun & AnalysisResult;

export type CaptureTimelineOptions = VisualGlitchOptions;

export type ExpectNoVisualGlitchesOptions = Omit<
  VisualGlitchOptions,
  "action"
> & {
  action?: () => Promise<unknown>;
};

export type PageLike = Page;
