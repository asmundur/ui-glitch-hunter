import type {
  CapturedFrame,
  GlitchEvent,
  ThresholdConfig,
  TimelineManifest,
} from "./types";
import { visualFrameDistance } from "./image-metrics";

export function detectGlitches(
  frames: CapturedFrame[],
  thresholds: ThresholdConfig,
  baseline?: TimelineManifest,
  fps = 20,
): GlitchEvent[] {
  const events = [
    ...detectBlankFlashes(frames, thresholds),
    ...detectDarkFlashes(frames, thresholds),
    ...detectInstability(frames, thresholds),
  ];

  if (baseline) {
    events.push(...detectBaselineDistance(frames, baseline, thresholds, fps));
  }

  return events;
}

export function detectBlankFlashes(
  frames: CapturedFrame[],
  thresholds: ThresholdConfig,
): GlitchEvent[] {
  const events: GlitchEvent[] = [];
  let meaningfulContentSeen = false;

  for (const frame of frames) {
    const previous = frames[frame.index - 1];
    const becameBlank =
      previous &&
      previous.blankRatio < thresholds.maxBlankFrameRatio - 0.03 &&
      frame.blankRatio >= thresholds.maxBlankFrameRatio;

    if (meaningfulContentSeen && becameBlank) {
      events.push({
        detector: "blank-flash",
        message: `Blank frame ratio ${frame.blankRatio.toFixed(3)} exceeded ${thresholds.maxBlankFrameRatio}`,
        startFrame: frame.index,
        endFrame: frame.index,
        startTimeMs: frame.timestampMs,
        endTimeMs: frame.timestampMs,
        details: { blankRatio: frame.blankRatio },
      });
    }

    if (frame.blankRatio < 1 - thresholds.minTextVisibilityRatio) {
      meaningfulContentSeen = true;
    }
  }

  return mergeAdjacentEvents(events, "blank-flash");
}

export function detectDarkFlashes(
  frames: CapturedFrame[],
  thresholds: ThresholdConfig,
): GlitchEvent[] {
  const events: GlitchEvent[] = [];
  let nonDarkContentSeen = false;
  let activeDarkFlash:
    | { startFrame: number; endFrame: number; maxDarkRatio: number }
    | undefined;
  const nonDarkThreshold = thresholds.maxDarkFrameRatio - 0.1;

  for (const frame of frames) {
    const previous = frames[frame.index - 1];
    const isDark = frame.darkRatio >= thresholds.maxDarkFrameRatio;
    const isNonDark = frame.darkRatio < nonDarkThreshold;
    const becameDark =
      previous &&
      previous.darkRatio < thresholds.maxDarkFrameRatio - 0.03 &&
      isDark;

    if (!activeDarkFlash && nonDarkContentSeen && becameDark) {
      activeDarkFlash = {
        startFrame: frame.index,
        endFrame: frame.index,
        maxDarkRatio: frame.darkRatio,
      };
    } else if (activeDarkFlash && isDark) {
      activeDarkFlash.endFrame = frame.index;
      activeDarkFlash.maxDarkRatio = Math.max(
        activeDarkFlash.maxDarkRatio,
        frame.darkRatio,
      );
    }

    if (activeDarkFlash && isNonDark) {
      const start = frames[activeDarkFlash.startFrame];
      const end = frames[activeDarkFlash.endFrame];
      events.push({
        detector: "dark-flash",
        message: `Dark frame ratio ${activeDarkFlash.maxDarkRatio.toFixed(3)} exceeded ${thresholds.maxDarkFrameRatio}`,
        startFrame: activeDarkFlash.startFrame,
        endFrame: activeDarkFlash.endFrame,
        startTimeMs: start.timestampMs,
        endTimeMs: end.timestampMs,
        details: { darkRatio: activeDarkFlash.maxDarkRatio },
      });
      activeDarkFlash = undefined;
    }

    if (isNonDark) {
      nonDarkContentSeen = true;
    }
  }

  return mergeAdjacentEvents(events, "dark-flash");
}

export function detectInstability(
  frames: CapturedFrame[],
  thresholds: ThresholdConfig,
): GlitchEvent[] {
  const unstableGroups = groupUnstableFrames(
    frames,
    thresholds.maxFrameDelta,
  );
  const events: GlitchEvent[] = [];

  for (const group of unstableGroups) {
    const start = frames[group.startFrame];
    const end = frames[group.endFrame];
    const deltas = frames
      .slice(group.startFrame, group.endFrame + 1)
      .map((frame) => frame.frameDelta ?? 0);
    const maxDelta = Math.max(...deltas);

    if (group.count > thresholds.maxConsecutiveUnstableFrames) {
      events.push({
        detector: "consecutive-instability",
        message: `${group.count} consecutive unstable frames exceeded ${thresholds.maxConsecutiveUnstableFrames}`,
        startFrame: group.startFrame,
        endFrame: group.endFrame,
        startTimeMs: start.timestampMs,
        endTimeMs: end.timestampMs,
        details: { maxDelta, count: group.count },
      });
      continue;
    }

    if (group.count >= 2 || (group.startFrame > 2 && maxDelta > thresholds.maxFrameDelta * 1.5)) {
      events.push({
        detector: "large-delta",
        message: `Frame delta ${maxDelta.toFixed(3)} exceeded ${thresholds.maxFrameDelta}`,
        startFrame: group.startFrame,
        endFrame: group.endFrame,
        startTimeMs: start.timestampMs,
        endTimeMs: end.timestampMs,
        details: { maxDelta, count: group.count },
      });
    }
  }

  return events;
}

export function detectBaselineDistance(
  frames: CapturedFrame[],
  baseline: TimelineManifest,
  thresholds: ThresholdConfig,
  fps: number,
): GlitchEvent[] {
  const maxDriftMs = Math.max(250, (1000 / Math.max(1, fps)) * 2);
  const badFrames: CapturedFrame[] = [];

  for (const frame of frames) {
    const baselineFrame = findNearestBaselineFrame(
      frame.timestampMs,
      baseline.frames,
      maxDriftMs,
    );
    if (!baselineFrame) {
      continue;
    }

    const distance = visualFrameDistance(frame, baselineFrame);
    frame.baselineDistance = distance;
    if (distance > thresholds.maxBaselineDistance) {
      badFrames.push(frame);
    }
  }

  return groupFrameList(badFrames).map((group) => ({
    detector: "baseline-distance",
    message: `Baseline distance exceeded ${thresholds.maxBaselineDistance}`,
    startFrame: group.startFrame,
    endFrame: group.endFrame,
    startTimeMs: frames[group.startFrame].timestampMs,
    endTimeMs: frames[group.endFrame].timestampMs,
    details: {
      maxDistance: Math.max(
        ...frames
          .slice(group.startFrame, group.endFrame + 1)
          .map((frame) => frame.baselineDistance ?? 0),
      ),
    },
  }));
}

export function groupUnstableFrames(
  frames: CapturedFrame[],
  maxFrameDelta: number,
): Array<{ startFrame: number; endFrame: number; count: number }> {
  return groupFrameList(
    frames.filter((frame) => (frame.frameDelta ?? 0) > maxFrameDelta),
  );
}

function findNearestBaselineFrame(
  timestampMs: number,
  baselineFrames: CapturedFrame[],
  maxDriftMs: number,
): CapturedFrame | undefined {
  let best: CapturedFrame | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const frame of baselineFrames) {
    const distance = Math.abs(frame.timestampMs - timestampMs);
    if (distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }

  return best && bestDistance <= maxDriftMs ? best : undefined;
}

function groupFrameList(
  frames: CapturedFrame[],
): Array<{ startFrame: number; endFrame: number; count: number }> {
  const groups: Array<{ startFrame: number; endFrame: number; count: number }> =
    [];

  for (const frame of frames) {
    const current = groups.at(-1);
    if (current && frame.index === current.endFrame + 1) {
      current.endFrame = frame.index;
      current.count += 1;
    } else {
      groups.push({
        startFrame: frame.index,
        endFrame: frame.index,
        count: 1,
      });
    }
  }

  return groups;
}

function mergeAdjacentEvents(
  events: GlitchEvent[],
  detector: GlitchEvent["detector"],
): GlitchEvent[] {
  const merged: GlitchEvent[] = [];
  for (const event of events) {
    const current = merged.at(-1);
    if (
      current &&
      current.detector === detector &&
      event.startFrame === current.endFrame + 1
    ) {
      current.endFrame = event.endFrame;
      current.endTimeMs = event.endTimeMs;
    } else {
      merged.push({ ...event });
    }
  }
  return merged;
}
