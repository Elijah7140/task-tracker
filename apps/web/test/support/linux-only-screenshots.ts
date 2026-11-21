import { expect, inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    /** Whether `toMatchScreenshot` compares against baselines in this run, set in `vite.config.ts`. */
    comparesScreenshots: boolean;
  }
}

/**
 * Screenshot baselines are Linux-only (§11.1). Linux text rendering is pinned and
 * reproducible, while Windows output changes between Windows builds, so a Windows
 * baseline would only describe one CI image. Where screenshots are not compared,
 * `toMatchScreenshot` passes without capturing anything. The browser tests still
 * render every screen and run every other assertion on that platform.
 */
export function skipScreenshotComparisonUnlessEnabled() {
  if (inject("comparesScreenshots")) {
    return;
  }
  expect.extend({
    toMatchScreenshot() {
      return { pass: true, message: () => "Screenshots are compared on Linux only." };
    },
  });
}
