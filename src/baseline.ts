import fs from "node:fs/promises";
import path from "node:path";
import type {
  CaptureConfig,
  CaptureRun,
  TimelineManifest,
  VisualGlitchConfig,
} from "./types";
import { emptyDir, ensureDir, frameFileName, sanitizeName } from "./fs-utils";

export function baselineRootForName(
  config: VisualGlitchConfig,
  name: string,
): string {
  return path.join(config.baselineDir, sanitizeName(name));
}

export async function loadBaseline(
  config: VisualGlitchConfig,
  name: string,
): Promise<TimelineManifest | undefined> {
  const manifestPath = path.join(baselineRootForName(config, name), "manifest.json");
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(content) as TimelineManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function saveBaseline(
  run: CaptureRun,
  config: VisualGlitchConfig,
  capture: CaptureConfig,
): Promise<TimelineManifest> {
  const root = baselineRootForName(config, run.name);
  const framesDir = path.join(root, "frames");
  await emptyDir(root);
  await ensureDir(framesDir);

  const extension = capture.imageFormat === "png" ? "png" : "jpg";
  const frames = await Promise.all(
    run.frames.map(async (frame, index) => {
      const rawFrame = run.rawFrames[index];
      const imagePath = path.join(framesDir, frameFileName(index, extension));
      if (rawFrame) {
        await fs.writeFile(imagePath, rawFrame.buffer);
      }
      return {
        ...frame,
        imagePath,
      };
    }),
  );

  const manifest: TimelineManifest = {
    name: run.name,
    createdAt: new Date().toISOString(),
    browser: run.browserName,
    viewport: run.viewport,
    fps: run.fps,
    durationMs: run.durationMs,
    frameCount: frames.length,
    frames,
  };

  await fs.writeFile(
    path.join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}
