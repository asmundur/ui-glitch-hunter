import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { writeFailureReport } from "../../src/report";
import type { CaptureRun, GlitchEvent, VisualGlitchConfig } from "../../src";

test("writes JSON and HTML reports with frame artifacts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "visual-glitch-report-"));
  const config: VisualGlitchConfig = {
    outputDir: path.join(root, "out"),
    baselineDir: path.join(root, "baselines"),
    capture: {
      mode: "screenshot",
      fps: 10,
      durationMs: 200,
      imageFormat: "jpeg",
      quality: 80,
      viewport: { width: 100, height: 100 },
    },
    thresholds: {
      maxFrameDelta: 0.35,
      maxBlankFrameRatio: 0.92,
      maxDarkFrameRatio: 0.92,
      minTextVisibilityRatio: 0.02,
      maxConsecutiveUnstableFrames: 6,
      maxBaselineDistance: 0.25,
    },
    masks: [],
  };
  const rawFrames = [
    { index: 0, timestampMs: 0, buffer: await solid("#222222") },
    { index: 1, timestampMs: 100, buffer: await solid("#ffffff") },
  ];
  const run: CaptureRun = {
    name: "report-test",
    startedAt: new Date().toISOString(),
    mode: "screenshot",
    fps: 10,
    durationMs: 200,
    viewport: { width: 100, height: 100 },
    browserName: "chromium",
    os: process.platform,
    frames: rawFrames.map((rawFrame) => ({
      index: rawFrame.index,
      timestampMs: rawFrame.timestampMs,
      width: 100,
      height: 100,
      hash: "hash",
      perceptualHash: "0000000000000000",
      averageLuminance: 100,
      blankRatio: rawFrame.index === 1 ? 1 : 0,
      darkRatio: rawFrame.index === 0 ? 1 : 0,
    })),
    rawFrames,
    badTextEvents: [],
  };
  const events: GlitchEvent[] = [
    {
      detector: "blank-flash",
      message: "blank",
      startFrame: 1,
      endFrame: 1,
      startTimeMs: 100,
      endTimeMs: 100,
    },
  ];

  const report = await writeFailureReport(run, events, config);

  await expect(fs.stat(report.reportJsonPath)).resolves.toBeTruthy();
  await expect(fs.stat(report.reportHtmlPath)).resolves.toBeTruthy();
  await expect(
    fs.stat(path.join(config.outputDir, "report-test", "frames", "current", "000001.jpg")),
  ).resolves.toBeTruthy();

  const json = JSON.parse(await fs.readFile(report.reportJsonPath, "utf8"));
  expect(json.events[0].detector).toBe("blank-flash");
  await fs.rm(root, { recursive: true, force: true });
});

async function solid(background: string): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background,
    },
  })
    .jpeg()
    .toBuffer();
}
