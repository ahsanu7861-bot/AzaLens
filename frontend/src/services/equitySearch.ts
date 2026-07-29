import { api } from "./api";

export interface EquitySearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  securityType: string;
}

interface EquitySearchResponse {
  success?: boolean;
  message?: string;
  assetClass?: string;
  data?: EquitySearchResult[];
}

export async function searchEquities(
  query: string,
): Promise<EquitySearchResult[]> {
  const response = await api.get<EquitySearchResponse>("/api/search", {
    params: { q: query },
  });
  if (
    response.data?.success !== true ||
    response.data.assetClass !== "equity" ||
    !Array.isArray(response.data.data)
  ) {
    throw new Error(response.data?.message || "Stock search failed.");
  }
  return response.data.data;
}
