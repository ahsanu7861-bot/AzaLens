/**
 * WCAG contrast from colours the browser itself resolved, with translucent layers composited first.
 *
 * Kept free of Playwright and DOM types so contrast.spec.ts can check it against independently calculated
 * fixtures without launching a browser.
 *
 * Chromium returns a Tailwind v4 opacity modifier such as `bg-positive/10` as `oklab(L a b / alpha)`, not as
 * `rgba(...)`, so both forms are parsed. Compositing is standard source-over alpha blending on
 * gamma-encoded sRGB channels, which is how the browser paints these layers.
 */

/** sRGB channels on a 0–255 scale (unrounded) with alpha on a 0–1 scale. */
export type Rgba = { r: number; g: number; b: number; alpha: number };

/** WCAG relative luminance and contrast. Unchanged from the original spec helper, including 0.03928. */
export function contrastRatio(foreground: number[], background: number[]): number {
  const luminance = (channels: number[]) => {
    const [r, g, b] = channels.map((value) => {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function number(token: string, value: string): number {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?%?$/i.test(token)) throw new Error(`Unparsable colour: ${value}`);
  return Number.parseFloat(token);
}

/** A channel that may be written as a number or a percentage of `percentScale`. */
function channel(token: string, value: string, percentScale: number): number {
  const parsed = number(token, value);
  return token.endsWith("%") ? (parsed / 100) * percentScale : parsed;
}

function alphaOf(token: string | undefined, value: string): number {
  return token === undefined ? 1 : clamp(channel(token, value, 1), 0, 1);
}

/** Splits `fn(a, b, c, d)` or `fn(a b c / d)` into its channel tokens and optional alpha token. */
function argumentsOf(body: string, value: string): { channels: string[]; alpha?: string } {
  const trimmed = body.trim();
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((part) => part.trim());
    if (parts.length !== 3 && parts.length !== 4) throw new Error(`Unparsable colour: ${value}`);
    return { channels: parts.slice(0, 3), alpha: parts[3] };
  }
  const [main, alpha, ...rest] = trimmed.split("/").map((part) => part.trim());
  const channels = main.split(/\s+/);
  if (rest.length || channels.length !== 3 || alpha === "") throw new Error(`Unparsable colour: ${value}`);
  return { channels, alpha };
}

function encodeSrgb(linear: number): number {
  const x = clamp(linear, 0, 1);
  return (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255;
}

/** OKLab to gamma-encoded sRGB (Björn Ottosson's published matrices), clamped to the sRGB gamut. */
function oklabToSrgb(lightness: number, a: number, b: number): [number, number, number] {
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    encodeSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encodeSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encodeSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * Parses the colour forms a computed style can return here: `transparent`, `rgb()`/`rgba()` in legacy comma
 * or modern space syntax, `oklab()`, `oklch()` and `color(srgb …)`, plus hex for hand-written fixtures.
 * Anything else throws rather than being read as a guess.
 */
export function parseCssColor(input: string): Rgba {
  const value = input.trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, alpha: 0 };

  const hex = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((digit) => digit + digit) : hex[1].match(/../g)!;
    const [r, g, b, a = "ff"] = digits;
    return { r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16), alpha: parseInt(a, 16) / 255 };
  }

  const fn = value.match(/^([a-z-]+)\((.*)\)$/);
  if (!fn) throw new Error(`Unparsable colour: ${input}`);
  const [, name, body] = fn;

  if (name === "rgb" || name === "rgba") {
    const { channels, alpha } = argumentsOf(body, input);
    const [r, g, b] = channels.map((token) => clamp(channel(token, input, 255), 0, 255));
    return { r, g, b, alpha: alphaOf(alpha, input) };
  }
  if (name === "oklab") {
    const { channels, alpha } = argumentsOf(body, input);
    if (body.includes(",")) throw new Error(`Unparsable colour: ${input}`);
    const [l, a, b] = [channel(channels[0], input, 1), channel(channels[1], input, 0.4), channel(channels[2], input, 0.4)];
    const [r, g, bl] = oklabToSrgb(l, a, b);
    return { r, g, b: bl, alpha: alphaOf(alpha, input) };
  }
  if (name === "oklch") {
    const { channels, alpha } = argumentsOf(body, input);
    if (body.includes(",")) throw new Error(`Unparsable colour: ${input}`);
    const l = channel(channels[0], input, 1);
    const chroma = channel(channels[1], input, 0.4);
    const hue = (number(channels[2].replace(/deg$/, ""), input) * Math.PI) / 180;
    const [r, g, b] = oklabToSrgb(l, chroma * Math.cos(hue), chroma * Math.sin(hue));
    return { r, g, b, alpha: alphaOf(alpha, input) };
  }
  if (name === "color") {
    const match = body.trim().match(/^srgb\s+(.*)$/);
    if (!match) throw new Error(`Unsupported colour space: ${input}`);
    const { channels, alpha } = argumentsOf(match[1], input);
    if (match[1].includes(",")) throw new Error(`Unparsable colour: ${input}`);
    const [r, g, b] = channels.map((token) => clamp(channel(token, input, 1), 0, 1) * 255);
    return { r, g, b, alpha: alphaOf(alpha, input) };
  }
  throw new Error(`Unsupported colour function: ${input}`);
}

/** Source-over: `top` painted on `bottom`, both gamma-encoded sRGB. */
export function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
  if (alpha === 0) return { r: 0, g: 0, b: 0, alpha: 0 };
  const mix = (t: number, b: number) => (t * top.alpha + b * bottom.alpha * (1 - top.alpha)) / alpha;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), alpha };
}

/**
 * Flattens background layers listed innermost (painted last) first. Layers beneath the first opaque one are
 * hidden and ignored. With no opaque layer the backdrop is unknown, so this throws instead of assuming one.
 */
export function flattenBackground(layers: string[]): Rgba {
  const parsed = layers.map(parseCssColor);
  const base = parsed.findIndex((layer) => layer.alpha >= 1);
  if (base < 0) throw new Error(`No opaque backing colour beneath: ${JSON.stringify(layers)}`);
  return parsed.slice(0, base).reduceRight((under, layer) => compositeOver(layer, under), parsed[base]);
}

/** Contrast of a possibly translucent text colour over possibly translucent, nested background layers. */
export function layeredContrast(color: string, backgrounds: string[]) {
  const background = flattenBackground(backgrounds);
  const foreground = compositeOver(parseCssColor(color), background);
  const fg = [foreground.r, foreground.g, foreground.b];
  const bg = [background.r, background.g, background.b];
  return { foreground: fg, background: bg, ratio: contrastRatio(fg, bg) };
}
