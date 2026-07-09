import fs from "node:fs/promises";
import os from "node:os";
import sharp from "sharp";
import { analyzeCaptureRun } from "./analysis";
import { resolveRunConfig } from "./config";
import { analyzeRawFrames } from "./image-metrics";
import type {
  AnalyzeVisualFrameFilesOptions,
  CaptureRun,
  CaptureTimelineResult,
  RawFrame,
  TimelineManifest,
  ViewportSize,
} from "./types";

const offlineBrowserName = "offline-frame-files";
const maxFrameFiles = 500;
const maxFrameFileBytes = 25 * 1024 * 1024;

export async function analyzeVisualFrameFiles(
  options: AnalyzeVisualFrameFilesOptions,
): Promise<CaptureTimelineResult> {
  if (!options.name?.trim()) {
    throw new Error("Frame-file analysis requires a non-empty `name` option.");
  }
  if (!Array.isArray(options.frames) || options.frames.length === 0) {
    throw new Error("Frame-file analysis requires at least one frame file.");
  }
  assertFrameCount(options.frames, "Frame-file analysis");

  const loadedConfig = resolveRunConfig({
    name: options.name,
    outputDir: options.outputDir,
    baselineDir: options.baselineDir,
    fps: options.fps,
    durationMs: options.durationMs,
    imageFormat: options.imageFormat,
    viewport: options.viewport,
    thresholds: options.thresholds,
  });
  const fps = loadedConfig.capture.fps;
  const rawFrames = await loadRawFrameFiles(options.frames, fps, "frame");
  const frames = await analyzeRawFrames(rawFrames, [], loadedConfig.capture.viewport);
  const viewport = options.viewport ?? viewportFromFrames(frames);
  const durationMs =
    options.durationMs ?? rawFrames.at(-1)?.timestampMs ?? loadedConfig.capture.durationMs;
  const config = {
    ...loadedConfig,
    capture: {
      ...loadedConfig.capture,
      mode: "frame-files" as const,
      durationMs,
      viewport,
    },
  };
  const baselineManifest = options.baselineFrames
    ? await buildBaselineManifest(
        options.name,
        options.baselineFrames,
        fps,
        durationMs,
        viewport,
      )
    : undefined;

  const run: CaptureRun = {
    name: options.name,
    startedAt: new Date().toISOString(),
    mode: "frame-files",
    fps,
    durationMs,
    viewport,
    browserName: offlineBrowserName,
    os: os.platform(),
    frames,
    rawFrames,
    badTextEvents: [],
  };

  return analyzeCaptureRun(run, config, baselineManifest);
}

async function loadRawFrameFiles(
  framePaths: string[],
  fps: number,
  label: string,
): Promise<RawFrame[]> {
  const intervalMs = 1000 / Math.max(1, fps);
  const rawFrames: RawFrame[] = [];

  for (let index = 0; index < framePaths.length; index += 1) {
    const filePath = framePaths[index];
    let stats: Awaited<ReturnType<typeof fs.stat>>;
    let buffer: Buffer;
    try {
      stats = await fs.stat(filePath);
    } catch (error) {
      throw new Error(
        `Unable to read ${label} file ${filePath}: ${(error as Error).message}`,
      );
    }
    if (!stats.isFile()) {
      throw new Error(`Unable to read ${label} file ${filePath}: not a file.`);
    }
    if (stats.size > maxFrameFileBytes) {
      throw new Error(
        `${label} file ${filePath} exceeds ${maxFrameFileBytes} byte limit.`,
      );
    }

    try {
      buffer = await fs.readFile(filePath);
    } catch (error) {
      throw new Error(
        `Unable to read ${label} file ${filePath}: ${(error as Error).message}`,
      );
    }

    try {
      await sharp(buffer, { failOn: "none" }).metadata();
    } catch (error) {
      throw new Error(
        `Unable to decode ${label} file ${filePath}: ${(error as Error).message}`,
      );
    }

    rawFrames.push({
      index,
      timestampMs: index * intervalMs,
      buffer,
    });
  }

  return rawFrames;
}

function assertFrameCount(framePaths: string[], label: string): void {
  if (framePaths.length > maxFrameFiles) {
    throw new Error(
      `${label} accepts at most ${maxFrameFiles} frame files; received ${framePaths.length}.`,
    );
  }
}

async function buildBaselineManifest(
  name: string,
  baselineFramePaths: string[],
  fps: number,
  durationMs: number,
  viewport: ViewportSize,
): Promise<TimelineManifest> {
  if (baselineFramePaths.length === 0) {
    throw new Error("baselineFrames must contain at least one frame file when provided.");
  }
  assertFrameCount(baselineFramePaths, "baselineFrames");
  const rawFrames = await loadRawFrameFiles(baselineFramePaths, fps, "baseline frame");
  const frames = await analyzeRawFrames(rawFrames, [], viewport);
  return {
    name,
    createdAt: new Date().toISOString(),
    browser: offlineBrowserName,
    viewport,
    fps,
    durationMs,
    frameCount: frames.length,
    frames: frames.map((frame, index) => ({
      ...frame,
      imagePath: baselineFramePaths[index],
    })),
  };
}

function viewportFromFrames(
  frames: Array<{ width: number; height: number }>,
): ViewportSize {
  const first = frames[0];
  return {
    width: first?.width ?? 0,
    height: first?.height ?? 0,
  };
}
