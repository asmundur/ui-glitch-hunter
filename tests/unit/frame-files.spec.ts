import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { analyzeVisualFrameFiles } from "../../src";

const size = { width: 80, height: 60 };

test("analyzeVisualFrameFiles detects blank flashes from ordered frame files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-files-blank-"));
  const frames = [
    await writePatternFrame(root, "000.png", [32, 96, 180], [220, 80, 40]),
    await writeSolidFrame(root, "001.png", [255, 255, 255]),
    await writePatternFrame(root, "002.png", [32, 96, 180], [220, 80, 40]),
  ];

  const result = await analyzeVisualFrameFiles({
    name: "offline-blank-flash",
    frames,
    fps: 20,
    durationMs: 150,
    imageFormat: "png",
    outputDir: path.join(root, "reports"),
    baselineDir: path.join(root, "baselines"),
    viewport: size,
  });

  expect(result.mode).toBe("frame-files");
  expect(result.browserName).toBe("offline-frame-files");
  expect(result.frames.map((frame) => frame.index)).toEqual([0, 1, 2]);
  expect(result.frames.map((frame) => frame.timestampMs)).toEqual([0, 50, 100]);
  expect(result.events.some((event) => event.detector === "blank-flash")).toBe(true);
  await expect(fs.stat(result.reportJsonPath ?? "")).resolves.toBeTruthy();
  await expect(fs.stat(result.reportHtmlPath ?? "")).resolves.toBeTruthy();
  const report = JSON.parse(await fs.readFile(result.reportJsonPath ?? "", "utf8"));
  expect(report.mode).toBe("frame-files");
  expect(report.browser).toBe("offline-frame-files");
  await fs.rm(root, { recursive: true, force: true });
});

test("analyzeVisualFrameFiles detects visual instability from frame files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-files-jump-"));
  const frames = [
    await writePatternFrame(root, "000.png", [20, 120, 220], [230, 90, 40]),
    await writePatternFrame(root, "001.png", [230, 90, 40], [20, 120, 220]),
    await writePatternFrame(root, "002.png", [20, 120, 220], [230, 90, 40]),
  ];

  const result = await analyzeVisualFrameFiles({
    name: "offline-visual-jump",
    frames,
    imageFormat: "png",
    thresholds: { maxFrameDelta: 0.02, maxConsecutiveUnstableFrames: 4 },
    outputDir: path.join(root, "reports"),
    baselineDir: path.join(root, "baselines"),
    viewport: size,
  });

  expect(result.events.some((event) => event.detector === "large-delta")).toBe(true);
  await fs.rm(root, { recursive: true, force: true });
});

test("analyzeVisualFrameFiles detects baseline drift with baselineFrames", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-files-baseline-"));
  const frames = [
    await writePatternFrame(root, "current-000.png", [20, 120, 220], [230, 90, 40]),
    await writePatternFrame(root, "current-001.png", [20, 120, 220], [230, 90, 40]),
  ];
  const baselineFrames = [
    await writePatternFrame(
      root,
      "baseline-000.png",
      [20, 160, 80],
      [90, 40, 220],
      { width: 40, height: 30 },
    ),
    await writePatternFrame(
      root,
      "baseline-001.png",
      [20, 160, 80],
      [90, 40, 220],
      { width: 40, height: 30 },
    ),
  ];

  const result = await analyzeVisualFrameFiles({
    name: "offline-baseline-drift",
    frames,
    baselineFrames,
    imageFormat: "png",
    thresholds: { maxBaselineDistance: 0.01 },
    outputDir: path.join(root, "reports"),
    baselineDir: path.join(root, "baselines"),
    viewport: size,
  });

  expect(result.events.some((event) => event.detector === "baseline-distance")).toBe(true);
  expect(result.baselineManifest?.frames.map((frame) => frame.imagePath)).toEqual(
    baselineFrames,
  );
  expect(result.baselineManifest?.frames[0].width).toBe(40);
  expect(result.baselineManifest?.frames[0].height).toBe(30);
  await expect(fs.stat(result.reportJsonPath ?? "")).resolves.toBeTruthy();
  await fs.rm(root, { recursive: true, force: true });
});

test("analyzeVisualFrameFiles rejects missing and unreadable frame files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-files-errors-"));
  const missingPath = path.join(root, "missing.png");
  await expect(
    analyzeVisualFrameFiles({
      name: "missing-frame",
      frames: [missingPath],
      outputDir: path.join(root, "reports"),
      baselineDir: path.join(root, "baselines"),
    }),
  ).rejects.toThrow(missingPath);

  const unreadablePath = path.join(root, "not-an-image.png");
  await fs.writeFile(unreadablePath, "not an image");
  await expect(
    analyzeVisualFrameFiles({
      name: "unreadable-frame",
      frames: [unreadablePath],
      outputDir: path.join(root, "reports"),
      baselineDir: path.join(root, "baselines"),
    }),
  ).rejects.toThrow(unreadablePath);

  const validPath = await writePatternFrame(root, "valid.png", [32, 96, 180], [220, 80, 40]);
  const missingBaselinePath = path.join(root, "missing-baseline.png");
  await expect(
    analyzeVisualFrameFiles({
      name: "missing-baseline-frame",
      frames: [validPath],
      baselineFrames: [missingBaselinePath],
      outputDir: path.join(root, "reports"),
      baselineDir: path.join(root, "baselines"),
    }),
  ).rejects.toThrow(missingBaselinePath);
  await fs.rm(root, { recursive: true, force: true });
});

test("analyzeVisualFrameFiles rejects excessive frame counts before reading files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "frame-files-limits-"));
  const repeatedMissingPath = path.join(root, "missing.png");

  await expect(
    analyzeVisualFrameFiles({
      name: "too-many-frames",
      frames: Array.from({ length: 501 }, () => repeatedMissingPath),
      outputDir: path.join(root, "reports"),
      baselineDir: path.join(root, "baselines"),
    }),
  ).rejects.toThrow("at most 500 frame files");
  await fs.rm(root, { recursive: true, force: true });
});

async function writeSolidFrame(
  root: string,
  fileName: string,
  color: [number, number, number],
): Promise<string> {
  const filePath = path.join(root, fileName);
  await sharp({
    create: {
      width: size.width,
      height: size.height,
      channels: 3,
      background: { r: color[0], g: color[1], b: color[2] },
    },
  })
    .png()
    .toFile(filePath);
  return filePath;
}

async function writePatternFrame(
  root: string,
  fileName: string,
  first: [number, number, number],
  second: [number, number, number],
  dimensions = size,
): Promise<string> {
  const filePath = path.join(root, fileName);
  const channels = 4;
  const data = Buffer.alloc(dimensions.width * dimensions.height * channels);
  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const color = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? first : second;
      const offset = (y * dimensions.width + x) * channels;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }

  await sharp(data, {
    raw: {
      width: dimensions.width,
      height: dimensions.height,
      channels,
    },
  })
    .png()
    .toFile(filePath);
  return filePath;
}
