import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { formatFailureMessage, formatPassMessage } from "./error";
import { runVisualGlitchCheck } from "./api";
import type { ExpectNoVisualGlitchesOptions } from "./types";

type ExpectLike = typeof expect;

export function installVisualGlitchMatcher(expectInstance: ExpectLike = expect): void {
  expectInstance.extend({
    async toHaveNoVisualGlitches(
      received: Page,
      options: ExpectNoVisualGlitchesOptions,
    ) {
      const result = await runVisualGlitchCheck(received, options);
      return {
        pass: result.passed,
        message: () =>
          result.passed
            ? formatPassMessage(options.name)
            : formatFailureMessage(result),
      };
    },
  });
}

declare global {
  namespace PlaywrightTest {
    interface Matchers<R, T = unknown> {
      toHaveNoVisualGlitches(
        options: ExpectNoVisualGlitchesOptions,
      ): Promise<R>;
    }
  }
}
