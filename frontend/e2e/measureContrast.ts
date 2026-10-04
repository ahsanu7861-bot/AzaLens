import type { Locator } from "@playwright/test";

import { layeredContrast, parseCssColor } from "./contrast";

/*
 * Browser-side contrast measurement shared by the accessibility specs. Moved verbatim from
 * settings-accessibility.spec.ts so a second spec can measure controls the same way; only `export` was added.
 */

/**
 * Reads an element's resolved text colour and the background colours of it and every ancestor (innermost
 * first), then composites them. Effects the compositing does not model make it throw instead of guessing.
 */
export async function measure(target: Locator) {
  const shape = await target.evaluate((element) => {
    const layers: { background: string; image: string; opacity: string; filter: string; blend: string }[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      layers.push({
        background: style.backgroundColor,
        image: style.backgroundImage,
        opacity: style.opacity,
        filter: style.filter,
        blend: style.mixBlendMode,
      });
    }
    return {
      tag: element.tagName,
      type: element.getAttribute("type"),
      hasBgBrand: element.classList.contains("bg-brand"),
      nestedInteractive: element.querySelectorAll("a,button,input,select,textarea,[tabindex]").length,
      insideAnchor: Boolean(element.closest("a")),
      color: getComputedStyle(element).color,
      layers,
    };
  });
  const { layers, ...rest } = shape;
  const base = layers.findIndex((layer) => parseCssColor(layer.background).alpha >= 1);
  const unmodelled = layers.filter(
    (layer, index) =>
      layer.opacity !== "1" ||
      layer.filter !== "none" ||
      layer.blend !== "normal" ||
      (index <= base && layer.image !== "none"),
  );
  if (base < 0 || unmodelled.length) {
    throw new Error(`Cannot composite ${JSON.stringify(layers)}`);
  }
  const backgrounds = layers.slice(0, base + 1).map((layer) => layer.background);
  const painted = backgrounds.filter((layer) => parseCssColor(layer).alpha > 0);
  const { background, ratio } = layeredContrast(shape.color, backgrounds);
  return {
    ...rest,
    layers: painted,
    background: `rgb(${background.map((channel) => Number(channel.toFixed(3))).join(", ")})`,
    ratio,
  };
}
