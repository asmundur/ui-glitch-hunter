import { detectGlitches } from "./detectors";
import { writeFailureReport } from "./report";
import type {
  CaptureRun,
  CaptureTimelineResult,
  TimelineManifest,
  VisualGlitchConfig,
} from "./types";

export async function analyzeCaptureRun(
  run: CaptureRun,
  config: VisualGlitchConfig,
  baselineManifest?: TimelineManifest,
): Promise<CaptureTimelineResult> {
  const events = [
    ...detectGlitches(
      run.frames,
      config.thresholds,
      baselineManifest,
      run.fps,
    ),
    ...run.badTextEvents,
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
