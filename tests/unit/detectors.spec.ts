import { test, expect } from "@playwright/test";
import {
  detectBaselineDistance,
  detectBlankFlashes,
  detectDarkFlashes,
  detectInstability,
  groupUnstableFrames,
} from "../../src";
import type { CapturedFrame, ThresholdConfig, TimelineManifest } from "../../src";

const thresholds: ThresholdConfig = {
  maxFrameDelta: 0.35,
  maxBlankFrameRatio: 0.92,
  maxDarkFrameRatio: 0.92,
  minTextVisibilityRatio: 0.02,
  maxConsecutiveUnstableFrames: 3,
  maxBaselineDistance: 0.25,
};

test("blank flashes are detected only after meaningful content", () => {
  const events = detectBlankFlashes(
    [
      frame(0, { blankRatio: 0.3 }),
      frame(1, { blankRatio: 0.99 }),
      frame(2, { blankRatio: 0.99 }),
    ],
    thresholds,
  );

  expect(events).toHaveLength(1);
  expect(events[0].detector).toBe("blank-flash");
  expect(events[0].startFrame).toBe(1);
  expect(events[0].endFrame).toBe(1);
});

test("stable mostly blank pages do not trigger blank flashes", () => {
  const events = detectBlankFlashes(
    [
      frame(0, { blankRatio: 0.96 }),
      frame(1, { blankRatio: 0.96 }),
      frame(2, { blankRatio: 0.96 }),
    ],
    thresholds,
  );

  expect(events).toEqual([]);
});

test("dark flashes are detected after non-dark content", () => {
  const events = detectDarkFlashes(
    [
      frame(0, { darkRatio: 0.05 }),
      frame(1, { darkRatio: 0.98 }),
      frame(2, { darkRatio: 0.05 }),
    ],
    thresholds,
  );

  expect(events).toHaveLength(1);
  expect(events[0].detector).toBe("dark-flash");
});

test("unstable frames are grouped and classified", () => {
  const frames = [
    frame(0, { frameDelta: 0 }),
    frame(1, { frameDelta: 0.4 }),
    frame(2, { frameDelta: 0.42 }),
    frame(3, { frameDelta: 0.41 }),
    frame(4, { frameDelta: 0.39 }),
    frame(5, { frameDelta: 0.1 }),
  ];

  expect(groupUnstableFrames(frames, thresholds.maxFrameDelta)).toEqual([
    { startFrame: 1, endFrame: 4, count: 4 },
  ]);

  const events = detectInstability(frames, thresholds);
  expect(events).toHaveLength(1);
  expect(events[0].detector).toBe("consecutive-instability");
});

test("baseline matching allows small timing drift", () => {
  const baseline: TimelineManifest = {
    name: "baseline-test",
    createdAt: new Date().toISOString(),
    browser: "chromium",
    viewport: { width: 100, height: 100 },
    fps: 10,
    durationMs: 200,
    frameCount: 2,
    frames: [
      frame(0, { timestampMs: 0, perceptualHash: "0000000000000000" }),
      frame(1, { timestampMs: 100, perceptualHash: "0000000000000000" }),
    ],
  };

  const events = detectBaselineDistance(
    [
      frame(0, {
        timestampMs: 20,
        perceptualHash: "0000000000000000",
      }),
      frame(1, {
        timestampMs: 120,
        perceptualHash: "ffffffffffffffff",
      }),
    ],
    baseline,
    thresholds,
    10,
  );

  expect(events).toHaveLength(1);
  expect(events[0].detector).toBe("baseline-distance");
  expect(events[0].startFrame).toBe(1);
});

function frame(
  index: number,
  overrides: Partial<CapturedFrame> = {},
): CapturedFrame {
  return {
    index,
    timestampMs: index * 50,
    width: 100,
    height: 100,
    hash: "hash",
    perceptualHash: "0000000000000000",
    averageLuminance: 120,
    blankRatio: 0.2,
    darkRatio: 0.1,
    ...overrides,
  };
}
