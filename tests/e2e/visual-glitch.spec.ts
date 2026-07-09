import fs from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import {
  installVisualGlitchMatcher,
  runVisualGlitchCheck,
} from "../../src";

installVisualGlitchMatcher();

test.describe.configure({ mode: "serial" });

test("stable page passes with screenshot capture", async ({ page }, testInfo) => {
  await setPatternPage(page);

  const result = await runVisualGlitchCheck(page, {
    name: uniqueName(testInfo, "stable"),
    mode: "screenshot",
    durationMs: 300,
    fps: 8,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
  });

  expect(result.passed).toBe(true);
  expect(result.events).toEqual([]);
});

test("white flash fails after content has appeared", async ({ page }, testInfo) => {
  await setPatternPage(page);

  const result = await runVisualGlitchCheck(page, {
    name: uniqueName(testInfo, "white-flash"),
    mode: "screenshot",
    durationMs: 850,
    fps: 20,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
    action: async () => {
      await page.evaluate(() => {
        setTimeout(() => {
          document.body.dataset.state = "white";
          setTimeout(() => {
            document.body.dataset.state = "normal";
          }, 260);
        }, 120);
      });
    },
  });

  expect(result.passed).toBe(false);
  expect(result.events.some((event) => event.detector === "blank-flash")).toBe(true);
  expect(result.reportHtmlPath).toBeTruthy();
});

test("black flash fails after content has appeared", async ({ page }, testInfo) => {
  await setPatternPage(page);

  const result = await runVisualGlitchCheck(page, {
    name: uniqueName(testInfo, "black-flash"),
    mode: "screenshot",
    durationMs: 850,
    fps: 20,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
    action: async () => {
      await page.evaluate(() => {
        setTimeout(() => {
          document.body.dataset.state = "black";
          setTimeout(() => {
            document.body.dataset.state = "normal";
          }, 260);
        }, 120);
      });
    },
  });

  expect(result.passed).toBe(false);
  expect(result.events.some((event) => event.detector === "dark-flash")).toBe(true);
});

test("repeated large visual jumps fail as instability", async ({ page }, testInfo) => {
  await page.setContent(`
    <style>
      body { margin: 0; min-height: 100vh; background: linear-gradient(90deg, #000 0 50%, #fff 50% 100%); }
      body.alt { background: linear-gradient(0deg, #fff 0 50%, #000 50% 100%); }
    </style>
    <script>
      window.startJumps = () => {
        let count = 0;
        const timer = setInterval(() => {
          document.body.classList.toggle("alt");
          count += 1;
          if (count > 10) clearInterval(timer);
        }, 55);
      };
    </script>
  `);

  const result = await runVisualGlitchCheck(page, {
    name: uniqueName(testInfo, "jumps"),
    mode: "screenshot",
    durationMs: 850,
    fps: 20,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
    thresholds: {
      maxConsecutiveUnstableFrames: 3,
    },
    action: async () => {
      await page.evaluate(() => (window as unknown as { startJumps: () => void }).startJumps());
    },
  });

  expect(result.passed).toBe(false);
  expect(
    result.events.some((event) =>
      ["large-delta", "consecutive-instability"].includes(event.detector),
    ),
  ).toBe(true);
});

test("small smooth animation does not fail", async ({ page }, testInfo) => {
  await page.setContent(`
    <style>
      body { margin: 0; min-height: 100vh; background: #fff; }
      .box {
        width: 36px;
        height: 36px;
        background: #1a73e8;
        transform: translate(20px, 220px);
        animation: slide 600ms linear infinite alternate;
      }
      @keyframes slide {
        from { transform: translate(20px, 220px); }
        to { transform: translate(120px, 220px); }
      }
    </style>
    <div class="box"></div>
  `);

  const result = await runVisualGlitchCheck(page, {
    name: uniqueName(testInfo, "smooth"),
    mode: "screenshot",
    durationMs: 650,
    fps: 15,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
  });

  expect(result.passed).toBe(true);
});

test("masked animated regions do not fail", async ({ page }, testInfo) => {
  await page.setContent(`
    <style>
      body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #17324d, #2f855a); color: white; }
      main { padding: 40px; font: 28px system-ui; }
      [data-visual-ignore] { position: fixed; inset: 120px 120px; background: #fff; }
      [data-visual-ignore].dark { background: #000; }
    </style>
    <main>Stable dashboard content</main>
    <div data-visual-ignore></div>
    <script>
      window.toggleMasked = () => {
        let count = 0;
        const el = document.querySelector("[data-visual-ignore]");
        const timer = setInterval(() => {
          el.classList.toggle("dark");
          count += 1;
          if (count > 8) clearInterval(timer);
        }, 60);
      };
    </script>
  `);

  const result = await runVisualGlitchCheck(page, {
    name: uniqueName(testInfo, "masked"),
    mode: "screenshot",
    durationMs: 700,
    fps: 20,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
    action: async () => {
      await page.evaluate(() =>
        (window as unknown as { toggleMasked: () => void }).toggleMasked(),
      );
    },
  });

  expect(result.passed).toBe(true);
});

test("baseline update writes manifest and frames", async ({ page }, testInfo) => {
  await setPatternPage(page);
  const baselineDir = testInfo.outputPath("baselines");
  const name = uniqueName(testInfo, "baseline-update");
  process.env.VISUAL_GLITCH_UPDATE = "1";
  try {
    const result = await runVisualGlitchCheck(page, {
      name,
      mode: "screenshot",
      durationMs: 250,
      fps: 8,
      viewport: { width: 800, height: 600 },
      outputDir: testInfo.outputPath("glitches"),
      baselineDir,
    });
    expect(result.passed).toBe(true);
  } finally {
    delete process.env.VISUAL_GLITCH_UPDATE;
  }

  await expect(
    fs.stat(path.join(baselineDir, name, "manifest.json")),
  ).resolves.toBeTruthy();
  await expect(
    fs.stat(path.join(baselineDir, name, "frames", "000001.jpg")),
  ).resolves.toBeTruthy();
});

test("baseline mismatch fails with report path", async ({ page }, testInfo) => {
  const baselineDir = testInfo.outputPath("baselines");
  const outputDir = testInfo.outputPath("glitches");
  const name = uniqueName(testInfo, "baseline-mismatch");

  await page.setContent(`<body style="margin:0;min-height:100vh;background:#000"></body>`);
  process.env.VISUAL_GLITCH_UPDATE = "1";
  try {
    await runVisualGlitchCheck(page, {
      name,
      mode: "screenshot",
      durationMs: 200,
      fps: 5,
      viewport: { width: 800, height: 600 },
      outputDir,
      baselineDir,
    });
  } finally {
    delete process.env.VISUAL_GLITCH_UPDATE;
  }

  await page.setContent(`<body style="margin:0;min-height:100vh;background:#fff"></body>`);
  const result = await runVisualGlitchCheck(page, {
    name,
    mode: "screenshot",
    durationMs: 200,
    fps: 5,
    viewport: { width: 800, height: 600 },
    outputDir,
    baselineDir,
  });

  expect(result.passed).toBe(false);
  expect(result.events.some((event) => event.detector === "baseline-distance")).toBe(true);
  expect(result.reportHtmlPath).toContain("report.html");
});

test("matcher failure message includes detector and report", async ({ page }, testInfo) => {
  await setPatternPage(page);

  let message = "";
  try {
    await expect(page).toHaveNoVisualGlitches({
      name: uniqueName(testInfo, "matcher"),
      mode: "screenshot",
      durationMs: 850,
      fps: 20,
      viewport: { width: 800, height: 600 },
      outputDir: testInfo.outputPath("glitches"),
      baselineDir: testInfo.outputPath("baselines"),
      action: async () => {
        await page.evaluate(() => {
          setTimeout(() => {
            document.body.dataset.state = "white";
          }, 120);
        });
      },
    });
  } catch (error) {
    message = (error as Error).message;
  }

  expect(message).toContain("Visual glitch detected:");
  expect(message).toContain("Detector: blank-flash");
  expect(message).toContain("Report:");
});

test("CDP capture smoke test passes on a stable page", async ({ page }, testInfo) => {
  await setPatternPage(page);

  const result = await runVisualGlitchCheck(page, {
    name: uniqueName(testInfo, "cdp-stable"),
    mode: "cdp",
    durationMs: 300,
    fps: 8,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
  });

  expect(result.passed).toBe(true);
  expect(result.frames.length).toBeGreaterThan(0);
});

test("CDP capture detects a one-frame flash even when fps is low", async ({ page }, testInfo) => {
  await setPatternPage(page);

  const result = await runVisualGlitchCheck(page, {
    name: uniqueName(testInfo, "cdp-one-frame-white-flash"),
    mode: "cdp",
    durationMs: 700,
    fps: 1,
    viewport: { width: 800, height: 600 },
    outputDir: testInfo.outputPath("glitches"),
    baselineDir: testInfo.outputPath("baselines"),
    action: async () => {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              document.body.dataset.state = "white";
              requestAnimationFrame(() => {
                document.body.dataset.state = "normal";
                resolve();
              });
            });
          }),
      );
    },
  });

  expect(result.frames.length).toBeGreaterThan(1);
  expect(result.passed).toBe(false);
  expect(result.events.some((event) => event.detector === "blank-flash")).toBe(true);
});

async function setPatternPage(page: Page): Promise<void> {
  await page.setContent(`
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(135deg, #143d59 0%, #1f7a5a 45%, #f4b942 100%);
        color: #fff;
        font: 32px system-ui, sans-serif;
      }
      body[data-state="white"] { background: #fff; color: #fff; }
      body[data-state="black"] { background: #000; color: #000; }
      main { padding: 56px; }
    </style>
    <main>Dashboard content loaded</main>
  `);
}

function uniqueName(testInfo: TestInfo, base: string): string {
  return `${base}-${testInfo.workerIndex}-${testInfo.retry}`.replace(/\W+/g, "-");
}
