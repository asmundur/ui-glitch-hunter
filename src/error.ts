import type { AnalysisResult, GlitchEvent } from "./types";
import { relativeDisplayPath } from "./fs-utils";

export class VisualGlitchError extends Error {
  readonly result: AnalysisResult;

  constructor(result: AnalysisResult) {
    super(formatFailureMessage(result));
    this.name = "VisualGlitchError";
    this.result = result;
  }
}

export function formatFailureMessage(result: AnalysisResult): string {
  const firstEvent = result.events[0];
  const lines = [`Visual glitch detected: ${result.name}`, ""];

  if (firstEvent) {
    lines.push(`Detector: ${firstEvent.detector}`);
    lines.push(`Frame range: ${firstEvent.startFrame}-${firstEvent.endFrame}`);
    lines.push(
      `Time range: ${Math.round(firstEvent.startTimeMs)}ms-${Math.round(firstEvent.endTimeMs)}ms`,
    );
  }

  if (result.reportHtmlPath) {
    lines.push(`Report: ${relativeDisplayPath(result.reportHtmlPath)}`);
  }

  return lines.join("\n");
}

export function formatPassMessage(name: string): string {
  return `Expected visual glitches for ${name}, but none were detected.`;
}

export function formatEventSummary(event: GlitchEvent): string {
  return `${event.detector} frames ${event.startFrame}-${event.endFrame}`;
}
