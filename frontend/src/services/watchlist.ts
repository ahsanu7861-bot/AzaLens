import { api } from "./api";

export interface WatchlistItem {
  symbol: string;
  addedAt?: string;
}

interface WatchlistResponse {
  success?: boolean;
  message?: string;
  data?: WatchlistItem[];
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const response = await api.get<WatchlistResponse>("/api/watchlist");

  if (
    response.data?.success !== true ||
    !Array.isArray(response.data?.data)
  ) {
    throw new Error(
      response.data?.message ||
        "The backend returned an invalid watchlist response.",
    );
  }

  return response.data.data.filter(
    (item): item is WatchlistItem =>
      typeof item?.symbol === "string" && item.symbol.trim().length > 0,
  );
}
