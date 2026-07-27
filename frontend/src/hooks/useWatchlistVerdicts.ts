import { useQueries, useQuery } from "@tanstack/react-query";

import { getStockAnalysis } from "../services/analysis";
import { getWatchlist } from "../services/watchlist";
import type { AnalysisData } from "../types/analysis";

/*
  Each analysis is a full backend pipeline run, so the dashboard
  caps how many watchlist symbols it analyzes at once.
*/
export const WATCHLIST_ANALYSIS_LIMIT = 4;

const DASHBOARD_STALE_TIME_MS = 60 * 1000;

export interface WatchlistVerdict {
  symbol: string;
  isLoading: boolean;
  isError: boolean;
  data: AnalysisData | null;
}

export function useWatchlistVerdicts(limit = WATCHLIST_ANALYSIS_LIMIT) {
  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: getWatchlist,
    staleTime: DASHBOARD_STALE_TIME_MS,
  });

  const symbols = (watchlistQuery.data ?? [])
    .map((item) => item.symbol.trim().toUpperCase())
    .slice(0, limit);

  /*
    The query key matches useAnalysis, so dashboard panels and the
    analysis page share one cached result per symbol.
  */
  const analysisQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["analysis", symbol],
      queryFn: () => getStockAnalysis(symbol),
      staleTime: DASHBOARD_STALE_TIME_MS,
    })),
  });

  const verdicts: WatchlistVerdict[] = symbols.map((symbol, index) => ({
    symbol,
    isLoading: analysisQueries[index]?.isLoading ?? true,
    isError: analysisQueries[index]?.isError ?? false,
    data: analysisQueries[index]?.data ?? null,
  }));

  return { watchlistQuery, verdicts };
}
