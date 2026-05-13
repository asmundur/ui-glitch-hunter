import { test, expect } from "@playwright/test";
import sharp from "sharp";
import {
  analyzeRawFrame,
  perceptualHashDistance,
  visualFrameDistance,
} from "../../src";

test("extracts blank and dark frame metrics", async () => {
  const white = await solidImage("#ffffff");
  const black = await solidImage("#000000");

  const whiteFrame = await analyzeRawFrame({
    index: 0,
    timestampMs: 0,
    buffer: white,
  });
  const blackFrame = await analyzeRawFrame({
    index: 1,
    timestampMs: 50,
    buffer: black,
  });

  expect(whiteFrame.frame.blankRatio).toBeGreaterThan(0.99);
  expect(whiteFrame.frame.darkRatio).toBeLessThan(0.01);
  expect(blackFrame.frame.darkRatio).toBeGreaterThan(0.99);
  expect(blackFrame.frame.blankRatio).toBeGreaterThan(0.99);
  expect(visualFrameDistance(whiteFrame.frame, blackFrame.frame)).toBeGreaterThan(0.9);
});

test("masks ignored regions before computing metrics", async () => {
  const buffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([
      {
        input: await solidImage("#000000", 50, 100),
        left: 0,
        top: 0,
      },
    ])
    .jpeg()
    .toBuffer();

  const unmasked = await analyzeRawFrame({
    index: 0,
    timestampMs: 0,
    buffer,
  });
  const masked = await analyzeRawFrame(
    {
      index: 0,
      timestampMs: 0,
      buffer,
    },
    [{ x: 0, y: 0, width: 50, height: 100 }],
    { width: 100, height: 100 },
  );

  expect(unmasked.frame.blankRatio).toBeLessThan(0.6);
  expect(masked.frame.blankRatio).toBeGreaterThan(0.99);
});

test("perceptual hashes are stable for identical frames and differ for patterns", async () => {
  const checkerA = await checkerImage(false);
  const checkerB = await checkerImage(false);
  const checkerInverse = await checkerImage(true);

  const frameA = await analyzeRawFrame({
    index: 0,
    timestampMs: 0,
    buffer: checkerA,
  });
  const frameB = await analyzeRawFrame({
    index: 1,
    timestampMs: 50,
    buffer: checkerB,
  });
  const frameInverse = await analyzeRawFrame({
    index: 2,
    timestampMs: 100,
    buffer: checkerInverse,
  });

  expect(
    perceptualHashDistance(
      frameA.frame.perceptualHash,
      frameB.frame.perceptualHash,
    ),
  ).toBe(0);
  expect(
    visualFrameDistance(frameA.frame, frameInverse.frame),
  ).toBeGreaterThan(0.05);
});

async function solidImage(
  background: string,
  width = 100,
  height = 100,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  })
    .jpeg()
    .toBuffer();
}

async function checkerImage(inverse: boolean): Promise<Buffer> {
  const size = 96;
  const tile = 12;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${Array.from(
    { length: size / tile },
    (_, y) =>
      Array.from({ length: size / tile }, (_unused, x) => {
        const light = (x + y) % 2 === (inverse ? 1 : 0);
        return `<rect x="${x * tile}" y="${y * tile}" width="${tile}" height="${tile}" fill="${light ? "#fff" : "#111"}"/>`;
      }).join(""),
  ).join("")}</svg>`;

  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}
