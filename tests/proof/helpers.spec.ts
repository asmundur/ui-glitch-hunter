import { test, expect } from "@playwright/test";
import {
  installLayoutShiftObserver,
  readLayoutShiftEntries,
} from "./helpers";

test("layout shift observer records serialized browser entries", async ({ page }) => {
  await page.setContent(`
    <style>
      body { margin: 0; font: 16px system-ui; }
      #root { min-height: 100vh; }
      #spacer { width: 100%; height: 20px; background: #ddd; }
      #target { width: 120px; height: 40px; background: #1a73e8; color: white; }
    </style>
    <main id="root">
      <div id="spacer"></div>
      <div id="target">Target</div>
    </main>
  `);

  await page.waitForTimeout(100);
  await installLayoutShiftObserver(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const banner = document.createElement("div");
          banner.textContent = "Inserted banner";
          banner.style.cssText = "height: 180px; background: #f4b942";
          document.querySelector("#root")?.prepend(banner);
          requestAnimationFrame(() => resolve());
        });
      }),
  );
  await page.waitForTimeout(500);

  const entries = await readLayoutShiftEntries(page);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries[0]).toEqual(
    expect.objectContaining({
      value: expect.any(Number),
      hadRecentInput: expect.any(Boolean),
      startTime: expect.any(Number),
      sources: expect.any(Array),
    }),
  );
});
