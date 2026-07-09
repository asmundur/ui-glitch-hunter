# Module Map

UI Glitch Hunter is a TypeScript Playwright Test helper library. The runtime
flow is:

```text
public API/matcher -> config resolution -> capture -> mask collection -> frame analysis -> detectors -> baseline/report output
```

## Public Surface

- `src/index.ts`: Re-exports the library API, matcher installer, config helpers, detectors, image metrics, error type, and public types.
- `src/api.ts`: Orchestrates a complete run through config resolution, capture, mask collection, frame analysis, text-event mapping, baseline handling, detection, and report writing.
- `src/matcher.ts`: Installs the Playwright `toHaveNoVisualGlitches` matcher by delegating to `runVisualGlitchCheck`.
- `src/error.ts`: Formats failure and pass messages and wraps failed analysis in `VisualGlitchError`.

## Configuration

- `src/config.ts`: Defines default capture and threshold values, loads `visual-glitch.config.*` through `jiti`, normalizes paths against `cwd`, and resolves per-run option overrides.
- `visual-glitch.config.ts`: Example/local project configuration matching the default output, baseline, capture, threshold, and mask shape.
- `src/types.ts`: Defines the shared contracts for capture config, thresholds, run options, frames, events, manifests, and results.

## Capture And Page Observation

- `src/capture.ts`: Captures raw frames through CDP screencast mode or screenshot sampling mode, runs optional actions during capture, records browser/viewport metadata, and starts bad-text polling.
- `src/masks.ts`: Collects visible selector rectangles before and after capture and de-duplicates mask rectangles.
- `src/text-detector.ts`: Polls page text for known runtime error strings and maps text events to nearest captured frames.

## Image Analysis And Detection

- `src/image-metrics.ts`: Uses Sharp to decode frames, scale/fill masks, compute luminance and blank/dark ratios, create comparison hashes, compute perceptual hashes, and measure frame/baseline distance.
- `src/detectors.ts`: Converts frame metrics into `GlitchEvent` records for blank flashes, dark flashes, instability, and baseline drift.

## Baselines And Reports

- `src/baseline.ts`: Reads and writes baseline manifests and baseline frame images under the configured baseline directory.
- `src/report.ts`: Writes failure report JSON/HTML, current frames, copied baseline frames, and generated diff frames under the configured output directory.
- `src/fs-utils.ts`: Centralizes directory creation/removal, scenario-name sanitization, frame filenames, and relative display paths.

## Tests

- `tests/unit/detectors.spec.ts`: Covers detector thresholds, unstable-frame grouping, and baseline matching.
- `tests/unit/metrics.spec.ts`: Covers image metric extraction, masking, perceptual hash stability, and visual distance behavior.
- `tests/unit/report.spec.ts`: Covers JSON/HTML report and frame artifact writing.
- `tests/e2e/visual-glitch.spec.ts`: Exercises Playwright flows for stable pages, flashes, instability, masking, baselines, matcher output, and CDP capture.

## Boundary Rules

- Keep public API contracts in `src/types.ts` and exports in `src/index.ts` intentional.
- Keep Playwright page interaction in `src/capture.ts`, `src/masks.ts`, and `src/text-detector.ts`.
- Keep image-buffer work inside `src/image-metrics.ts` and report diff generation in `src/report.ts`.
- Prefer detector tests at the metrics/event boundary instead of testing private implementation details.
