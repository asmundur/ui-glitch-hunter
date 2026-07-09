import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { writeProofSummary } from "../../scripts/write-proof-summary";

test("writeProofSummary writes JSON and Markdown for passed proof outcomes", async () => {
  const resultsDir = await fs.mkdtemp(path.join(os.tmpdir(), "proof-summary-"));
  await fs.mkdir(path.join(resultsDir, "outcomes"));
  await fs.writeFile(
    path.join(resultsDir, "outcomes", "layout.json"),
    `${JSON.stringify({
      proofId: "webdev-layout-shift-demo",
      sourceId: "webdev-layout-shift-demo",
      claim: "Detects layout-shift-like visual instability when the browser Layout Instability API reports movement.",
      status: "passed",
      evidence: ["webdev-layout-shift-demo"],
      browser: "chromium",
    })}\n`,
  );
  await fs.writeFile(
    path.join(resultsDir, "outcomes", "theme-light.json"),
    `${JSON.stringify({
      proofId: "next-themes-no-flash-light",
      sourceId: "next-themes-no-flash",
      claim: "Does not report blank/dark flashes on a documented no-flash theme implementation.",
      status: "passed",
      evidence: ["next-themes-no-flash", "color-scheme:light"],
      browser: "chromium",
    })}\n`,
  );
  await fs.writeFile(
    path.join(resultsDir, "outcomes", "theme-dark.json"),
    `${JSON.stringify({
      proofId: "next-themes-no-flash-dark",
      sourceId: "next-themes-no-flash",
      claim: "Does not report blank/dark flashes on a documented no-flash theme implementation.",
      status: "passed",
      evidence: ["next-themes-no-flash", "color-scheme:dark"],
      browser: "chromium",
    })}\n`,
  );

  const summary = await writeProofSummary({ resultsDir });
  const json = JSON.parse(await fs.readFile(path.join(resultsDir, "summary.json"), "utf8"));
  const markdown = await fs.readFile(path.join(resultsDir, "summary.md"), "utf8");

  expect(summary.claims.map((claim) => claim.status)).toEqual(["passed", "passed"]);
  expect(json.environment.browser).toBe("chromium");
  expect(markdown).toContain("# ui-glitch-hunter proof summary");
  expect(markdown).toContain("Layout-shift-like visual instability is detected");
  expect(markdown).toContain("PASS");
  await fs.rm(resultsDir, { recursive: true, force: true });
});

test("writeProofSummary reports not-run claims when no proof outcomes exist", async () => {
  const resultsDir = await fs.mkdtemp(path.join(os.tmpdir(), "proof-summary-empty-"));

  const summary = await writeProofSummary({ resultsDir });

  expect(summary.claims.map((claim) => claim.status)).toEqual(["not-run", "not-run"]);
  await expect(fs.stat(path.join(resultsDir, "summary.json"))).resolves.toBeTruthy();
  await expect(fs.stat(path.join(resultsDir, "summary.md"))).resolves.toBeTruthy();
  await fs.rm(resultsDir, { recursive: true, force: true });
});

test("writeProofSummary does not pass a multi-variant claim with missing outcomes", async () => {
  const resultsDir = await fs.mkdtemp(path.join(os.tmpdir(), "proof-summary-partial-"));
  await fs.mkdir(path.join(resultsDir, "outcomes"));
  await fs.writeFile(
    path.join(resultsDir, "outcomes", "layout.json"),
    `${JSON.stringify({
      proofId: "webdev-layout-shift-demo",
      sourceId: "webdev-layout-shift-demo",
      claim: "Detects layout-shift-like visual instability when the browser Layout Instability API reports movement.",
      status: "passed",
      evidence: ["webdev-layout-shift-demo"],
      browser: "chromium",
    })}\n`,
  );
  await fs.writeFile(
    path.join(resultsDir, "outcomes", "theme-light.json"),
    `${JSON.stringify({
      proofId: "next-themes-no-flash-light",
      sourceId: "next-themes-no-flash",
      claim: "Does not report blank/dark flashes on a documented no-flash theme implementation.",
      status: "passed",
      evidence: ["next-themes-no-flash", "color-scheme:light"],
      browser: "chromium",
    })}\n`,
  );

  const summary = await writeProofSummary({ resultsDir });
  const themeClaim = summary.claims.find((claim) =>
    claim.claim.includes("blank/dark flashes"),
  );

  expect(themeClaim?.status).toBe("not-run");
  await fs.rm(resultsDir, { recursive: true, force: true });
});

test("writeProofSummary rejects malformed proof outcome input", async () => {
  const resultsDir = await fs.mkdtemp(path.join(os.tmpdir(), "proof-summary-bad-"));
  await fs.mkdir(path.join(resultsDir, "outcomes"));
  await fs.writeFile(
    path.join(resultsDir, "outcomes", "bad.json"),
    `${JSON.stringify({
      sourceId: "webdev-layout-shift-demo",
      claim: "Malformed fixture",
      status: "unknown",
      evidence: ["webdev-layout-shift-demo"],
    })}\n`,
  );

  await expect(writeProofSummary({ resultsDir })).rejects.toThrow(
    "has invalid status",
  );
  await fs.rm(resultsDir, { recursive: true, force: true });
});

test("writeProofSummary includes offline corpus outcomes as distinct evidence", async () => {
  const resultsDir = await fs.mkdtemp(path.join(os.tmpdir(), "proof-summary-offline-"));
  await fs.mkdir(path.join(resultsDir, "outcomes"));
  await fs.writeFile(
    path.join(resultsDir, "outcomes", "offline.json"),
    `${JSON.stringify({
      proofId: "offline-generated-layout-shift",
      sourceId: "offline-generated-layout-shift",
      proofType: "offline-corpus",
      claim:
        "Detects source-backed offline frame-sequence visual instability without live hosted pages.",
      status: "passed",
      evidence: [
        "offline-generated-layout-shift",
        "source:https://web.dev/articles/debug-layout-shifts",
        "detector:large-delta",
      ],
      browser: "offline-frame-files",
    })}\n`,
  );

  const summary = await writeProofSummary({ resultsDir });
  const markdown = await fs.readFile(path.join(resultsDir, "summary.md"), "utf8");
  const offlineClaim = summary.claims.find((claim) =>
    claim.claim.includes("offline frame-sequence"),
  );

  expect(offlineClaim?.status).toBe("passed");
  expect(offlineClaim?.proofType).toBe("offline-corpus");
  expect(summary.limitations).toContain(
    "Offline corpus evidence depends on source provenance, licensing, and selected fixture scope.",
  );
  expect(markdown).toContain("offline-corpus");
  await fs.rm(resultsDir, { recursive: true, force: true });
});
