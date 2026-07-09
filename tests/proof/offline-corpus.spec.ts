import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { analyzeVisualFrameFiles } from "../../src";
import {
  attachProofArtifacts,
  hasAnyDetector,
  writeProofOutcome,
} from "./helpers";

type OfflineCorpusEntry = {
  id: string;
  kind: string;
  sourceUrl: string;
  documentedCategory: string;
  frames: string[];
  expectedUiGlitchHunterDetectors: string[];
  forbiddenUiGlitchHunterDetectors: string[];
  requiredForDefaultCi: boolean;
  notes: string[];
};

test("offline-corpus: source-backed generated frame manifest detects visual instability", async ({}, testInfo) => {
  const root = testInfo.outputPath("offline-corpus");
  await fs.mkdir(root, { recursive: true });
  const framePaths = [
    await writePatternFrame(root, "frame-000.png", [20, 120, 220], [230, 90, 40]),
    await writePatternFrame(root, "frame-001.png", [230, 90, 40], [20, 120, 220]),
    await writePatternFrame(root, "frame-002.png", [20, 120, 220], [230, 90, 40]),
  ];
  const manifestPath = path.join(root, "manifest.json");
  const manifest = {
    version: 1,
    entries: [
      {
        id: "offline-generated-layout-shift",
        kind: "offline-generated-frame-sequence",
        sourceUrl: "https://web.dev/articles/debug-layout-shifts",
        documentedCategory: "layout shift / visual jump",
        frames: framePaths.map((filePath) => path.relative(root, filePath)),
        expectedUiGlitchHunterDetectors: ["large-delta"],
        forbiddenUiGlitchHunterDetectors: [],
        requiredForDefaultCi: true,
        notes: [
          "Generated proof fixture derived from documented visual movement; no third-party image asset is vendored.",
        ],
      } satisfies OfflineCorpusEntry,
    ],
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const entry = manifest.entries[0];
  const resolvedFrames = entry.frames.map((framePath) =>
    path.resolve(path.dirname(manifestPath), framePath),
  );
  const result = await analyzeVisualFrameFiles({
    name: proofName(testInfo, entry.id),
    frames: resolvedFrames,
    imageFormat: "png",
    thresholds: { maxFrameDelta: 0.02, maxConsecutiveUnstableFrames: 4 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
    viewport: { width: 80, height: 60 },
  });
  const observedDetectors = result.events.map((event) => event.detector);
  const outcomePassed = hasAnyDetector(
    result,
    entry.expectedUiGlitchHunterDetectors,
  );
  const outcomePath = await writeProofOutcome({
    proofId: entry.id,
    sourceId: entry.id,
    proofType: "offline-corpus",
    claim:
      "Detects source-backed offline frame-sequence visual instability without live hosted pages.",
    status: outcomePassed ? "passed" : "failed",
    evidence: [
      entry.id,
      `source:${entry.sourceUrl}`,
      ...observedDetectors.map((detector) => `detector:${detector}`),
    ],
    browser: "offline-frame-files",
    observedDetectors,
    oracle: {
      manifestPath,
      sourceUrl: entry.sourceUrl,
      kind: entry.kind,
    },
    reportJsonPath: result.reportJsonPath,
    reportHtmlPath: result.reportHtmlPath,
  });

  await testInfo.attach("offline-corpus-manifest", {
    path: manifestPath,
    contentType: "application/json",
  });
  await testInfo.attach("proof-outcome", {
    path: outcomePath,
    contentType: "application/json",
  });
  await attachProofArtifacts(testInfo, result, {
    source: entry,
    manifestPath,
    outcomePath,
    observedDetectors,
    frameCount: result.frames.length,
  });

  expect(outcomePassed).toBe(true);
});

async function writePatternFrame(
  root: string,
  fileName: string,
  first: [number, number, number],
  second: [number, number, number],
): Promise<string> {
  const size = { width: 80, height: 60 };
  const filePath = path.join(root, fileName);
  const channels = 4;
  const data = Buffer.alloc(size.width * size.height * channels);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const color = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? first : second;
      const offset = (y * size.width + x) * channels;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }

  await sharp(data, {
    raw: {
      width: size.width,
      height: size.height,
      channels,
    },
  })
    .png()
    .toFile(filePath);
  return filePath;
}

function proofName(testInfo: { title: string; project: { name: string } }, suffix: string): string {
  return `${testInfo.project.name}-${testInfo.title}-${suffix}`.replace(
    /[^a-z0-9_-]+/gi,
    "-",
  );
}
