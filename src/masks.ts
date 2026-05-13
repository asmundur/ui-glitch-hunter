import type { Page } from "@playwright/test";
import type { MaskRect } from "./types";

export async function collectMaskRects(
  page: Page,
  selectors: string[],
): Promise<MaskRect[]> {
  if (selectors.length === 0) {
    return [];
  }

  return page.evaluate((maskSelectors) => {
    const rects: MaskRect[] = [];
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    for (const selector of maskSelectors) {
      let elements: Element[] = [];
      try {
        elements = Array.from(document.querySelectorAll(selector));
      } catch {
        continue;
      }

      for (const element of elements) {
        const style = window.getComputedStyle(element);
        if (
          style.visibility === "hidden" ||
          style.display === "none" ||
          Number(style.opacity) === 0
        ) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const x = Math.max(0, rect.left);
        const y = Math.max(0, rect.top);
        const right = Math.min(viewportWidth, rect.right);
        const bottom = Math.min(viewportHeight, rect.bottom);
        const width = right - x;
        const height = bottom - y;

        if (width > 0 && height > 0) {
          rects.push({ x, y, width, height });
        }
      }
    }

    return rects;
  }, selectors);
}

export function mergeMaskRects(...sets: MaskRect[][]): MaskRect[] {
  const seen = new Set<string>();
  const merged: MaskRect[] = [];

  for (const rect of sets.flat()) {
    const key = [
      Math.round(rect.x),
      Math.round(rect.y),
      Math.round(rect.width),
      Math.round(rect.height),
    ].join(":");
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(rect);
    }
  }

  return merged;
}
