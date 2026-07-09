import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { runVisualGlitchCheck } from "../../src";
import type { CaptureTimelineResult, ThresholdConfig } from "../../src";
import {
  attachProofArtifacts,
  externalProofEnabled,
  getProofSource,
  hasAnyDetector,
  installLayoutShiftObserver,
  readLayoutShiftEntries,
  writeProofOutcome,
} from "./helpers";

const layoutShiftClaim =
  "Detects layout-shift-like visual instability when the browser Layout Instability API reports movement.";

test("external-layout-shift: browser Layout Instability API correlates with visual instability detection", async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  test.skip(
    !externalProofEnabled(),
    "Set VISUAL_GLITCH_PROOF_EXTERNAL=1 to run hosted proof tests.",
  );

  const source = await getProofSource("webdev-layout-shift-demo");
  await page.setViewportSize({ width: 800, height: 600 });
  let navigationStatus = (await page.goto(source.exampleUrl))?.status();
  await installDocumentedLayoutShiftFixture(page);
  await installLayoutShiftObserver(page);

  let thresholdProfile = "default";
  let result = await runLayoutShiftCapture(page, testInfo, "default");
  let browserLayoutShiftEntries = await readLayoutShiftEntries(page);
  let defaultThresholdResult: ReturnType<typeof summarizeResult> | undefined;

  if (
    browserLayoutShiftEntries.length > 0 &&
    !hasAnyDetector(result, source.expectedUiGlitchHunterDetectors)
  ) {
    defaultThresholdResult = summarizeResult(result);
    thresholdProfile = "proof/layout-shift-sensitive";
    navigationStatus = (await page.goto(source.exampleUrl))?.status();
    await installDocumentedLayoutShiftFixture(page);
    await installLayoutShiftObserver(page);
    result = await runLayoutShiftCapture(page, testInfo, "sensitive", {
      maxFrameDelta: 0.03,
      maxConsecutiveUnstableFrames: 2,
    });
    browserLayoutShiftEntries = await readLayoutShiftEntries(page);
  }

  const observedDetectors = result.events.map((event) => event.detector);
  const maxFrameDelta = Math.max(
    0,
    ...result.frames.map((frame) => frame.frameDelta ?? 0),
  );
  const outcomePassed =
    browserLayoutShiftEntries.length > 0 &&
    hasAnyDetector(result, source.expectedUiGlitchHunterDetectors);
  const outcomePath = await writeProofOutcome({
    proofId: "webdev-layout-shift-demo",
    sourceId: source.id,
    claim: layoutShiftClaim,
    status: outcomePassed ? "passed" : "failed",
    evidence: [
      source.id,
      `layout-shift-entries:${browserLayoutShiftEntries.length}`,
      `threshold-profile:${thresholdProfile}`,
      `max-frame-delta:${maxFrameDelta.toFixed(4)}`,
      ...observedDetectors.map((detector) => `detector:${detector}`),
    ],
    browser: testInfo.project.name,
    observedDetectors,
    oracle: {
      layoutShiftEntries: browserLayoutShiftEntries.length,
      hadRecentInputEntries: browserLayoutShiftEntries.filter(
        (entry) => entry.hadRecentInput,
      ).length,
      maxFrameDelta,
    },
    thresholdProfile,
    reportJsonPath: result.reportJsonPath,
    reportHtmlPath: result.reportHtmlPath,
  });
  await testInfo.attach("proof-outcome", {
    path: outcomePath,
    contentType: "application/json",
  });

  await attachProofArtifacts(testInfo, result, {
    source,
    browserLayoutShiftEntries,
    thresholdProfile,
    defaultThresholdResult,
    navigationStatus,
    finalUrl: page.url(),
    frameCount: result.frames.length,
    maxFrameDelta,
    observedDetectors,
    outcomePath,
  });

  expect(browserLayoutShiftEntries.length).toBeGreaterThan(0);
  expect(hasAnyDetector(result, source.expectedUiGlitchHunterDetectors)).toBe(true);
});

async function runLayoutShiftCapture(
  page: Page,
  testInfo: TestInfo,
  profileSuffix: string,
  thresholds?: Partial<ThresholdConfig>,
): Promise<CaptureTimelineResult> {
  return runVisualGlitchCheck(page, {
    name: proofName(testInfo, `webdev-layout-shift-demo-${profileSuffix}`),
    mode: "cdp",
    durationMs: 1500,
    fps: 20,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
    thresholds,
    action: async () => {
      await triggerDocumentedLayoutShift(page);
    },
  });
}

async function installDocumentedLayoutShiftFixture(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById("ui-gh-layout-proof-fixture")?.remove();

    const fixture = document.createElement("section");
    fixture.id = "ui-gh-layout-proof-fixture";
    fixture.setAttribute("aria-label", "UI Glitch Hunter layout shift proof fixture");
    fixture.style.cssText = [
      "box-sizing:border-box",
      "width:100%",
      "padding:16px",
      "border:2px solid #111",
      "background:#fff",
      "color:#111",
      "font:16px/1.4 Arial,sans-serif",
    ].join(";");
    fixture.innerHTML = `
      <div id="ui-gh-layout-proof-banner" style="height:48px;background:#cfe8ff;padding:12px;box-sizing:border-box;">
        Source-backed layout shift proof banner
      </div>
      <p id="ui-gh-layout-proof-target" style="margin:16px 0 0;">
        This paragraph shifts when the preceding element changes dimensions, matching the web.dev documented layout-shift cause.
      </p>
    `;
    document.body.prepend(fixture);
    window.scrollTo(0, 0);
  });
  await expect(page.locator("#ui-gh-layout-proof-target")).toBeVisible();
}

async function triggerDocumentedLayoutShift(page: Page): Promise<void> {
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const banner = document.getElementById("ui-gh-layout-proof-banner");
    if (!banner) {
      throw new Error("Layout proof fixture is missing.");
    }
    banner.style.height = "320px";
  });
  await page.waitForTimeout(250);
}

function summarizeResult(result: CaptureTimelineResult): {
  passed: boolean;
  detectors: string[];
  reportJsonPath?: string;
  reportHtmlPath?: string;
} {
  return {
    passed: result.passed,
    detectors: result.events.map((event) => event.detector),
    reportJsonPath: result.reportJsonPath,
    reportHtmlPath: result.reportHtmlPath,
  };
}

function proofName(testInfo: { title: string; project: { name: string } }, suffix: string): string {
  return `${testInfo.project.name}-${testInfo.title}-${suffix}`.replace(
    /[^a-z0-9_-]+/gi,
    "-",
  );
}
