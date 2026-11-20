import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  composite,
  contrastRatio,
  parseColor,
  readThemeTokens,
  type Rgba,
  type ThemeTokens,
} from "./support/contrast.js";

// Read the file directly: Vitest stubs CSS imports, including `?raw`.
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

/** WCAG 2.2 AA minimums: 1.4.3 for text and 1.4.11 for UI component outlines. */
const TEXT_MINIMUM = 4.5;
const OUTLINE_MINIMUM = 3;

const THEME_SELECTORS = {
  light: ":root",
  dark: ':root[data-theme="dark"]',
} as const;

const SURFACES = ["canvas", "sidebar", "surface", "raised"] as const;

function color(tokens: ThemeTokens, name: string): Rgba {
  const value = tokens.get(name);
  if (value === undefined) {
    throw new Error(`Missing token --tt-${name}.`);
  }
  return parseColor(value);
}

/** Every resting surface, and each one under the translucent hover wash. */
function surfaces(tokens: ThemeTokens): ReadonlyArray<readonly [string, Rgba]> {
  return SURFACES.flatMap((name) => {
    const base = color(tokens, name);
    return [
      [name, base],
      [`${name} + hover`, composite(color(tokens, "hover"), base)],
    ] as const;
  });
}

/** Each surface tinted by accent-soft, as on a selected row or project icon. */
function accentSoftSurfaces(tokens: ThemeTokens): ReadonlyArray<readonly [string, Rgba]> {
  return SURFACES.map((name) => [
    `${name} + accent-soft`,
    composite(color(tokens, "accent-soft"), color(tokens, name)),
  ]);
}

/** Pairs below `minimum`, formatted for a readable failure message. */
function failures(
  tokens: ThemeTokens,
  foreground: string,
  backgrounds: ReadonlyArray<readonly [string, Rgba]>,
  minimum: number,
) {
  const ink = color(tokens, foreground);
  return backgrounds
    .map(([name, background]) => ({ name, ratio: contrastRatio(ink, background) }))
    .filter(({ ratio }) => ratio < minimum)
    .map(({ name, ratio }) => `${foreground} on ${name}: ${ratio.toFixed(2)}`);
}

function fills(tokens: ThemeTokens, ...names: ReadonlyArray<string>) {
  return names.map((name) => [name, color(tokens, name)] as const);
}

describe.each(Object.entries(THEME_SELECTORS))("The %s theme tokens", (_theme, selector) => {
  const tokens = readThemeTokens(css, selector);

  it.each(["fg", "fg-muted", "fg-subtle", "danger"])(
    "Keep %s text at 4.5:1 on every surface and hover state",
    (foreground) => {
      const backgrounds = surfaces(tokens);

      const low = failures(tokens, foreground, backgrounds, TEXT_MINIMUM);

      expect(low).toEqual([]);
    },
  );

  it("Keep accent text at 4.5:1 on every surface, hover state and accent-soft tint", () => {
    const backgrounds = [...surfaces(tokens), ...accentSoftSurfaces(tokens)];

    const low = failures(tokens, "accent-text", backgrounds, TEXT_MINIMUM);

    expect(low).toEqual([]);
  });

  it("Keep on-accent text at 4.5:1 on the accent fill and its hover", () => {
    const backgrounds = fills(tokens, "accent", "accent-hover");

    const low = failures(tokens, "on-accent", backgrounds, TEXT_MINIMUM);

    expect(low).toEqual([]);
  });

  it("Keep on-danger text at 4.5:1 on the danger fill and its hover", () => {
    const backgrounds = fills(tokens, "danger-solid", "danger-solid-hover");

    const low = failures(tokens, "on-danger", backgrounds, TEXT_MINIMUM);

    expect(low).toEqual([]);
  });

  it("Keep control outlines at 3:1 on every surface, hover state and accent-soft tint", () => {
    const backgrounds = [...surfaces(tokens), ...accentSoftSurfaces(tokens)];

    const low = failures(tokens, "control-outline", backgrounds, OUTLINE_MINIMUM);

    expect(low).toEqual([]);
  });

  it("Keep the accent fill at 3:1 on resting surfaces for checked controls and focus borders", () => {
    const backgrounds = fills(tokens, ...SURFACES);

    const low = failures(tokens, "accent", backgrounds, OUTLINE_MINIMUM);

    expect(low).toEqual([]);
  });
});
