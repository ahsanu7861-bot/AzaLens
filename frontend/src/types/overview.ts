import type { LucideIcon } from "lucide-react";

export type DataFreshnessState = "realtime" | "delayed" | "cached" | "fallback";

export interface DataFreshnessStatus {
  state: DataFreshnessState;
  asOf: string | number | Date;
  delayMinutes?: number | null;
  marketSource?: string | null;
  filingSource?: string | null;
  reviewRequired?: boolean;
}

export type ThesisInvalidationStatus = "intact" | "violated" | "unknown";

export interface ThesisInvalidation {
  technical?: string | null;
  fundamental?: string | null;
  status: ThesisInvalidationStatus;
  evaluatedAt?: string | number | Date | null;
}

export interface ProFeatureTrigger {
  id: "export-report" | "continuous-alert" | "multi-watchlist";
  label: string;
  title: string;
  description?: string;
}

export interface WorkspaceTab<TId extends string = string> {
  id: TId;
  label: string;
  icon: LucideIcon;
  ariaLabel?: string;
}
