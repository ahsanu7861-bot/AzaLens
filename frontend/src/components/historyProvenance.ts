import type { HistoricalBar, HistoryResponse } from '../types/analysis';

/*
 * Bars and their provenance move together or not at all.
 *
 * Two useState calls would let a render observe one provider with another
 * response's bars - briefly after a symbol change, or permanently if an error
 * path cleared one and forgot the other. Making them a single value removes the
 * mismatch by construction rather than by remembering to clear both.
 *
 * This lives outside StockChart.tsx so that file keeps a component-only export
 * surface: oxlint's react/only-export-components warns when a component module
 * also exports constants or functions, and the shared logic is genuinely not a
 * component.
 */
export type HistoryProvenance = {
  bars: HistoricalBar[];
  provider: string | null;
};

export const EMPTY_HISTORY: HistoryProvenance = {
  bars: [],
  provider: null,
};

/*
 * Read the provider the response actually declared. No default, no fallback, no
 * inference.
 *
 * A missing, blank or non-string value yields null. An unrecognised label is
 * preserved exactly as received, for a later registry to interpret - normalising
 * it here would destroy the only evidence of what the backend actually said, and
 * mapping it to the configured provider would manufacture provenance.
 *
 * History defaults to Twelve Data in backend/providers/marketDataProvider.js.
 * That fact must never reach this function: deriving a provider from the
 * default, the environment, the symbol or the endpoint name would keep asserting
 * an origin after the selector moved.
 */
export function readHistoryProvider(
  result: Pick<HistoryResponse, 'provider'>,
): string | null {
  const provider = result.provider;

  if (typeof provider !== 'string') {
    return null;
  }

  const trimmed = provider.trim();

  return trimmed.length > 0 ? trimmed : null;
}
