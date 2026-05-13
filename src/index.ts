export {
  captureVisualTimeline,
  expectNoVisualGlitches,
  runVisualGlitchCheck,
} from "./api";
export { installVisualGlitchMatcher } from "./matcher";
export { VisualGlitchError, formatFailureMessage } from "./error";
export {
  loadVisualGlitchConfig,
  resolveRunConfig,
  defaultConfig,
  isUpdateMode,
} from "./config";
export {
  analyzeRawFrame,
  analyzeRawFrames,
  frameDistance,
  perceptualHashDistance,
  visualFrameDistance,
} from "./image-metrics";
export {
  detectBlankFlashes,
  detectDarkFlashes,
  detectGlitches,
  detectInstability,
  detectBaselineDistance,
  groupUnstableFrames,
} from "./detectors";
export type {
  AnalysisResult,
  CapturedFrame,
  CaptureRun,
  CaptureMode,
  CaptureTimelineOptions,
  CaptureTimelineResult,
  ExpectNoVisualGlitchesOptions,
  GlitchEvent,
  ImageFormat,
  MaskRect,
  RawFrame,
  ThresholdConfig,
  TimelineManifest,
  VisualGlitchConfig,
  VisualGlitchOptions,
  VisualGlitchUserConfig,
  ViewportSize,
} from "./types";
