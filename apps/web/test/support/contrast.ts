/** An sRGB colour with 0–255 channels and 0–1 alpha. */
export interface Rgba {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

/** The `--tt-*` design tokens declared in one CSS rule, keyed without the prefix. */
export type ThemeTokens = ReadonlyMap<string, string>;

/**
 * Reads the `--tt-*` custom properties declared directly in the rule for
 * `selector`. Theme rules hold flat declarations, so the rule ends at the
 * first closing brace.
 */
export function readThemeTokens(css: string, selector: string): ThemeTokens {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) {
    throw new Error(`No rule for ${selector}.`);
  }
  const body = css.slice(start, css.indexOf("}", start));
  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/--tt-([\w-]+):\s*([^;]+);/g)) {
    tokens.set(match[1]!, match[2]!.trim());
  }
  return tokens;
}

/** Parses `#rrggbb` or `rgb(r g b / a)` token values. */
export function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex !== null) {
    const [red, green, blue] = hex.slice(1).map((channel) => Number.parseInt(channel, 16));
    return { red: red!, green: green!, blue: blue!, alpha: 1 };
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb !== null) {
    const [red, green, blue] = rgb.slice(1, 4).map(Number);
    return { red: red!, green: green!, blue: blue!, alpha: Number(rgb[4] ?? 1) };
  }
  throw new Error(`Unsupported colour ${value}.`);
}

/** Paints a possibly translucent colour over an opaque background. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (upper: number, lower: number) => upper * top.alpha + lower * (1 - top.alpha);
  return {
    red: mix(top.red, bottom.red),
    green: mix(top.green, bottom.green),
    blue: mix(top.blue, bottom.blue),
    alpha: 1,
  };
}

function linearChannel(channel: number) {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: Rgba) {
  return (
    0.2126 * linearChannel(color.red) +
    0.7152 * linearChannel(color.green) +
    0.0722 * linearChannel(color.blue)
  );
}

/** The WCAG 2 contrast ratio between two opaque colours. */
export function contrastRatio(first: Rgba, second: Rgba): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}
