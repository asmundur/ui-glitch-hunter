# Offline corpus proof notes

Offline corpus proofs use `analyzeVisualFrameFiles` for source-backed frame
sequences that do not require live hosted pages. They broaden evidence, but they
do not prove complete UI glitch coverage.

## GlitchBench research

Checked on 2026-07-09:

- Primary site: `https://glitchbench.github.io/`
- Paper: `https://arxiv.org/abs/2312.05291`
- Code: `https://github.com/GlitchBench/Benchmark`
- Dataset: `https://huggingface.co/datasets/glitchbench/GlitchBench`

The project describes GlitchBench as a CVPR 2024 benchmark for detecting video
game glitches in images. The Hugging Face dataset card reports an MIT license,
Parquet format, one validation split, 607 rows, image/text modalities, and fewer
than 1,000 examples. The public viewer exposes columns such as `image`,
`glitch-type`, `game`, `source`, and `description`.

Observed dataset categories include:

| GlitchBench category | Current detector fit | Notes |
|---|---|---|
| Camera, User Interface and Lighting Issues | Partial | May align with `blank-flash`, `dark-flash`, or `baseline-distance` only when an ordered frame sequence or baseline is available. Single screenshots are better treated as manual evidence. |
| Rendering and Texture Issues | Partial | Can map to `baseline-distance` if a comparable baseline frame exists. Placeholder textures in single screenshots are not directly detected without a baseline. |
| Physics, Collision, and Spawn Issues | Out of scope | These are semantic scene anomalies. Current detectors do not reason about object placement or collisions. |
| Animation and Pose Errors | Out of scope | These are semantic/body-geometry anomalies unless represented as frame-to-frame instability in a sequence. |

Recommendation:

- Do not vendor GlitchBench assets in this repository in this pass.
- Treat GlitchBench as research/manual proof evidence until a specific subset has
  source, license, size, and redistribution approval.
- If a later workflow downloads GlitchBench examples, keep it opt-in/manual and
  write downloaded assets under ignored artifact directories.
- For committed tests, use generated frame fixtures plus a source-backed manifest
  so the public offline API remains covered without relying on dataset assets.

## Offline manifest design

The manifest format mirrors `proof/sources.json` while adding local frame paths:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "source-backed-layout-shift-fixture",
      "kind": "offline-generated-frame-sequence",
      "sourceUrl": "https://web.dev/articles/debug-layout-shifts",
      "documentedCategory": "layout shift / visual jump",
      "frames": ["relative/or/absolute/frame-000.png"],
      "baselineFrames": [],
      "expectedUiGlitchHunterDetectors": ["large-delta"],
      "forbiddenUiGlitchHunterDetectors": [],
      "requiredForDefaultCi": true,
      "notes": [
        "Generated fixture derived from documented behavior; no third-party image asset is vendored."
      ]
    }
  ]
}
```

Rules:

- `frames` and `baselineFrames` are resolved relative to the manifest file.
- `requiredForDefaultCi` controls whether the entry is safe for default proof
  runs. Downloaded or license-sensitive corpora should set it to `false`.
- Entries must state source URL, documented category, expected or forbidden
  detectors, and limitations.
- Large or downloaded assets belong under ignored local/CI artifact directories,
  not in source control.

## API usage

```ts
import { analyzeVisualFrameFiles } from "ui-glitch-hunter";

const result = await analyzeVisualFrameFiles({
  name: "offline-layout-shift",
  frames: ["frame-000.png", "frame-001.png", "frame-002.png"],
  baselineFrames: ["baseline-000.png", "baseline-001.png"],
  thresholds: { maxFrameDelta: 0.03 },
  outputDir: "test-results/visual-glitches",
  imageFormat: "png",
  fps: 20,
});

if (!result.passed) {
  console.log(result.reportHtmlPath);
}
```

Frame sequences use index-based timestamps derived from `fps`. Missing,
unreadable, or oversized inputs fail before analysis with the offending path or
limit in the error message. The current safety limits are at most 500 frame
files per current or baseline sequence and at most 25 MiB per frame file.
