import { api } from "./api";

export interface PortfolioHolding {
  symbol: string;
  shares: number;
  averagePrice: number;
  addedAt?: string;
  updatedAt?: string;
}

interface PortfolioResponse {
  success?: boolean;
  message?: string;
  data?: PortfolioHolding[] | PortfolioHolding;
}

function requireHolding(response: PortfolioResponse) {
  if (response.success !== true || Array.isArray(response.data) || !response.data) {
    throw new Error(response.message || "Invalid portfolio response.");
  }
  return response.data;
}

export async function getPortfolio(): Promise<PortfolioHolding[]> {
  const { data } = await api.get<PortfolioResponse>("/api/portfolio");
  if (data.success !== true || !Array.isArray(data.data)) {
    throw new Error(data.message || "Unable to load portfolio.");
  }
  return data.data;
}

export async function addHolding(input: {
  symbol: string;
  shares: number;
  averagePrice: number;
}) {
  const { data } = await api.post<PortfolioResponse>("/api/portfolio", input);
  return requireHolding(data);
}

export async function updateHolding(
  symbol: string,
  updates: { shares: number; averagePrice: number },
) {
  const { data } = await api.put<PortfolioResponse>(
    `/api/portfolio/${encodeURIComponent(symbol)}`,
    updates,
  );
  return requireHolding(data);
}

export async function removeHolding(symbol: string): Promise<PortfolioHolding[]> {
  const { data } = await api.delete<PortfolioResponse>(
    `/api/portfolio/${encodeURIComponent(symbol)}`,
  );
  if (data.success !== true || !Array.isArray(data.data)) {
    throw new Error(data.message || "Unable to remove holding.");
  }
  return data.data;
}
