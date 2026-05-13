import type { Page } from "@playwright/test";
import type { GlitchEvent } from "./types";

export const knownBadText = [
  "Application error",
  "Something went wrong",
  "Unhandled Runtime Error",
  "Internal Server Error",
  "Loading chunk failed",
];

export type TextPollingHandle = {
  events: GlitchEvent[];
  stop: () => void;
};

export function startBadTextPolling(
  page: Page,
  startedAtMs: number,
  intervalMs = 200,
): TextPollingHandle {
  const events: GlitchEvent[] = [];
  const seen = new Set<string>();
  let stopped = false;

  const timer = setInterval(() => {
    if (stopped) {
      return;
    }

    void page
      .evaluate((badStrings) => {
        const bodyText =
          document.body?.innerText ??
          document.documentElement?.textContent ??
          "";
        return badStrings.find((badString) => bodyText.includes(badString));
      }, knownBadText)
      .then((match) => {
        if (!match || seen.has(match)) {
          return;
        }
        seen.add(match);
        const timestampMs = Date.now() - startedAtMs;
        events.push({
          detector: "bad-text",
          message: `Known bad text appeared: ${match}`,
          startFrame: 0,
          endFrame: 0,
          startTimeMs: timestampMs,
          endTimeMs: timestampMs,
          details: { text: match },
        });
      })
      .catch(() => {
        // Navigations can invalidate execution contexts while polling.
      });
  }, intervalMs);

  return {
    events,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

export function mapTextEventsToFrames(
  events: GlitchEvent[],
  frameTimes: { index: number; timestampMs: number }[],
): GlitchEvent[] {
  if (events.length === 0 || frameTimes.length === 0) {
    return events;
  }

  return events.map((event) => {
    const nearest = frameTimes.reduce((best, candidate) => {
      return Math.abs(candidate.timestampMs - event.startTimeMs) <
        Math.abs(best.timestampMs - event.startTimeMs)
        ? candidate
        : best;
    }, frameTimes[0]);

    return {
      ...event,
      startFrame: nearest.index,
      endFrame: nearest.index,
    };
  });
}
