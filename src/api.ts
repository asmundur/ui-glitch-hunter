import os from "node:os";
import type { Page } from "@playwright/test";
import { saveBaseline, loadBaseline } from "./baseline";
import { captureRawTimeline } from "./capture";
import { resolveRunConfig, isUpdateMode } from "./config";
import { detectGlitches } from "./detectors";
import { VisualGlitchError } from "./error";
import { analyzeRawFrames } from "./image-metrics";
import { collectMaskRects, mergeMaskRects } from "./masks";
import { writeFailureReport } from "./report";
import { mapTextEventsToFrames } from "./text-detector";
import type {
  CaptureRun,
  CaptureTimelineOptions,
  CaptureTimelineResult,
  ExpectNoVisualGlitchesOptions,
} from "./types";

export async function captureVisualTimeline(
  page: Page,
  options: CaptureTimelineOptions,
): Promise<CaptureTimelineResult> {
  const result = await runVisualGlitchCheck(page, options);
  if (!result.passed) {
    throw new VisualGlitchError(result);
  }
  return result;
}

export async function expectNoVisualGlitches(
  page: Page,
  options: ExpectNoVisualGlitchesOptions,
): Promise<CaptureTimelineResult> {
  return captureVisualTimeline(page, options);
}

export async function runVisualGlitchCheck(
  page: Page,
  options: CaptureTimelineOptions,
): Promise<CaptureTimelineResult> {
  if (!options.name?.trim()) {
    throw new Error("Visual glitch capture requires a non-empty `name` option.");
  }

  const config = resolveRunConfig(options);
  const capture = config.capture;
  const startedAt = new Date().toISOString();

  const startMasks = await collectMaskRects(page, config.masks);
  const raw = await captureRawTimeline(page, capture, options.action);
  const endMasks = await collectMaskRects(page, config.masks).catch(() => []);
  const masks = mergeMaskRects(startMasks, endMasks);
  const frames = await analyzeRawFrames(raw.rawFrames, masks, raw.viewport);
  const textEvents = mapTextEventsToFrames(
    raw.badTextEvents,
    frames.map((frame) => ({
      index: frame.index,
      timestampMs: frame.timestampMs,
    })),
  );

  const run: CaptureRun = {
    name: options.name,
    startedAt,
    mode: raw.mode,
    fps: capture.fps,
    durationMs: capture.durationMs,
    viewport: raw.viewport,
    browserName: raw.browserName,
    os: os.platform(),
    testTitle: options.testInfo?.title,
    frames,
    rawFrames: raw.rawFrames,
    badTextEvents: textEvents,
  };

  if (isUpdateMode()) {
    const baselineManifest = await saveBaseline(run, config, capture);
    return {
      ...run,
      name: run.name,
      passed: true,
      events: [],
      baselineManifest,
    };
  }

  const baselineManifest = await loadBaseline(config, run.name);
  const events = [
    ...detectGlitches(frames, config.thresholds, baselineManifest, capture.fps),
    ...textEvents,
  ];

  if (events.length === 0) {
    return {
      ...run,
      name: run.name,
      passed: true,
      events,
      baselineManifest,
    };
  }

  const report = await writeFailureReport(run, events, config, baselineManifest);

  return {
    ...run,
    name: run.name,
    passed: false,
    events,
    reportJsonPath: report.reportJsonPath,
    reportHtmlPath: report.reportHtmlPath,
    baselineManifest,
  };
}
