import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type {
  CaptureRun,
  GlitchEvent,
  TimelineManifest,
  VisualGlitchConfig,
} from "./types";
import {
  emptyDir,
  ensureDir,
  frameFileName,
  relativeDisplayPath,
  sanitizeName,
} from "./fs-utils";

export type WrittenReport = {
  reportJsonPath: string;
  reportHtmlPath: string;
};

export async function writeFailureReport(
  run: CaptureRun,
  events: GlitchEvent[],
  config: VisualGlitchConfig,
  baseline?: TimelineManifest,
): Promise<WrittenReport> {
  const root = path.join(config.outputDir, sanitizeName(run.name));
  const currentDir = path.join(root, "frames", "current");
  const baselineDir = path.join(root, "frames", "baseline");
  const diffDir = path.join(root, "frames", "diff");
  await emptyDir(root);
  await ensureDir(currentDir);
  await ensureDir(baselineDir);
  await ensureDir(diffDir);

  const extension = config.capture.imageFormat === "png" ? "png" : "jpg";
  const currentFramePaths: string[] = [];
  for (let index = 0; index < run.rawFrames.length; index += 1) {
    const imagePath = path.join(currentDir, frameFileName(index, extension));
    await fs.writeFile(imagePath, run.rawFrames[index].buffer);
    currentFramePaths.push(imagePath);
    run.frames[index].imagePath = imagePath;
  }

  const baselineFramePaths = await copyBaselineFrames(baseline, baselineDir);
  const diffFramePaths = await writeDiffFrames(
    run,
    baseline,
    currentFramePaths,
    diffDir,
  );

  const reportJsonPath = path.join(root, "report.json");
  const reportHtmlPath = path.join(root, "report.html");
  const report = {
    name: run.name,
    passed: false,
    startedAt: run.startedAt,
    testTitle: run.testTitle,
    browser: run.browserName,
    viewport: run.viewport,
    os: run.os,
    fps: run.fps,
    durationMs: run.durationMs,
    mode: run.mode,
    events,
    frames: run.frames,
    baseline: baseline
      ? {
          manifest: baseline,
          copiedFrames: baselineFramePaths,
        }
      : undefined,
    diffFrames: diffFramePaths,
  };

  await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(
    reportHtmlPath,
    renderHtmlReport(run, events, currentFramePaths, baselineFramePaths, diffFramePaths),
  );

  return { reportJsonPath, reportHtmlPath };
}

async function copyBaselineFrames(
  baseline: TimelineManifest | undefined,
  baselineDir: string,
): Promise<string[]> {
  if (!baseline) {
    return [];
  }

  const copied: string[] = [];
  for (let index = 0; index < baseline.frames.length; index += 1) {
    const source = baseline.frames[index].imagePath;
    if (!source) {
      continue;
    }

    const extension = path.extname(source).replace(".", "") || "jpg";
    const destination = path.join(baselineDir, frameFileName(index, extension));
    await fs.copyFile(source, destination).catch(() => undefined);
    copied[index] = destination;
  }
  return copied;
}

async function writeDiffFrames(
  run: CaptureRun,
  baseline: TimelineManifest | undefined,
  currentFramePaths: string[],
  diffDir: string,
): Promise<string[]> {
  if (!baseline) {
    return [];
  }

  const diffs: string[] = [];
  for (let index = 0; index < run.frames.length; index += 1) {
    const current = currentFramePaths[index];
    const baselineFrame = nearestBaselineFrame(run.frames[index].timestampMs, baseline);
    if (!baselineFrame?.imagePath) {
      continue;
    }

    const diffPath = path.join(diffDir, frameFileName(index, "png"));
    try {
      const currentRaw = await sharp(current)
        .resize(320, 200, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const baselineRaw = await sharp(baselineFrame.imagePath)
        .resize(320, 200, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer();

      const output = Buffer.alloc(currentRaw.data.length);
      for (let offset = 0; offset < currentRaw.data.length; offset += 4) {
        output[offset] = Math.abs(currentRaw.data[offset] - baselineRaw[offset]);
        output[offset + 1] = Math.abs(
          currentRaw.data[offset + 1] - baselineRaw[offset + 1],
        );
        output[offset + 2] = Math.abs(
          currentRaw.data[offset + 2] - baselineRaw[offset + 2],
        );
        output[offset + 3] = 255;
      }

      await sharp(output, {
        raw: {
          width: currentRaw.info.width,
          height: currentRaw.info.height,
          channels: 4,
        },
      })
        .png()
        .toFile(diffPath);
      diffs[index] = diffPath;
    } catch {
      continue;
    }
  }
  return diffs;
}

function nearestBaselineFrame(
  timestampMs: number,
  baseline: TimelineManifest,
): TimelineManifest["frames"][number] | undefined {
  return baseline.frames.reduce<TimelineManifest["frames"][number] | undefined>(
    (best, frame) => {
      if (!best) {
        return frame;
      }
      return Math.abs(frame.timestampMs - timestampMs) <
        Math.abs(best.timestampMs - timestampMs)
        ? frame
        : best;
    },
    undefined,
  );
}

function renderHtmlReport(
  run: CaptureRun,
  events: GlitchEvent[],
  currentFramePaths: string[],
  baselineFramePaths: string[],
  diffFramePaths: string[],
): string {
  const firstEvent = events[0];
  const firstBadFrame = firstEvent?.startFrame ?? 0;
  const previousFrame = Math.max(0, firstBadFrame - 1);
  const nextFrame = Math.min(currentFramePaths.length - 1, firstBadFrame + 1);
  const payload = JSON.stringify({
    run,
    events,
    currentFramePaths: currentFramePaths.map((filePath) =>
      path.relative(path.dirname(path.join(run.name, "report.html")), filePath),
    ),
    baselineFramePaths,
    diffFramePaths,
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visual glitch report: ${escapeHtml(run.name)}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #202124; background: #f7f8fa; }
    header { padding: 24px 32px; background: #ffffff; border-bottom: 1px solid #d9dde3; }
    main { padding: 24px 32px 40px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    h2 { margin: 28px 0 12px; font-size: 18px; }
    code { background: #edf0f5; padding: 2px 5px; border-radius: 4px; }
    .meta, .event { display: grid; gap: 6px; }
    .event { padding: 12px; border: 1px solid #d9dde3; background: #fff; border-radius: 8px; margin-bottom: 10px; }
    .frames { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    figure { margin: 0; background: #fff; border: 1px solid #d9dde3; border-radius: 8px; overflow: hidden; }
    figcaption { padding: 8px 10px; font-size: 13px; background: #f1f3f7; border-bottom: 1px solid #d9dde3; }
    img { display: block; width: 100%; height: auto; image-rendering: auto; }
    input[type="range"] { width: 100%; }
    .scrubber { margin: 20px 0; padding: 16px; background: #fff; border: 1px solid #d9dde3; border-radius: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>Visual glitch detected: ${escapeHtml(run.name)}</h1>
    <div class="meta">
      <div>Test: <code>${escapeHtml(run.testTitle ?? "unknown")}</code></div>
      <div>Browser: <code>${escapeHtml(run.browserName)}</code> Viewport: <code>${run.viewport.width}x${run.viewport.height}</code> OS: <code>${run.os}</code></div>
      <div>Mode: <code>${run.mode}</code> FPS: <code>${run.fps}</code> Duration: <code>${run.durationMs}ms</code></div>
    </div>
  </header>
  <main>
    <h2>Failing Detectors</h2>
    ${events
      .map(
        (event) => `<section class="event">
      <strong>${escapeHtml(event.detector)}</strong>
      <span>${escapeHtml(event.message)}</span>
      <span>Frame range: ${event.startFrame}-${event.endFrame}</span>
      <span>Time range: ${Math.round(event.startTimeMs)}ms-${Math.round(event.endTimeMs)}ms</span>
    </section>`,
      )
      .join("")}

    <section class="scrubber">
      <label for="timeline">Timeline frame: <span id="frame-number">${firstBadFrame}</span></label>
      <input id="timeline" type="range" min="0" max="${Math.max(0, currentFramePaths.length - 1)}" value="${firstBadFrame}">
    </section>

    <h2>Failure Context</h2>
    <div class="frames">
      ${renderFigure("Previous frame", currentFramePaths[previousFrame])}
      ${renderFigure("First bad frame", currentFramePaths[firstBadFrame])}
      ${renderFigure("Next frame", currentFramePaths[nextFrame])}
      ${renderFigure("Baseline frame", baselineFramePaths[firstBadFrame])}
      ${renderFigure("Visual diff", diffFramePaths[firstBadFrame])}
    </div>
  </main>
  <script>
    const data = ${payload};
    const slider = document.getElementById("timeline");
    const frameNumber = document.getElementById("frame-number");
    slider.addEventListener("input", () => {
      frameNumber.textContent = slider.value;
    });
  </script>
</body>
</html>`;
}

function renderFigure(title: string, filePath?: string): string {
  if (!filePath) {
    return `<figure><figcaption>${escapeHtml(title)}</figcaption><div style="padding:24px">Not available</div></figure>`;
  }
  return `<figure><figcaption>${escapeHtml(title)} <code>${escapeHtml(relativeDisplayPath(filePath))}</code></figcaption><img src="${escapeHtml(pathToFileUrl(filePath))}" alt="${escapeHtml(title)}"></figure>`;
}

function pathToFileUrl(filePath: string): string {
  return `file://${filePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
