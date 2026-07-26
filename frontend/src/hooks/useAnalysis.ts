import { useQuery } from "@tanstack/react-query";
import { getStockAnalysis } from "../services/analysis";

export const ANALYSIS_STALE_TIME_MS = 60_000;
export const ANALYSIS_GC_TIME_MS = 15 * 60_000;

export function useAnalysis(symbol: string) {
  return useQuery({
    queryKey: ["analysis", symbol],
    queryFn: () => getStockAnalysis(symbol),
    enabled: Boolean(symbol.trim()),
    staleTime: ANALYSIS_STALE_TIME_MS,
    gcTime: ANALYSIS_GC_TIME_MS,
  });
}
