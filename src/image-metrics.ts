import crypto from "node:crypto";
import sharp from "sharp";
import type { CapturedFrame, MaskRect, RawFrame, ViewportSize } from "./types";

export type InternalFrameAnalysis = {
  frame: CapturedFrame;
  comparisonPixels: Buffer;
};

const PHASH_SIZE = 32;
const PHASH_LOW_SIZE = 8;
const COMPARISON_SIZE = 64;
const WHITE_LUMINANCE = 245;
const DARK_LUMINANCE = 18;

export async function analyzeRawFrames(
  rawFrames: RawFrame[],
  masks: MaskRect[],
  viewport: ViewportSize,
): Promise<CapturedFrame[]> {
  const analyzed: InternalFrameAnalysis[] = [];

  for (const rawFrame of rawFrames) {
    const current = await analyzeRawFrame(rawFrame, masks, viewport);
    const previous = analyzed.at(-1);
    if (previous) {
      current.frame.frameDelta = frameDistance(
        previous.comparisonPixels,
        current.comparisonPixels,
      );
    }
    analyzed.push(current);
  }

  return analyzed.map((item) => item.frame);
}

export async function analyzeRawFrame(
  rawFrame: RawFrame,
  masks: MaskRect[] = [],
  viewport?: ViewportSize,
): Promise<InternalFrameAnalysis> {
  const { data, info } = await sharp(rawFrame.buffer, { failOn: "none" })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const scaledMasks = scaleMasks(
    masks,
    info.width,
    info.height,
    viewport ?? { width: info.width, height: info.height },
  );
  const maskBitmap = createMaskBitmap(info.width, info.height, scaledMasks);
  const maskedRgba = Buffer.from(data);
  fillMaskedPixels(maskedRgba, info.width, info.height, scaledMasks);

  const metrics = computePixelMetrics(data, info.width, info.height, maskBitmap);
  const comparisonPixels = await resizeGrayscale(
    maskedRgba,
    info.width,
    info.height,
    COMPARISON_SIZE,
  );
  const phashPixels = await resizeGrayscale(
    maskedRgba,
    info.width,
    info.height,
    PHASH_SIZE,
  );
  const perceptualHash = computePHash(phashPixels);
  const hash = crypto.createHash("sha256").update(comparisonPixels).digest("hex");

  return {
    frame: {
      index: rawFrame.index,
      timestampMs: rawFrame.timestampMs,
      width: info.width,
      height: info.height,
      hash,
      perceptualHash,
      averageLuminance: metrics.averageLuminance,
      blankRatio: metrics.blankRatio,
      darkRatio: metrics.darkRatio,
    },
    comparisonPixels,
  };
}

export function frameDistance(a: Buffer, b: Buffer): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += Math.abs(a[index] - b[index]);
  }
  return total / (length * 255);
}

export function perceptualHashDistance(a: string, b: string): number {
  if (!a || !b) {
    return 1;
  }

  const maxHexLength = Math.max(a.length, b.length);
  const left = a.padStart(maxHexLength, "0");
  const right = b.padStart(maxHexLength, "0");
  let differingBits = 0;

  for (let index = 0; index < maxHexLength; index += 1) {
    const diff = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    differingBits += countBits(diff);
  }

  return differingBits / (maxHexLength * 4);
}

export function visualFrameDistance(
  current: CapturedFrame,
  baseline: CapturedFrame,
): number {
  return Math.max(
    perceptualHashDistance(current.perceptualHash, baseline.perceptualHash),
    Math.abs(current.averageLuminance - baseline.averageLuminance) / 255,
    Math.abs(current.blankRatio - baseline.blankRatio),
    Math.abs(current.darkRatio - baseline.darkRatio),
  );
}

function computePixelMetrics(
  rgba: Buffer,
  width: number,
  height: number,
  maskBitmap?: Uint8Array,
): {
  averageLuminance: number;
  blankRatio: number;
  darkRatio: number;
} {
  let considered = 0;
  let luminanceTotal = 0;
  let whiteCount = 0;
  let darkCount = 0;
  const buckets = new Map<number, number>();

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    if (maskBitmap?.[pixelIndex]) {
      continue;
    }

    const offset = pixelIndex * 4;
    const alpha = rgba[offset + 3] / 255;
    const r = rgba[offset] * alpha + 255 * (1 - alpha);
    const g = rgba[offset + 1] * alpha + 255 * (1 - alpha);
    const b = rgba[offset + 2] * alpha + 255 * (1 - alpha);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    considered += 1;
    luminanceTotal += luminance;

    if (luminance >= WHITE_LUMINANCE && channelSpread(r, g, b) <= 24) {
      whiteCount += 1;
    }
    if (luminance <= DARK_LUMINANCE) {
      darkCount += 1;
    }

    const bucket =
      (Math.round(r / 16) << 8) |
      (Math.round(g / 16) << 4) |
      Math.round(b / 16);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  if (considered === 0) {
    return {
      averageLuminance: 255,
      blankRatio: 1,
      darkRatio: 0,
    };
  }

  const dominantRatio = Math.max(...buckets.values()) / considered;
  const nearWhiteRatio = whiteCount / considered;

  return {
    averageLuminance: luminanceTotal / considered,
    blankRatio: Math.max(nearWhiteRatio, dominantRatio >= 0.98 ? dominantRatio : 0),
    darkRatio: darkCount / considered,
  };
}

async function resizeGrayscale(
  rgba: Buffer,
  width: number,
  height: number,
  size: number,
): Promise<Buffer> {
  return sharp(rgba, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .greyscale()
    .raw()
    .toBuffer();
}

function computePHash(pixels: Buffer): string {
  const coefficients: number[] = [];
  for (let u = 0; u < PHASH_LOW_SIZE; u += 1) {
    for (let v = 0; v < PHASH_LOW_SIZE; v += 1) {
      let sum = 0;
      for (let x = 0; x < PHASH_SIZE; x += 1) {
        for (let y = 0; y < PHASH_SIZE; y += 1) {
          const pixel = pixels[x * PHASH_SIZE + y] - 128;
          sum +=
            pixel *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PHASH_SIZE)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * PHASH_SIZE));
        }
      }
      const alphaU = u === 0 ? 1 / Math.sqrt(2) : 1;
      const alphaV = v === 0 ? 1 / Math.sqrt(2) : 1;
      coefficients.push(0.25 * alphaU * alphaV * sum);
    }
  }

  const withoutDc = coefficients.slice(1);
  const median = sortedMedian(withoutDc);
  let bits = "";
  for (const coefficient of withoutDc) {
    bits += coefficient > median ? "1" : "0";
  }
  bits = bits.padEnd(64, "0").slice(0, 64);

  let hex = "";
  for (let index = 0; index < 64; index += 4) {
    hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return hex;
}

function sortedMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function channelSpread(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function countBits(value: number): number {
  let count = 0;
  let current = value;
  while (current > 0) {
    count += current & 1;
    current >>= 1;
  }
  return count;
}

function scaleMasks(
  masks: MaskRect[],
  width: number,
  height: number,
  viewport: ViewportSize,
): MaskRect[] {
  const scaleX = viewport.width > 0 ? width / viewport.width : 1;
  const scaleY = viewport.height > 0 ? height / viewport.height : 1;

  return masks.map((mask) => ({
    x: mask.x * scaleX,
    y: mask.y * scaleY,
    width: mask.width * scaleX,
    height: mask.height * scaleY,
  }));
}

function createMaskBitmap(
  width: number,
  height: number,
  masks: MaskRect[],
): Uint8Array | undefined {
  if (masks.length === 0) {
    return undefined;
  }

  const bitmap = new Uint8Array(width * height);
  for (const mask of masks) {
    const xStart = clamp(Math.floor(mask.x), 0, width);
    const xEnd = clamp(Math.ceil(mask.x + mask.width), 0, width);
    const yStart = clamp(Math.floor(mask.y), 0, height);
    const yEnd = clamp(Math.ceil(mask.y + mask.height), 0, height);

    for (let y = yStart; y < yEnd; y += 1) {
      bitmap.fill(1, y * width + xStart, y * width + xEnd);
    }
  }
  return bitmap;
}

function fillMaskedPixels(
  rgba: Buffer,
  width: number,
  height: number,
  masks: MaskRect[],
): void {
  for (const mask of masks) {
    const xStart = clamp(Math.floor(mask.x), 0, width);
    const xEnd = clamp(Math.ceil(mask.x + mask.width), 0, width);
    const yStart = clamp(Math.floor(mask.y), 0, height);
    const yEnd = clamp(Math.ceil(mask.y + mask.height), 0, height);

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        const offset = (y * width + x) * 4;
        rgba[offset] = 255;
        rgba[offset + 1] = 255;
        rgba[offset + 2] = 255;
        rgba[offset + 3] = 255;
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
