import { resolveProviderAttribution } from './providerAttributionRegistry';

/*
 * Text-only provider attribution.
 *
 * Naming rule for this folder: a component file and a logic file must never
 * have names that differ only by case. Default macOS APFS is case-insensitive
 * while Linux CI is case-sensitive, so `ProviderAttribution.tsx` beside a
 * `providerAttribution.ts` makes a bare `./ProviderAttribution` specifier
 * ambiguous locally - extension order picks the `.ts` module - while resolving
 * correctly on CI. That asymmetry passes CI and breaks every macOS checkout, so
 * the logic module is named `providerAttributionRegistry.ts` and the specifiers
 * here stay bare and unambiguous.
 *
 * B7b: this component now has exactly ONE authorized production importer,
 * StockChart.tsx, which renders it under the chart it attributes. That single
 * importer is enforced by the guard in providerAttributionRegistry.test.ts;
 * adding a second one fails that guard by name.
 *
 * It remains the one reviewed place where provider-required wording lives, so
 * the phrase and href cannot drift between surfaces. Callers do not supply
 * either, and must not restate them.
 *
 * The prop is the raw provenance value, exactly as the response declared it.
 * That is deliberate and is the whole ownership argument: a caller holding a
 * resolved definition could construct one, and a caller holding a canonical id
 * could name it from a default. Passing the raw string through is the only
 * shape in which a caller cannot express a claim the backend never made. B7b
 * will pass history.provider from B7-0 state, which is the verified value.
 *
 * There is no text, href, children, definition or variant prop. Provider
 * required wording is the component's to own, not the caller's to supply.
 */
type ProviderAttributionProps = {
  /**
   * The provider value exactly as the history response declared it, or null
   * when it declared none. `undefined` is accepted as absent for the same
   * reason `null` is - an optional field that was never sent is not a provider
   * - and it widens no caller control, because neither value can name a
   * provider.
   */
  provider: string | null | undefined;
};

export default function ProviderAttribution({
  provider,
}: ProviderAttributionProps) {
  const resolution = resolveProviderAttribution(provider);

  /*
   * Absent and unrecognized both render nothing. They stay distinct in the
   * resolution result for B7b rather than being collapsed here, but neither may
   * guess a provider, and an unknown label must never fall back to Twelve Data.
   */
  if (resolution.status !== 'resolved') {
    return null;
  }

  const { text, href } = resolution.definition;

  /*
   * A real anchor with a real href: a crawler has to see a link, so no click
   * handler navigation and no span.
   *
   * "Dofollow" is not an attribute to add - it is the absence of nofollow, ugc
   * and sponsored. rel="noreferrer" is a referrer and window-isolation hint,
   * not a crawl directive, so it satisfies the requirement while matching the
   * external-link convention already used in StockChart.tsx and
   * FundamentalsWorkspace.tsx.
   *
   * No aria-label: the visible text already contains the provider name, and an
   * override is how a visible and an accessible name drift apart.
   *
   * No image, SVG or logo - Ahsan selected text-only - and no styling or
   * placement wrapper, which is B7b's decision to make.
   */
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  );
}
