import { expect } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ResolvedTheme } from "../../src/state/theme-preference.js";
import { useThemeStore } from "../../src/state/theme-store.js";

/** Both themes, for light and dark baselines of the same screen. */
export const THEMES: ReadonlyArray<ResolvedTheme> = ["light", "dark"];

/**
 * Applies a theme, parks the pointer on the title bar mark so no hover styles
 * show, and waits until fonts and the next frame have rendered.
 */
export async function settleTheme(theme: ResolvedTheme) {
  useThemeStore.setState({ preference: theme });
  await userEvent.hover(page.getByTestId("title-bar-brand"), { force: true });
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/** Matches the standard shell baseline, plus a 1080p baseline for the same screen. */
export async function matchShellAtBothSizes(screen: string, theme: ResolvedTheme) {
  const shell = page.getByTestId("app-shell");
  await settleTheme(theme);
  await expect.element(shell).toMatchScreenshot(`${screen}-${theme}`);

  const { innerWidth, innerHeight } = window;
  try {
    await page.viewport(1920, 1080);
    await settleTheme(theme);
    await expect.element(shell).toMatchScreenshot(`${screen}-1080p-${theme}`);
  } finally {
    await page.viewport(innerWidth, innerHeight);
  }
}
