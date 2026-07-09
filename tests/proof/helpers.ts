import fs from "node:fs/promises";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import type { CaptureTimelineResult } from "../../src";

const layoutShiftStateKey = "__uiGlitchHunterLayoutShiftProof";

export type ProofSource = {
  id: string;
  kind: string;
  documentedCategory: string;
  sourceUrl: string;
  exampleUrl: string;
  externalOracle: string;
  expectedUiGlitchHunterDetectors: string[];
  forbiddenUiGlitchHunterDetectors?: string[];
  requiredForDefaultCi: boolean;
  notes: string[];
};

export type DOMRectJSON = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type LayoutShiftProofEntry = {
  value: number;
  hadRecentInput: boolean;
  startTime: number;
  sources: Array<{
    node?: string;
    previousRect?: DOMRectJSON;
    currentRect?: DOMRectJSON;
  }>;
};

export type ProofOutcomeStatus = "passed" | "failed" | "skipped" | "not-run";

export type ProofOutcome = {
  proofId: string;
  sourceId: string;
  claim: string;
  status: ProofOutcomeStatus;
  evidence: string[];
  proofType?: string;
  browser?: string;
  observedDetectors?: string[];
  oracle?: Record<string, unknown>;
  thresholdProfile?: string;
  reportJsonPath?: string;
  reportHtmlPath?: string;
};

export function externalProofEnabled(): boolean {
  return process.env.VISUAL_GLITCH_PROOF_EXTERNAL === "1";
}

export async function installLayoutShiftObserver(page: Page): Promise<void> {
  await page.evaluate((stateKey) => {
    const supportedTypes =
      "PerformanceObserver" in window
        ? PerformanceObserver.supportedEntryTypes ?? []
        : [];
    if (!supportedTypes.includes("layout-shift")) {
      throw new Error("Layout Instability API is not available in this browser.");
    }

    const target = window as typeof window & {
      [key: string]: {
        installed: boolean;
        entries: LayoutShiftProofEntry[];
        observer?: PerformanceObserver;
      };
    };

    target[stateKey]?.observer?.disconnect();
    target[stateKey] = {
      installed: true,
      entries: [],
    };

    const observer = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const layoutShift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: Array<{
            node?: Element;
            previousRect?: DOMRectReadOnly;
            currentRect?: DOMRectReadOnly;
          }>;
        };
        target[stateKey].entries.push({
          value: layoutShift.value,
          hadRecentInput: layoutShift.hadRecentInput,
          startTime: layoutShift.startTime,
          sources: (layoutShift.sources ?? []).map((source) => ({
            node: source.node ? describeNode(source.node) : undefined,
            previousRect: source.previousRect
              ? serializeRect(source.previousRect)
              : undefined,
            currentRect: source.currentRect
              ? serializeRect(source.currentRect)
              : undefined,
          })),
        });
      }
    });

    observer.observe({ type: "layout-shift", buffered: true });
    target[stateKey].observer = observer;

    function describeNode(node: Element): string {
      const id = node.id ? `#${node.id}` : "";
      const classes = Array.from(node.classList)
        .map((className) => `.${className}`)
        .join("");
      return `${node.tagName.toLowerCase()}${id}${classes}`;
    }

    function serializeRect(rect: DOMRectReadOnly): DOMRectJSON {
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      };
    }
  }, layoutShiftStateKey);
}

export async function readLayoutShiftEntries(
  page: Page,
): Promise<LayoutShiftProofEntry[]> {
  return page.evaluate((stateKey) => {
    const target = window as typeof window & {
      [key: string]:
        | {
            installed: boolean;
            entries: LayoutShiftProofEntry[];
          }
        | undefined;
    };
    const state = target[stateKey];
    if (!state?.installed) {
      throw new Error("Layout shift observer has not been installed.");
    }
    return state.entries;
  }, layoutShiftStateKey);
}

export function hasAnyDetector(
  result: Pick<CaptureTimelineResult, "events">,
  detectors: string[],
): boolean {
  const wanted = new Set(detectors);
  return result.events.some((event) => wanted.has(event.detector));
}

export function hasNoDetector(
  result: Pick<CaptureTimelineResult, "events">,
  detectors: string[],
): boolean {
  return !hasAnyDetector(result, detectors);
}

export async function readProofSources(
  sourcesPath = path.resolve(process.cwd(), "proof", "sources.json"),
): Promise<ProofSource[]> {
  const content = await fs.readFile(sourcesPath, "utf8");
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("proof/sources.json must contain an array.");
  }
  return parsed.map(validateProofSource);
}

export async function getProofSource(id: string): Promise<ProofSource> {
  const sources = await readProofSources();
  const source = sources.find((entry) => entry.id === id);
  if (!source) {
    throw new Error(`Unknown proof source id: ${id}`);
  }
  return source;
}

export async function attachProofArtifacts(
  testInfo: Pick<TestInfo, "attach">,
  result: Pick<
    CaptureTimelineResult,
    "name" | "passed" | "events" | "reportJsonPath" | "reportHtmlPath"
  >,
  extra: Record<string, unknown>,
): Promise<void> {
  const diagnostics: string[] = [];
  if (result.reportJsonPath && (await fileExists(result.reportJsonPath))) {
    await testInfo.attach("proof-report-json", {
      path: result.reportJsonPath,
      contentType: "application/json",
    });
  } else if (result.reportJsonPath) {
    diagnostics.push(`Missing report JSON: ${result.reportJsonPath}`);
  }

  if (result.reportHtmlPath && (await fileExists(result.reportHtmlPath))) {
    await testInfo.attach("proof-report-html", {
      path: result.reportHtmlPath,
      contentType: "text/html",
    });
  } else if (result.reportHtmlPath) {
    diagnostics.push(`Missing report HTML: ${result.reportHtmlPath}`);
  }

  await testInfo.attach("proof-metadata", {
    body: JSON.stringify(
      {
        result: {
          name: result.name,
          passed: result.passed,
          detectors: result.events.map((event) => event.detector),
          reportJsonPath: result.reportJsonPath,
          reportHtmlPath: result.reportHtmlPath,
        },
        ...extra,
        diagnostics,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
}

export async function writeProofOutcome(
  outcome: ProofOutcome,
  options: { resultsDir?: string; fileName?: string } = {},
): Promise<string> {
  validateProofOutcome(outcome);
  const resultsDir = options.resultsDir ?? path.resolve(process.cwd(), "proof", "results");
  const outcomesDir = path.join(resultsDir, "outcomes");
  await fs.mkdir(outcomesDir, { recursive: true });
  const fileName = options.fileName ?? `${safeFileName(outcome.proofId)}.json`;
  const outcomePath = path.join(outcomesDir, fileName);
  await fs.writeFile(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
  return outcomePath;
}

function validateProofSource(source: unknown): ProofSource {
  if (!source || typeof source !== "object") {
    throw new Error("Proof source entries must be objects.");
  }
  const candidate = source as Partial<ProofSource>;
  const requiredStrings: Array<keyof ProofSource> = [
    "id",
    "kind",
    "documentedCategory",
    "sourceUrl",
    "exampleUrl",
    "externalOracle",
  ];
  for (const key of requiredStrings) {
    if (typeof candidate[key] !== "string" || !candidate[key]) {
      throw new Error(`Proof source is missing string field: ${key}`);
    }
  }
  if (!Array.isArray(candidate.expectedUiGlitchHunterDetectors)) {
    throw new Error(
      `Proof source ${candidate.id ?? "<unknown>"} must define expectedUiGlitchHunterDetectors.`,
    );
  }
  if (
    candidate.forbiddenUiGlitchHunterDetectors !== undefined &&
    !Array.isArray(candidate.forbiddenUiGlitchHunterDetectors)
  ) {
    throw new Error(
      `Proof source ${candidate.id ?? "<unknown>"} has invalid forbiddenUiGlitchHunterDetectors.`,
    );
  }
  if (typeof candidate.requiredForDefaultCi !== "boolean") {
    throw new Error(
      `Proof source ${candidate.id ?? "<unknown>"} must define requiredForDefaultCi.`,
    );
  }
  if (!Array.isArray(candidate.notes)) {
    throw new Error(`Proof source ${candidate.id ?? "<unknown>"} must define notes.`);
  }
  return candidate as ProofSource;
}

function validateProofOutcome(outcome: ProofOutcome): void {
  const requiredStrings: Array<keyof ProofOutcome> = ["proofId", "sourceId", "claim"];
  for (const key of requiredStrings) {
    if (typeof outcome[key] !== "string" || !outcome[key]) {
      throw new Error(`Proof outcome is missing string field: ${key}`);
    }
  }
  if (
    outcome.status !== "passed" &&
    outcome.status !== "failed" &&
    outcome.status !== "skipped" &&
    outcome.status !== "not-run"
  ) {
    throw new Error(`Proof outcome ${outcome.proofId} has invalid status.`);
  }
  if (!Array.isArray(outcome.evidence) || outcome.evidence.length === 0) {
    throw new Error(`Proof outcome ${outcome.proofId} must include evidence.`);
  }
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9_.-]+/gi, "-");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
