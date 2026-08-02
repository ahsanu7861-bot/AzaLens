/*
  Deferred font activation.

  index.html ships the Google Fonts stylesheet with media="print" so it does
  not block first paint, and previously flipped it back with an inline
  onload="this.media='all'" handler. Content Security Policy blocks inline
  event handlers, and permitting them requires 'unsafe-hashes', which relaxes
  script-src for every inline handler on the site — too high a price for one
  attribute. The flip therefore happens here, in bundled code covered by
  script-src 'self'.

  The <noscript> fallback in index.html is unchanged and still serves anyone
  with JavaScript disabled.
*/

const DEFERRED_FONT_SELECTOR = 'link[data-deferred-font][media="print"]';

export function activateDeferredFonts(doc: Document = document): number {
  const links = doc.querySelectorAll<HTMLLinkElement>(DEFERRED_FONT_SELECTOR);

  for (const link of links) {
    link.media = "all";
  }

  return links.length;
}
