import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ProofClaimStatus = "passed" | "failed" | "skipped" | "not-run";

export type ProofOutcome = {
  proofId?: string;
  sourceId: string;
  claim: string;
  status: ProofClaimStatus;
  evidence: string[];
  proofType?: string;
  browser?: string;
  observedDetectors?: string[];
  oracle?: Record<string, unknown>;
  thresholdProfile?: string;
  reportJsonPath?: string;
  reportHtmlPath?: string;
};

export type ProofSummary = {
  generatedAt: string;
  commit: string;
  dirty: boolean;
  environment: {
    browser: string;
    os: string;
    node: string;
    externalProofsEnabled: boolean;
  };
  claims: Array<{
    claim: string;
    evidence: string[];
    status: ProofClaimStatus;
    proofType?: string;
    sourceId?: string;
    label?: string;
    example?: string;
  }>;
  limitations: string[];
};

const claimDefinitions = [
  {
    sourceId: "webdev-layout-shift-demo",
    claim:
      "Detects layout-shift-like visual instability when the browser Layout Instability API reports movement.",
    label: "Layout-shift-like visual instability is detected",
    example: "web.dev layout shift demo",
    proofType: "hosted-page",
    proofIds: ["webdev-layout-shift-demo"],
  },
  {
    sourceId: "next-themes-no-flash",
    claim:
      "Does not report blank/dark flashes on a documented no-flash theme implementation.",
    label: "Documented no-flash theme page is not flagged for blank/dark flash",
    example: "next-themes live example",
    proofType: "hosted-page",
    proofIds: ["next-themes-no-flash-light", "next-themes-no-flash-dark"],
  },
] as const;

const limitations = [
  "External hosted pages may change.",
  "This suite does not prove complete UI glitch coverage.",
  "Layout-shift proof uses visual correlation, not CLS scoring.",
];
const offlineCorpusLimitation =
  "Offline corpus evidence depends on source provenance, licensing, and selected fixture scope.";

export async function writeProofSummary(options: {
  resultsDir?: string;
} = {}): Promise<ProofSummary> {
  const resultsDir = options.resultsDir ?? path.resolve("proof", "results");
  const outcomes = await readOutcomes(path.join(resultsDir, "outcomes"));
  const browser =
    outcomes.find((outcome) => outcome.browser)?.browser ?? "chromium";

  const summary: ProofSummary = {
    generatedAt: new Date().toISOString(),
    commit: gitOutput(["rev-parse", "--short", "HEAD"]) ?? "unknown",
    dirty: Boolean(gitOutput(["status", "--porcelain"])),
    environment: {
      browser,
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
      externalProofsEnabled: process.env.VISUAL_GLITCH_PROOF_EXTERNAL === "1",
    },
    claims: [
      ...claimDefinitions.map((definition) => summarizeClaim(definition, outcomes)),
      ...summarizeAdditionalOutcomes(outcomes),
    ],
    limitations: outcomes.some((outcome) => outcome.proofType === "offline-corpus")
      ? [...limitations, offlineCorpusLimitation]
      : limitations,
  };

  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(
    path.join(resultsDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(resultsDir, "summary.md"),
    renderMarkdown(summary),
    "utf8",
  );
  return summary;
}

async function readOutcomes(outcomesDir: string): Promise<ProofOutcome[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(outcomesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const outcomes: ProofOutcome[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    const filePath = path.join(outcomesDir, entry);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    outcomes.push(validateOutcome(parsed, filePath));
  }
  return outcomes;
}

function summarizeClaim(
  definition: (typeof claimDefinitions)[number],
  outcomes: ProofOutcome[],
): ProofSummary["claims"][number] {
  const outcomeByProofId = new Map(
    outcomes.map((outcome) => [outcome.proofId ?? outcome.sourceId, outcome]),
  );
  const expectedOutcomes = definition.proofIds.map((proofId) =>
    outcomeByProofId.get(proofId),
  );
  const foundOutcomes = expectedOutcomes.filter(
    (outcome): outcome is ProofOutcome => Boolean(outcome),
  );
  const evidence =
    foundOutcomes.length > 0
      ? [...new Set(foundOutcomes.flatMap((outcome) => outcome.evidence))]
      : [definition.sourceId];

  return {
    claim: definition.claim,
    evidence,
    status: aggregateStatus(expectedOutcomes),
    proofType: definition.proofType,
    sourceId: definition.sourceId,
    label: definition.label,
    example: definition.example,
  };
}

function summarizeAdditionalOutcomes(
  outcomes: ProofOutcome[],
): ProofSummary["claims"] {
  const knownProofIds = new Set<string>(
    claimDefinitions.flatMap((definition) => definition.proofIds),
  );
  return outcomes
    .filter((outcome) => !knownProofIds.has(outcome.proofId ?? outcome.sourceId))
    .map((outcome) => ({
      claim: outcome.claim,
      evidence: outcome.evidence,
      status: outcome.status,
      proofType: outcome.proofType ?? "custom",
      sourceId: outcome.sourceId,
      label: outcome.claim,
      example: outcome.sourceId,
    }));
}

function aggregateStatus(
  outcomes: Array<ProofOutcome | undefined>,
): ProofClaimStatus {
  if (outcomes.some((outcome) => outcome?.status === "failed")) {
    return "failed";
  }
  if (outcomes.every((outcome) => outcome?.status === "passed")) {
    return "passed";
  }
  if (outcomes.some((outcome) => outcome?.status === "skipped")) {
    return "skipped";
  }
  return "not-run";
}

function validateOutcome(parsed: unknown, filePath: string): ProofOutcome {
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Proof outcome ${filePath} must contain an object.`);
  }
  const candidate = parsed as Partial<ProofOutcome>;
  if (!candidate.sourceId || typeof candidate.sourceId !== "string") {
    throw new Error(`Proof outcome ${filePath} is missing sourceId.`);
  }
  if (!candidate.claim || typeof candidate.claim !== "string") {
    throw new Error(`Proof outcome ${filePath} is missing claim.`);
  }
  if (
    candidate.status !== "passed" &&
    candidate.status !== "failed" &&
    candidate.status !== "skipped" &&
    candidate.status !== "not-run"
  ) {
    throw new Error(`Proof outcome ${filePath} has invalid status.`);
  }
  if (!Array.isArray(candidate.evidence)) {
    throw new Error(`Proof outcome ${filePath} is missing evidence.`);
  }
  return candidate as ProofOutcome;
}

function renderMarkdown(summary: ProofSummary): string {
  const rows = summary.claims.map(
    (claim) =>
      `| ${claim.label ?? claim.claim} | ${claim.proofType ?? "unknown"} | ${claim.example ?? claim.sourceId ?? "unknown"} | ${formatStatus(claim.status)} |`,
  );

  return `# ui-glitch-hunter proof summary

Generated: ${summary.generatedAt}

Commit: ${summary.commit}${summary.dirty ? " (dirty)" : ""}

## Claims tested

| Claim | Proof type | Source-backed example | Result |
|---|---|---|---|
${rows.join("\n")}

## Limitations

${summary.limitations.map((limitation) => `- ${limitation}`).join("\n")}
`;
}

function formatStatus(status: ProofClaimStatus): string {
  switch (status) {
    case "passed":
      return "PASS";
    case "failed":
      return "FAIL";
    case "skipped":
      return "SKIPPED";
    case "not-run":
      return "NOT RUN";
  }
}

function gitOutput(args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

if (require.main === module) {
  writeProofSummary().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
