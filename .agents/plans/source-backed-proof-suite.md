# Source-Backed Proof Suite

## Goal

Create a proof suite that demonstrates UI Glitch Hunter against documented,
third-party UI visual failure classes instead of only self-authored synthetic
glitches.

The suite supports this scoped claim:

> UI Glitch Hunter detects a source-backed subset of documented visual failures:
> layout-shift-like visual jumps, transient blank/dark flashes, runtime error
> text, and baseline drift.

The claim remains aligned with the current project vocabulary: blank flash, dark
flash, large delta, consecutive instability, bad text, and baseline distance.

## Non-goals

- Do not claim complete UI glitch coverage.
- Do not claim complete visual bug taxonomy coverage.
- Do not claim proof against every visual bug type.
- Do not require third-party hosted pages in default PR CI.
- Do not vendor large or license-unclear offline corpus assets.

## Phase 1

Add the external proof suite structure:

```text
proof/
  sources.json
  README.md

tests/proof/
  external-layout-shift.spec.ts
  external-theme-flash.spec.ts
  helpers.ts

scripts/
  write-proof-summary.ts
```

External proof tests run only when `VISUAL_GLITCH_PROOF_EXTERNAL=1`.
Default proof runs must skip hosted-page tests before navigation.

## Source verification

Checked on 2026-07-09:

- `https://web.dev/articles/debug-layout-shifts` is available and documents the
  Layout Instability API as the browser mechanism for measuring and reporting
  layout shifts. It states the API reports `layout-shift` entries with
  `value`, `hadRecentInput`, `startTime`, and `sources`, and it links the
  Glitch demo.
- `https://desert-righteous-router.glitch.me/` is still linked from the
  article, but as of 2026-07-09 it returns a Glitch hosting tombstone. The
  layout proof therefore navigates to the external web.dev article and injects
  the documented DOM movement as a controlled stimulus.
- `https://github.com/pacocoursey/next-themes` is available and documents
  no-flash theme loading behavior.
- `https://next-themes-example.vercel.app/` is the linked live next-themes
  example. Treat it as externally hosted and volatile.
- `https://glitchbench.github.io/` is available as Phase 2 research input for
  offline corpus evidence. Asset licensing, size, and access path must be
  verified before ingestion.

## Detector mapping

| Source-backed category | Source entry | UI Glitch Hunter detector contract |
|---|---|---|
| Layout shift / visual jump | `webdev-layout-shift-demo` | Expect `large-delta` or `consecutive-instability` when browser `layout-shift` entries are recorded. |
| Theme flash negative control | `next-themes-no-flash` | Forbid `blank-flash` and `dark-flash`; other detector events are reported separately. |
| Runtime error text | Existing internal tests until source-backed evidence is added | `bad-text`; no external proof in Phase 1. |
| Baseline drift | Phase 2 offline corpus/API | `baseline-distance`; no external hosted proof in Phase 1. |

This mapping is intentionally partial. It does not claim complete detector or
taxonomy coverage.

### Source catalog

`proof/sources.json` is plain JSON. It contains one positive proof source and
one negative control:

- `webdev-layout-shift-demo`: web.dev layout-shift article plus injected
  documented DOM movement, using browser `layout-shift` entries as the
  independent oracle. The formerly linked Glitch demo is not used because it no
  longer serves the original page.
- `next-themes-no-flash`: next-themes docs plus the linked live example, using
  the documented no-flash behavior as a negative control for blank/dark flash
  sensitivity.

Every source entry records `id`, `kind`, `documentedCategory`, `sourceUrl`,
`exampleUrl`, `externalOracle`, `expectedUiGlitchHunterDetectors`,
`requiredForDefaultCi`, and `notes`. Negative controls may also record
`forbiddenUiGlitchHunterDetectors`.

### Layout-shift correlation proof

Test name:

```text
external-layout-shift: browser Layout Instability API correlates with visual instability detection
```

Flow:

1. Navigate to the web.dev article.
2. Insert a small proof fixture whose preceding element changes dimensions,
   matching the documented layout-shift cause.
3. Install a `PerformanceObserver` for `layout-shift`.
4. Run `runVisualGlitchCheck`.
5. Trigger the documented DOM movement during capture.
6. Assert the browser recorded at least one layout-shift entry.
7. Assert UI Glitch Hunter emitted `large-delta` or
   `consecutive-instability`.
8. Attach the failure report, browser oracle entries, and source entry.

Do not filter `hadRecentInput`; this is visual correlation, not CLS scoring.

If default thresholds do not detect the external demo, the test may use
`proof/layout-shift-sensitive` with:

```ts
thresholds: {
  maxFrameDelta: 0.03,
  maxConsecutiveUnstableFrames: 2,
}
```

When that profile is used, record the default-threshold result separately.

### Theme no-flash negative control

Test name:

```text
external-theme-flash: next-themes live example has no blank/dark flash during load
```

Run light and dark `colorScheme` variants in fresh browser contexts. Start
capture before navigation by calling `page.goto(...)` inside the
`runVisualGlitchCheck` action. Assert only that `blank-flash` and `dark-flash`
are absent; do not require `result.passed === true`.

## Helper API

`tests/proof/helpers.ts` exports:

```ts
export function externalProofEnabled(): boolean;
export async function installLayoutShiftObserver(page: Page): Promise<void>;
export async function readLayoutShiftEntries(page: Page): Promise<LayoutShiftProofEntry[]>;
export function hasAnyDetector(result: CaptureTimelineResult, detectors: string[]): boolean;
export function hasNoDetector(result: CaptureTimelineResult, detectors: string[]): boolean;
export async function attachProofArtifacts(
  testInfo: TestInfo,
  result: CaptureTimelineResult,
  extra: Record<string, unknown>,
): Promise<void>;
```

The helper layer also validates source catalog entries, looks up sources by id,
and writes per-proof outcome files under `proof/results/outcomes/*.json` for
summary generation.

`LayoutShiftProofEntry` is JSON-serializable and includes `value`,
`hadRecentInput`, `startTime`, and serialized `sources` with optional node,
previous rect, and current rect data.

## Reporting

Add `scripts/write-proof-summary.ts`. It reads proof outcome files and writes:

```text
proof/results/summary.json
proof/results/summary.md
```

`summary.json` includes `generatedAt`, `commit`, `environment`, `claims`, and
`limitations`. `summary.md` includes a claims table and limitations section.

Required limitations:

- External hosted pages may change.
- This suite does not prove complete UI glitch coverage.
- Layout-shift proof uses visual correlation, not CLS scoring.

Generated `proof/results/**` files are local/CI artifacts and are ignored by git.
Source catalog and docs remain tracked.

## Package scripts

Add:

```json
{
  "proof": "jiti scripts/run-proof.ts",
  "proof:external": "jiti scripts/run-proof.ts --external"
}
```

Use the existing `jiti` dependency for the TypeScript script. Do not add `tsx`
or `ts-node`. The runner avoids shell-specific inline environment syntax and
writes summaries even when a proof test fails.

## CI behavior

Default PR CI remains local and deterministic:

```text
npm run build
npm run typecheck
npm test
```

Manual or nightly CI may run:

```text
npm run proof:external
```

and upload `proof/results` plus `test-results/visual-glitches`.

This repository currently has no `.github` workflow, so this work documents the
CI split but does not add a first workflow.

## Phase 2: offline frame-file API

Expose a public API for source-backed frame sequences that do not require a live
website:

```ts
export async function analyzeVisualFrameFiles(
  options: AnalyzeVisualFrameFilesOptions,
): Promise<CaptureTimelineResult>;
```

Input type:

```ts
export type AnalyzeVisualFrameFilesOptions = {
  name: string;
  frames: string[];
  baselineFrames?: string[];
  thresholds?: Partial<ThresholdConfig>;
  outputDir?: string;
  baselineDir?: string;
  viewport?: ViewportSize;
  fps?: number;
  durationMs?: number;
  imageFormat?: ImageFormat;
};
```

Contract:

- `name` must be non-empty and follows the same report/baseline sanitization as
  Playwright captures.
- `frames` must contain at least one readable image file. Missing or unreadable
  files reject with the offending path in the error message.
- Frame files become `RawFrame` values with deterministic index-based
  timestamps using `fps`; the same `analyzeRawFrames`, detector thresholds,
  baseline-distance detector, and report writer are reused.
- `viewport` defaults to the resolved capture viewport. When omitted, decoded
  image dimensions still drive frame metrics.
- `baselineFrames` is optional. When present, the files are analyzed into an
  in-memory `TimelineManifest` with `imagePath` references to the supplied
  baseline files so `baseline-distance` and report diff generation work.
  Baseline frame dimensions may differ from current frame dimensions; metrics,
  perceptual hashes, and report diffs are normalized through the existing Sharp
  analysis and resizing path rather than rejected.
- `thresholds`, `outputDir`, `baselineDir`, `fps`, `durationMs`, and
  `imageFormat` resolve through the existing config system where possible.
- Return type is `CaptureTimelineResult`; `browserName` is
  `offline-frame-files`, `mode` is `frame-files`, and `badTextEvents` is empty.
- Failure reports are written only when detector events exist, matching
  `runVisualGlitchCheck` behavior.

Non-goals:

- No video decoding in this pass.
- No large or license-unclear corpus assets are vendored.
- No baseline update mode for offline inputs until a concrete corpus workflow
  needs it.

## Phase 2

Add an offline frame-file analysis API:

```ts
analyzeVisualFrameFiles({
  name: string;
  frames: string[];
  baselineFrames?: string[];
  thresholds?: Partial<ThresholdConfig>;
  outputDir?: string;
  baselineDir?: string;
  viewport?: ViewportSize;
  fps?: number;
  durationMs?: number;
  imageFormat?: ImageFormat;
}): Promise<CaptureTimelineResult>;
```

The API reuses the same image metrics, detector, baseline-distance, and report
generation path as Playwright capture. It validates missing or unreadable frame
files loudly. `baselineFrames` are optional and enable baseline-distance proof
without requiring a live page.

Research GlitchBench as source-backed offline evidence, but record access,
licensing, size, and detector fit before any asset ingestion. Do not vendor
large or license-unclear assets.

## Acceptance

- `proof/sources.json`, `proof/README.md`, `tests/proof/helpers.ts`, external
  proof specs, and the summary script exist.
- External proofs are skipped by default and enabled only with
  `VISUAL_GLITCH_PROOF_EXTERNAL=1`.
- Layout-shift proof requires browser oracle entries and a matching visual
  instability detector.
- next-themes proof forbids only blank/dark flash events.
- Proof summaries include source ids, claim statuses, environment, and
  limitations.
- Offline frame-file analysis is exported from the public API and covered by
  generated fixture tests.
- Documentation avoids complete-coverage claims.

## Verification

Run the fastest relevant loop after each red/green slice. Final verification:

```text
npm run typecheck
npm test
npm run build
npm run proof
```

Run `npm run proof:external` only when intentionally verifying live external
proofs.
