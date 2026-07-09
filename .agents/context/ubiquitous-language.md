# Ubiquitous Language

This glossary defines the canonical project vocabulary for UI Glitch Hunter.
Use these terms in plans, issues, tests, user-facing messages, and code unless
a feature deliberately renames a concept.

## Domain Concepts

| Canonical Term | Aliases to Avoid | Definition | Source Reference |
|---|---|---|---|
| UI Glitch Hunter | visual glitch detector package | The TypeScript Playwright Test helper library that captures page frames and detects transient visual failures. | `.agent-scaffold.json`; `README.md`; `package.json` |
| visual glitch | UI bug, flicker bug, visual artifact | A transient visual failure during page load or scripted interaction. | `README.md`; `src/api.ts`; `src/error.ts` |
| capture run | check, scan, session | One named execution of `runVisualGlitchCheck`, including resolved config, browser metadata, frame data, text events, detector events, and optional report paths. | `src/api.ts`; `src/types.ts` |
| timeline | recording, sequence | The ordered set of frames captured during a run. | `src/types.ts`; `README.md`; `src/capture.ts` |
| raw frame | screenshot buffer, screencast image | The original image buffer with index and timestamp before image analysis. | `src/types.ts`; `src/capture.ts` |
| captured frame | analyzed frame, frame metrics | A raw frame after image metrics are extracted, including hashes, luminance, blank/dark ratios, frame delta, and optional baseline distance. | `src/types.ts`; `src/image-metrics.ts` |
| action | callback, interaction callback | Optional async work executed while a timeline is being captured, usually to trigger the UI state under test. | `README.md`; `src/types.ts`; `src/capture.ts` |
| viewport | screen size, browser size | The Playwright page viewport used for capture and mask scaling. | `src/types.ts`; `src/config.ts`; `src/image-metrics.ts` |

## User Actions And Workflows

| Canonical Term | Aliases to Avoid | Definition | Source Reference |
|---|---|---|---|
| visual glitch check | visual scan, glitch scan | The full workflow that resolves config, captures frames, analyzes metrics, detects events, and returns a pass/fail result. | `src/api.ts`; `README.md` |
| `runVisualGlitchCheck` | low-level check helper | The non-throwing API that returns a `CaptureTimelineResult` with `passed`, events, frames, and report metadata. | `src/api.ts`; `src/index.ts`; `tests/e2e/visual-glitch.spec.ts` |
| `captureVisualTimeline` | timeline capture helper | The API that runs a visual glitch check and throws `VisualGlitchError` when events are detected. | `src/api.ts`; `src/index.ts`; `README.md` |
| `expectNoVisualGlitches` | assertion helper | Convenience API for asserting that a page has no detected visual glitches. | `src/api.ts`; `README.md` |
| `toHaveNoVisualGlitches` | matcher, Playwright matcher | Playwright expect matcher installed by `installVisualGlitchMatcher`. | `src/matcher.ts`; `README.md`; `tests/e2e/visual-glitch.spec.ts` |
| update mode | baseline update flag, update baseline mode | Baseline-writing mode enabled by `VISUAL_GLITCH_UPDATE=1`, `true`, or `yes`. | `README.md`; `src/config.ts`; `tests/e2e/visual-glitch.spec.ts` |

## Capture And Observation

| Canonical Term | Aliases to Avoid | Definition | Source Reference |
|---|---|---|---|
| capture mode | mode | The configured frame collection strategy, either `cdp` or `screenshot`. | `src/types.ts`; `src/config.ts`; `README.md` |
| CDP capture | screencast mode, Chromium capture | Chromium screencast capture through a Playwright CDP session that processes `Page.screencastFrame` events. | `README.md`; `src/capture.ts`; `src/types.ts` |
| screenshot capture | sampled screenshot mode | Portable fallback capture using repeated Playwright screenshots sampled at the configured FPS. | `README.md`; `src/capture.ts`; `src/types.ts` |
| FPS | sample rate | Configured frames per second. In screenshot capture it controls sampling; in CDP capture it is run metadata. | `README.md`; `src/types.ts`; `src/config.ts` |
| bad text | runtime error text, known error text | Known page text such as "Application error" or "Unhandled Runtime Error" that is mapped to a `bad-text` event. | `src/text-detector.ts`; `src/types.ts`; `README.md` |
| mask | ignored region, visual ignore selector | A selector-defined visible rectangle ignored during image metric computation. | `src/masks.ts`; `src/image-metrics.ts`; `src/config.ts` |
| mask rectangle | mask rect | Viewport-relative rectangle collected from visible matching elements before or after capture. | `src/masks.ts`; `src/types.ts` |

## Detection Vocabulary

| Canonical Term | Aliases to Avoid | Definition | Source Reference |
|---|---|---|---|
| detector | rule, check | Logic that converts frame metrics into `GlitchEvent` records. | `src/detectors.ts`; `src/types.ts`; `src/error.ts` |
| glitch event | finding, failure event | A detected issue with detector name, message, frame range, time range, and optional details. | `src/types.ts`; `src/detectors.ts`; `src/report.ts` |
| blank flash | white flash | A frame that becomes mostly blank after meaningful content has already appeared. | `src/detectors.ts`; `tests/unit/detectors.spec.ts`; `tests/e2e/visual-glitch.spec.ts` |
| dark flash | black flash | A frame that becomes mostly dark after non-dark content has already appeared. | `src/detectors.ts`; `tests/unit/detectors.spec.ts`; `tests/e2e/visual-glitch.spec.ts` |
| large delta | large visual jump, visual jump | A frame range whose visual difference exceeds the configured frame delta threshold. | `src/detectors.ts`; `README.md`; `tests/e2e/visual-glitch.spec.ts` |
| consecutive instability | unstable frame range | A run of unstable frames longer than `maxConsecutiveUnstableFrames`. | `src/detectors.ts`; `tests/unit/detectors.spec.ts` |
| baseline distance | baseline drift, baseline mismatch | Distance between current frame metrics and the nearest baseline frame within the allowed timing window. | `src/detectors.ts`; `src/image-metrics.ts`; `tests/unit/detectors.spec.ts` |
| frame delta | frame difference | Normalized pixel distance between adjacent comparison frames. | `src/image-metrics.ts`; `src/detectors.ts`; `src/types.ts` |
| perceptual hash | pHash, visual hash | Hash derived from resized grayscale frame data and used for visual distance comparison. | `src/image-metrics.ts`; `tests/unit/metrics.spec.ts`; `src/types.ts` |

## Configuration And Artifacts

| Canonical Term | Aliases to Avoid | Definition | Source Reference |
|---|---|---|---|
| visual glitch config | user config, runtime config | Effective configuration containing output paths, baseline paths, capture settings, thresholds, and masks. | `src/config.ts`; `src/types.ts`; `visual-glitch.config.ts` |
| run config | resolved config | Visual glitch config after loading defaults and applying per-run option overrides. | `src/config.ts`; `src/api.ts` |
| threshold config | detector limits, thresholds | Numeric detector limits such as frame delta, blank/dark ratios, text visibility ratio, unstable frame count, and baseline distance. | `src/types.ts`; `src/config.ts`; `src/detectors.ts` |
| output directory | report directory | Directory where failure reports and current/baseline/diff frame artifacts are written. | `README.md`; `src/config.ts`; `src/report.ts` |
| baseline directory | baseline store | Directory where update mode stores baseline manifests and frame images. | `README.md`; `src/config.ts`; `src/baseline.ts` |
| timeline manifest | manifest, baseline manifest | JSON metadata for a baseline timeline, including browser, viewport, timing, frame count, and frame metrics. | `src/types.ts`; `src/baseline.ts` |
| failure report | report, visual glitch report | JSON and HTML artifacts written when a run fails. | `README.md`; `src/report.ts`; `src/error.ts` |
| diff frame | visual diff, diff image | Generated image showing pixel differences between a current frame and nearest baseline frame. | `README.md`; `src/report.ts` |

## Modules And Boundaries

| Canonical Term | Aliases to Avoid | Definition | Source Reference |
|---|---|---|---|
| public API | exports, library surface | Exports from `src/index.ts`, including API helpers, matcher installer, config helpers, detectors, metrics, errors, and public types. | `src/index.ts`; `.agents/architecture/module-map.md` |
| capture layer | frame acquisition | Code that collects raw frames and page-observation events from Playwright. | `src/capture.ts`; `src/text-detector.ts`; `src/masks.ts` |
| image metrics | frame analysis, image analysis | Sharp-based frame decoding and metric extraction for luminance, blank/dark ratios, hashes, and visual distance. | `src/image-metrics.ts`; `tests/unit/metrics.spec.ts` |
| detector layer | detection logic | Detection functions that classify analyzed frames into glitch events. | `src/detectors.ts`; `tests/unit/detectors.spec.ts` |
| baseline layer | baseline handling | Baseline manifest and frame-image load/save behavior. | `src/baseline.ts`; `tests/e2e/visual-glitch.spec.ts` |
| report layer | report generation | Failure report JSON/HTML, current frame, baseline frame, and diff-frame writing. | `src/report.ts`; `tests/unit/report.spec.ts` |

## External Systems

| Canonical Term | Aliases to Avoid | Definition | Source Reference |
|---|---|---|---|
| Playwright Test | Playwright, test runner | Peer dependency and test framework used by callers and by this repository's unit/e2e tests. | `package.json`; `playwright.config.ts`; `README.md` |
| Chromium | Chrome, browser | Browser used for CDP screencast capture and the e2e test project. | `README.md`; `playwright.config.ts`; `src/capture.ts` |
| Sharp | image library | Image processing dependency used for decoding, resizing, metric extraction, and diff generation. | `package.json`; `src/image-metrics.ts`; `src/report.ts` |
| jiti | config loader | Runtime loader used to import TypeScript/JavaScript visual glitch config files. | `package.json`; `src/config.ts` |
| Beads | task tracker, issue tracker | Project task tracker used for durable work state and `.beads/issues.jsonl` snapshots. | `AGENTS.md`; `.beads/issues.jsonl` |
