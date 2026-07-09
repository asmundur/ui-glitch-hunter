import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  attachProofArtifacts,
  externalProofEnabled,
  getProofSource,
  hasAnyDetector,
  hasNoDetector,
  readProofSources,
  writeProofOutcome,
} from "../proof/helpers";
import type { LayoutShiftProofEntry } from "../proof/helpers";
import type { GlitchEvent } from "../../src";

test("externalProofEnabled is true only for exact opt-in value", () => {
  const previous = process.env.VISUAL_GLITCH_PROOF_EXTERNAL;
  try {
    delete process.env.VISUAL_GLITCH_PROOF_EXTERNAL;
    expect(externalProofEnabled()).toBe(false);

    process.env.VISUAL_GLITCH_PROOF_EXTERNAL = "true";
    expect(externalProofEnabled()).toBe(false);

    process.env.VISUAL_GLITCH_PROOF_EXTERNAL = "1";
    expect(externalProofEnabled()).toBe(true);
  } finally {
    if (previous === undefined) {
      delete process.env.VISUAL_GLITCH_PROOF_EXTERNAL;
    } else {
      process.env.VISUAL_GLITCH_PROOF_EXTERNAL = previous;
    }
  }
});

test("LayoutShiftProofEntry is a JSON serializable browser oracle shape", () => {
  const entry = {
    value: 0.12,
    hadRecentInput: true,
    startTime: 123.4,
    sources: [
      {
        node: "button#move",
        previousRect: { x: 0, y: 0, width: 100, height: 20, top: 0, right: 100, bottom: 20, left: 0 },
        currentRect: { x: 0, y: 20, width: 100, height: 20, top: 20, right: 100, bottom: 40, left: 0 },
      },
    ],
  } satisfies LayoutShiftProofEntry;

  expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
});

test("detector predicate helpers match observed event names", () => {
  const result = {
    events: [
      event("large-delta"),
      event("blank-flash"),
    ],
  };

  expect(hasAnyDetector(result, ["consecutive-instability", "large-delta"])).toBe(true);
  expect(hasAnyDetector(result, ["dark-flash"])).toBe(false);
  expect(hasNoDetector(result, ["dark-flash", "bad-text"])).toBe(true);
  expect(hasNoDetector(result, ["blank-flash"])).toBe(false);
});

test("proof source catalog helpers read and validate source-backed entries", async () => {
  const sources = await readProofSources();
  expect(sources.map((source) => source.id)).toContain("webdev-layout-shift-demo");
  expect(sources.map((source) => source.id)).toContain("next-themes-no-flash");

  const layout = await getProofSource("webdev-layout-shift-demo");
  expect(layout.sourceUrl).toBe("https://web.dev/articles/debug-layout-shifts");
  expect(layout.requiredForDefaultCi).toBe(false);
  expect(layout.expectedUiGlitchHunterDetectors).toEqual([
    "large-delta",
    "consecutive-instability",
  ]);

  await expect(getProofSource("missing-source")).rejects.toThrow(
    "Unknown proof source id: missing-source",
  );
});

test("attachProofArtifacts attaches reports and JSON proof metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "proof-artifacts-"));
  const reportJsonPath = path.join(root, "report.json");
  const reportHtmlPath = path.join(root, "report.html");
  await fs.writeFile(reportJsonPath, "{}\n");
  await fs.writeFile(reportHtmlPath, "<!doctype html>\n");
  const attachments: Array<{
    name: string;
    options: { path?: string; body?: string | Buffer; contentType?: string };
  }> = [];

  await attachProofArtifacts(
    {
      attach: async (
        name: string,
        options: { path?: string; body?: string | Buffer; contentType?: string },
      ) => {
        attachments.push({ name, options });
      },
    },
    {
      name: "proof-test",
      passed: false,
      events: [event("large-delta")],
      reportJsonPath,
      reportHtmlPath,
    },
    {
      source: { id: "webdev-layout-shift-demo" },
      browserLayoutShiftEntries: [{ value: 0.1 }],
    },
  );

  expect(attachments.map((attachment) => attachment.name)).toEqual([
    "proof-report-json",
    "proof-report-html",
    "proof-metadata",
  ]);
  expect(attachments[0].options.path).toBe(reportJsonPath);
  expect(attachments[1].options.path).toBe(reportHtmlPath);
  expect(JSON.parse(String(attachments[2].options.body)).source.id).toBe(
    "webdev-layout-shift-demo",
  );
  await fs.rm(root, { recursive: true, force: true });
});

test("writeProofOutcome writes a stable summary input file", async () => {
  const resultsDir = await fs.mkdtemp(path.join(os.tmpdir(), "proof-outcome-"));

  const outcomePath = await writeProofOutcome(
    {
      proofId: "webdev-layout-shift-demo",
      sourceId: "webdev-layout-shift-demo",
      claim:
        "Detects layout-shift-like visual instability when the browser Layout Instability API reports movement.",
      status: "passed",
      evidence: ["webdev-layout-shift-demo", "layout-shift-entries:2"],
      browser: "chromium",
      observedDetectors: ["large-delta"],
      oracle: { layoutShiftEntries: 2 },
      thresholdProfile: "default",
    },
    { resultsDir },
  );

  const parsed = JSON.parse(await fs.readFile(outcomePath, "utf8"));
  expect(path.dirname(outcomePath)).toBe(path.join(resultsDir, "outcomes"));
  expect(path.basename(outcomePath)).toBe("webdev-layout-shift-demo.json");
  expect(parsed).toMatchObject({
    proofId: "webdev-layout-shift-demo",
    sourceId: "webdev-layout-shift-demo",
    status: "passed",
    evidence: ["webdev-layout-shift-demo", "layout-shift-entries:2"],
    browser: "chromium",
    observedDetectors: ["large-delta"],
    oracle: { layoutShiftEntries: 2 },
    thresholdProfile: "default",
  });
  await fs.rm(resultsDir, { recursive: true, force: true });
});

function event(detector: GlitchEvent["detector"]): GlitchEvent {
  return {
    detector,
    message: detector,
    startFrame: 0,
    endFrame: 0,
    startTimeMs: 0,
    endTimeMs: 0,
  };
}
