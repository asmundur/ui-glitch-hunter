import type { CDPSession, Page } from "@playwright/test";
import type {
  CaptureConfig,
  CaptureMode,
  GlitchEvent,
  RawFrame,
  ViewportSize,
} from "./types";
import { startBadTextPolling } from "./text-detector";

export type RawCaptureResult = {
  mode: CaptureMode;
  rawFrames: RawFrame[];
  badTextEvents: GlitchEvent[];
  viewport: ViewportSize;
  browserName: string;
};

type ActiveCapture = {
  frames: RawFrame[];
  ready: Promise<void>;
  stop: () => Promise<void>;
};

export async function captureRawTimeline(
  page: Page,
  config: CaptureConfig,
  action?: () => Promise<unknown>,
): Promise<RawCaptureResult> {
  if (config.viewport) {
    await page.setViewportSize(config.viewport);
  }

  const startedAtMs = Date.now();
  const activeCapture =
    config.mode === "cdp"
      ? await startCdpCapture(page, config, startedAtMs)
      : await startScreenshotCapture(page, config, startedAtMs);
  const textPolling = startBadTextPolling(page, startedAtMs);
  await Promise.race([activeCapture.ready, sleep(250)]);

  try {
    await Promise.all([sleep(config.durationMs), action?.() ?? Promise.resolve()]);
  } finally {
    textPolling.stop();
    await activeCapture.stop();
  }

  if (activeCapture.frames.length === 0 && config.mode === "cdp") {
    const fallback = await captureScreenshotOnce(page, config, startedAtMs);
    activeCapture.frames.push(fallback);
  }

  return {
    mode: config.mode,
    rawFrames: activeCapture.frames.map((frame, index) => ({
      ...frame,
      index,
    })),
    badTextEvents: textPolling.events,
    viewport: page.viewportSize() ?? config.viewport,
    browserName: page.context().browser()?.browserType().name() ?? "unknown",
  };
}

async function startCdpCapture(
  page: Page,
  config: CaptureConfig,
  startedAtMs: number,
): Promise<ActiveCapture> {
  const frames: RawFrame[] = [];
  let client: CDPSession | undefined;
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  client = await page.context().newCDPSession(page);

  client.on("Page.screencastFrame", (event) => {
    const now = Date.now();
    void client
      ?.send("Page.screencastFrameAck", { sessionId: event.sessionId })
      .catch(() => undefined);

    const timestampMs = now - startedAtMs;
    frames.push({
      index: frames.length,
      timestampMs,
      buffer: Buffer.from(event.data, "base64"),
    });
    markReady();
  });

  await client.send("Page.enable");
  await client.send("Page.startScreencast", {
    format: config.imageFormat,
    quality: config.imageFormat === "jpeg" ? config.quality : undefined,
    everyNthFrame: 1,
  });

  return {
    frames,
    ready,
    stop: async () => {
      if (!client) {
        return;
      }

      await client.send("Page.stopScreencast").catch(() => undefined);
      await client.detach().catch(() => undefined);
      client = undefined;
    },
  };
}

async function startScreenshotCapture(
  page: Page,
  config: CaptureConfig,
  startedAtMs: number,
): Promise<ActiveCapture> {
  const frames: RawFrame[] = [];
  let stopped = false;
  const intervalMs = 1000 / Math.max(1, config.fps);
  let loopFinished: Promise<void> | undefined;
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  loopFinished = (async () => {
    while (!stopped) {
      const loopStartedAt = Date.now();
      try {
        frames.push(await captureScreenshotOnce(page, config, startedAtMs));
        markReady();
      } catch {
        // Page teardown can race the final screenshot in failing tests.
      }

      const elapsed = Date.now() - loopStartedAt;
      await sleep(Math.max(0, intervalMs - elapsed));
    }
  })();

  return {
    frames,
    ready,
    stop: async () => {
      stopped = true;
      await loopFinished;
    },
  };
}

async function captureScreenshotOnce(
  page: Page,
  config: CaptureConfig,
  startedAtMs: number,
): Promise<RawFrame> {
  const buffer = await page.screenshot({
    type: config.imageFormat,
    quality: config.imageFormat === "jpeg" ? config.quality : undefined,
    fullPage: false,
    animations: "allow",
  });

  return {
    index: 0,
    timestampMs: Date.now() - startedAtMs,
    buffer,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
