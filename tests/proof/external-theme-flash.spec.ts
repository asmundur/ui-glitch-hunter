import { test, expect } from "@playwright/test";
import type { Browser, TestInfo } from "@playwright/test";
import { runVisualGlitchCheck } from "../../src";
import {
  attachProofArtifacts,
  externalProofEnabled,
  getProofSource,
  hasNoDetector,
  writeProofOutcome,
} from "./helpers";

const noFlashClaim =
  "Does not report blank/dark flashes on a documented no-flash theme implementation.";

test("external-theme-flash: next-themes live example has no blank/dark flash during load", async ({
  browser,
}, testInfo) => {
  test.setTimeout(45_000);
  test.skip(
    !externalProofEnabled(),
    "Set VISUAL_GLITCH_PROOF_EXTERNAL=1 to run hosted proof tests.",
  );

  const source = await getProofSource("next-themes-no-flash");
  const forbiddenDetectors = source.forbiddenUiGlitchHunterDetectors ?? [];

  for (const colorScheme of ["light", "dark"] as const) {
    const { result, navigationStatus, finalUrl } = await runThemeLoadProof(
      browser,
      testInfo,
      source.exampleUrl,
      colorScheme,
    );
    const observedDetectors = result.events.map((event) => event.detector);
    const outcomePassed = hasNoDetector(result, forbiddenDetectors);
    const outcomePath = await writeProofOutcome({
      proofId: `next-themes-no-flash-${colorScheme}`,
      sourceId: source.id,
      claim: noFlashClaim,
      status: outcomePassed ? "passed" : "failed",
      evidence: [
        source.id,
        `color-scheme:${colorScheme}`,
        ...observedDetectors.map((detector) => `detector:${detector}`),
      ],
      browser: testInfo.project.name,
      observedDetectors,
      oracle: {
        forbiddenDetectors,
        colorScheme,
      },
      reportJsonPath: result.reportJsonPath,
      reportHtmlPath: result.reportHtmlPath,
    });
    await testInfo.attach("proof-outcome", {
      path: outcomePath,
      contentType: "application/json",
    });

    await attachProofArtifacts(testInfo, result, {
      source,
      colorScheme,
      navigationStatus,
      finalUrl,
      forbiddenDetectors,
      observedDetectors,
      frameCount: result.frames.length,
      outcomePath,
    });

    expect(hasNoDetector(result, forbiddenDetectors)).toBe(true);
  }
});

async function runThemeLoadProof(
  browser: Browser,
  testInfo: TestInfo,
  exampleUrl: string,
  colorScheme: "light" | "dark",
): Promise<{
  result: Awaited<ReturnType<typeof runVisualGlitchCheck>>;
  navigationStatus?: number;
  finalUrl: string;
}> {
  const context = await browser.newContext({
    colorScheme,
    viewport: { width: 800, height: 600 },
  });
  const page = await context.newPage();
  let navigationStatus: number | undefined;
  try {
    const result = await runVisualGlitchCheck(page, {
      name: proofName(testInfo, `next-themes-load-${colorScheme}`),
      mode: "cdp",
      durationMs: 5000,
      fps: 20,
      viewport: { width: 800, height: 600 },
      outputDir: testInfo.outputPath(`glitches-${colorScheme}`),
      baselineDir: testInfo.outputPath(`baselines-${colorScheme}`),
      action: async () => {
        navigationStatus = (await page.goto(exampleUrl))?.status();
      },
    });
    return {
      result,
      navigationStatus,
      finalUrl: page.url(),
    };
  } finally {
    await context.close();
  }
}

function proofName(testInfo: { title: string; project: { name: string } }, suffix: string): string {
  return `${testInfo.project.name}-${testInfo.title}-${suffix}`.replace(
    /[^a-z0-9_-]+/gi,
    "-",
  );
}
