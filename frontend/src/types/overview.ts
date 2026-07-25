import type { LucideIcon } from "lucide-react";

export type DataFreshnessState =
  | "realtime"
  | "delayed"
  | "cached"
  | "fallback"
  | "stale"
  | "unavailable";

export interface EvidenceSourceStatus {
  provider?: string | null;
  state: string;
  asOf?: string | number | Date | null;
  delayMinutes?: number | null;
  interval?: string | null;
  methodology?: string | null;
  fromCache?: boolean;
  reviewRequired?: boolean;
  error?: string | null;
}

export interface DataFreshnessStatus {
  state: DataFreshnessState;
  asOf: string | number | Date;
  delayMinutes?: number | null;
  marketSource?: string | null;
  filingSource?: string | null;
  reviewRequired?: boolean;
  contractVersion?: string;
  symbol?: string;
  generatedAt?: string | null;
  analysisTimeframe?: string | null;
  cacheStatus?: {
    quote?: string | null;
    history?: string | null;
    shariah?: string | null;
  };
  methodologyVersions?: {
    technical?: string | null;
    shariah?: string | null;
  };
  evidenceCompleteness?: {
    available?: number;
    total?: number;
    percent?: number;
    status?: "complete" | "partial" | "unavailable" | string;
  };
  sources?: {
    quote?: EvidenceSourceStatus;
    history?: EvidenceSourceStatus;
    shariah?: EvidenceSourceStatus;
  };
  providerErrors?: string[];
  knownLimitations?: string[];
}

export type ThesisInvalidationStatus = "intact" | "violated" | "unknown";

export interface ThesisInvalidation {
  technical?: string | null;
  fundamental?: string | null;
  status: ThesisInvalidationStatus;
  evaluatedAt?: string | number | Date | null;
  methodologyVersion?: string | null;
  evidence?: {
    technical?: {
      status?: ThesisInvalidationStatus;
      rule?: string | null;
      triggerPrice?: number | null;
      observedValue?: number | null;
      relativeVolume?: number | null;
      evidence?: string | null;
    };
    fundamental?: {
      status?: ThesisInvalidationStatus;
      rule?: string | null;
      debtToAssets?: number | null;
      impermissibleIncome?: number | null;
      evidence?: string | null;
    };
  };
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
