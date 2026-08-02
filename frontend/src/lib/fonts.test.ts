import { describe, expect, it } from "vitest";

import { activateDeferredFonts } from "./fonts";

/*
  These cover the behaviour that replaced onload="this.media='all'". If the
  attribute contract between index.html and fonts.ts ever drifts, the site
  silently renders in fallback fonts with no error anywhere — so the contract
  is asserted rather than assumed.
*/

function makeDocument(html: string): Document {
  return new DOMParser().parseFromString(
    `<html><head>${html}</head><body></body></html>`,
    "text/html",
  );
}

describe("activateDeferredFonts", () => {
  it("flips a deferred font stylesheet from print to all", () => {
    const doc = makeDocument(
      '<link data-deferred-font rel="stylesheet" media="print" href="https://fonts.googleapis.com/css2?family=Inter">',
    );

    expect(activateDeferredFonts(doc)).toBe(1);
    expect(doc.querySelector("link")?.media).toBe("all");
  });

  it("leaves stylesheets without the marker attribute alone", () => {
    const doc = makeDocument(
      '<link rel="stylesheet" media="print" href="/print-only.css">',
    );

    expect(activateDeferredFonts(doc)).toBe(0);
    expect(doc.querySelector("link")?.media).toBe("print");
  });

  it("is safe to call when no deferred stylesheet is present", () => {
    const doc = makeDocument('<link rel="icon" href="/favicon.svg">');

    expect(() => activateDeferredFonts(doc)).not.toThrow();
    expect(activateDeferredFonts(doc)).toBe(0);
  });

  it("uses no inline event handler to do it", () => {
    const doc = makeDocument(
      '<link data-deferred-font rel="stylesheet" media="print" href="https://fonts.googleapis.com/css2?family=Inter">',
    );

    activateDeferredFonts(doc);

    expect(doc.head.innerHTML).not.toMatch(/\son[a-z]+\s*=/i);
  });
});
