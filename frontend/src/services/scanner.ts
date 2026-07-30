import { api } from "./api";

export type ScannerObservation = {
  id: string;
  label: string;
  detail: string;
  tone: "neutral" | "attention" | "positive" | "critical";
};

export type ScannerResult = {
  symbol: string;
  status: "COMPLETE" | "UNAVAILABLE";
  asOf?: string | null;
  message?: string;
  metrics?: {
    close?: number | null;
    dailyChangePercent?: number | null;
    relativeVolume?: number | null;
    rsi14?: number | null;
    sma20?: number | null;
    prior20High?: number | null;
    prior20Low?: number | null;
  };
  observations: ScannerObservation[];
};

export type ScannerRun = {
  generatedAt: string;
  universe: "WATCHLIST_SELECTION";
  symbolsTouched: number;
  universeLimit: number;
  providerCallsPlanned: number;
  shariahCalls: 0;
  methodology: string;
  disclaimer: string;
  results: ScannerResult[];
};

type ScannerResponse = {
  success?: boolean;
  message?: string;
  data?: ScannerRun;
};

export async function runWatchlistScan(
  symbols: string[],
): Promise<ScannerRun> {
  const response = await api.post<ScannerResponse>("/api/scanner", {
    symbols,
  });

  if (response.data?.success !== true || !response.data.data) {
    throw new Error(response.data?.message || "Unable to run scanner.");
  }

  return response.data.data;
}
