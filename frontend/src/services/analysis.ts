import axios from "axios";
import { api } from "./api";
import type { AnalysisData, AnalysisResponse } from "../types/analysis";

const REQUIRED_WORKSPACES = [
  "market",
  "indicators",
  "fundamentals",
  "risk",
  "shariah",
  "explanation",
] as const satisfies ReadonlyArray<keyof AnalysisData>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCompleteWorkspaceContract(
  value: unknown,
): value is AnalysisData {
  if (!isRecord(value)) {
    return false;
  }

  return REQUIRED_WORKSPACES.every((workspace) =>
    isRecord(value[workspace]),
  );
}

export async function getStockAnalysis(
  symbol: string,
): Promise<AnalysisData> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  try {
    const response = await api.get<AnalysisResponse>(
      `/api/analyze/${encodeURIComponent(normalizedSymbol)}`,
      {
        params: {
          _t: Date.now(),
        },
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      },
    );

    if (
      response.data?.success !== true ||
      !hasCompleteWorkspaceContract(response.data?.data)
    ) {
      throw new Error(
        response.data?.error ||
          "The backend returned an invalid analysis response.",
      );
    }

    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("AzaLens analysis request failed", {
        url: error.config?.baseURL
          ? `${error.config.baseURL}${error.config.url}`
          : error.config?.url,
        status: error.response?.status,
        response: error.response?.data,
        message: error.message,
      });
    } else {
      console.error("AzaLens analysis failed", error);
    }

    throw error;
  }
}
