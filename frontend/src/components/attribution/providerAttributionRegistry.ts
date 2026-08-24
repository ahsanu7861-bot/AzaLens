/*
 * Provider attribution: identity, registry and resolution.
 *
 * B7a. Nothing here is mounted by any production surface - B7b owns that - so
 * this module renders nothing and is reachable only from its own tests.
 *
 * The one job is turning an untrusted provenance string into a closed, evidence
 * backed identity. B7-0's readHistoryProvider deliberately returns whatever the
 * backend said, verbatim, so that the decision about what that string MEANS
 * happens exactly once, here, against a verified contract.
 */

/*
 * ==========================================================================
 * Provider identity
 * ==========================================================================
 *
 * Only providers whose exact attribution wording has been retrieved from the
 * provider's own published guidelines belong in this union. Membership is the
 * renderability guarantee: a provider that is not a member has no registry key,
 * so "a provider we may not attribute yet" is unrepresentable rather than
 * merely discouraged.
 */
export const ATTRIBUTION_PROVIDER_IDS = ['twelve_data'] as const;

export type AttributionProviderId =
  (typeof ATTRIBUTION_PROVIDER_IDS)[number];

/*
 * Providers with a known attribution requirement whose exact wording has NOT
 * been retrieved.
 *
 * This is a type-level declaration and nothing else. It carries no text, no
 * href and no renderable object, and it shares no type with
 * AttributionProviderId, so no code path can turn a member of this list into
 * something the component will render.
 *
 * Halal Terminal stated on 10 August 2026 that its attribution line must appear
 * wherever screening results are displayed. That exact line is not available to
 * this repository and must not be guessed, paraphrased, or substituted with
 * Twelve Data's wording or a generic "data provider" phrase. Recording the
 * blockage without recording a string is the point: a runtime slot for it would
 * be an invitation to fill it in, and filling it in would ship invented text
 * with no type error to stop it.
 */
export const ATTRIBUTION_BLOCKED_PROVIDER_IDS = ['halal_terminal'] as const;

export type BlockedAttributionProviderId =
  (typeof ATTRIBUTION_BLOCKED_PROVIDER_IDS)[number];

/*
 * ==========================================================================
 * Normalization
 * ==========================================================================
 *
 * The exact labels the backend actually emits, and nothing else.
 *
 * backend/providers/marketDataProvider.js maps twelve_data -> "TwelveData" and
 * finnhub -> "Finnhub" through a frozen PROVIDER_LABELS object, and adapters
 * stamp that label onto the record that produced the data. So "TwelveData" is a
 * verified contract value; "twelvedata", "Twelve Data" and "twelve_data" are
 * not, and accepting them would mean claiming Twelve Data as the source of data
 * whose label no contract produces. That is the same fabrication B7-0 exists to
 * prevent, one layer higher up.
 *
 * A Map rather than an object literal: object-property indexing would resolve
 * "constructor", "__proto__", "toString" and friends to inherited values, and a
 * provenance string arrives from the network. A Map has no prototype chain to
 * walk, so an unsafe key is simply a miss.
 */
const BACKEND_PROVIDER_LABELS: ReadonlyMap<string, AttributionProviderId> =
  new Map([['TwelveData', 'twelve_data' as AttributionProviderId]]);

/*
 * Exact means exact. A value is not trimmed into validity here: the verified
 * contract emits "TwelveData" with no surrounding whitespace, so " TwelveData "
 * is a string no adapter produced, and quietly accepting it would widen the
 * contract on a guess. B7-0 already trims the response value before it ever
 * reaches this module, so a legitimate label arrives clean.
 */
export function normalizeAttributionProvider(
  rawProvider: unknown,
): AttributionProviderId | null {
  if (typeof rawProvider !== 'string') {
    return null;
  }

  return BACKEND_PROVIDER_LABELS.get(rawProvider) ?? null;
}

/*
 * ==========================================================================
 * Registry
 * ==========================================================================
 */
export type ProviderAttributionDefinition = {
  readonly providerId: AttributionProviderId;
  readonly text: string;
  readonly href: string;
  readonly evidence: string;
};

/*
 * Twelve Data's attribution guidelines require the text and a dofollow link to
 * twelvedata.com. Ahsan selected the primary approved phrase on 2026-08-25:
 * one stored phrase, no compact variant, no variant mechanism, text only, no
 * logo. The guidelines make the logo optional and publish no minimum size or
 * clear-space rule, so text avoids inventing requirements the provider does not
 * state.
 *
 * `readonly` is a compile-time claim only - it disappears at runtime, and a
 * plain JavaScript caller could still assign through it. Object.freeze makes
 * the immutability real, on the definition as well as the outer record, because
 * freezing only the outer object would leave every field writable.
 */
const TWELVE_DATA_ATTRIBUTION: ProviderAttributionDefinition = Object.freeze({
  providerId: 'twelve_data',
  text: 'Data provided by Twelve Data',
  href: 'https://twelvedata.com',
  evidence:
    'https://support.twelvedata.com/en/articles/12647398-attribution-guidelines-for-using-twelve-data',
});

/*
 * A complete Record over the id union, not a Partial: the compiler then proves
 * every renderable provider has a definition, and a lookup needs no undefined
 * branch that someone could fill with a fallback.
 */
export const PROVIDER_ATTRIBUTION: Readonly<
  Record<AttributionProviderId, ProviderAttributionDefinition>
> = Object.freeze({
  twelve_data: TWELVE_DATA_ATTRIBUTION,
});

/*
 * ==========================================================================
 * Resolution
 * ==========================================================================
 *
 * Three states, kept distinct on purpose.
 *
 * "absent" means the response declared no provider. "unrecognized" means it
 * declared one this frontend does not know - a genuinely interesting signal,
 * because it means the backend emitted a label the contract here has not been
 * taught. Collapsing both into null would render identically today and throw
 * away the only evidence that the two situations differ.
 *
 * The raw string rides along on "unrecognized" for B7b's judgement. It is a
 * provider label, not user data, and it never becomes a registry key: the Map
 * above is the only door into the union.
 *
 * Pure by construction. No metric, no console, no I/O. B7b owns mounting, so
 * B7b owns effect timing and any future telemetry; emitting from here would
 * mean a side effect during render, firing twice under StrictMode and again on
 * every rerender, into a sink the frontend does not currently have.
 */
export type AttributionResolution =
  | {
      readonly status: 'resolved';
      readonly definition: ProviderAttributionDefinition;
    }
  | { readonly status: 'absent' }
  | { readonly status: 'unrecognized'; readonly rawProvider: string };

const ABSENT: AttributionResolution = Object.freeze({ status: 'absent' });

export function resolveProviderAttribution(
  rawProvider: unknown,
): AttributionResolution {
  if (typeof rawProvider !== 'string' || rawProvider.trim().length === 0) {
    return ABSENT;
  }

  const providerId = normalizeAttributionProvider(rawProvider);

  if (providerId === null) {
    return Object.freeze({
      status: 'unrecognized',
      rawProvider,
    });
  }

  return Object.freeze({
    status: 'resolved',
    definition: PROVIDER_ATTRIBUTION[providerId],
  });
}
