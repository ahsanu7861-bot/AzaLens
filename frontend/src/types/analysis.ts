import type { DataFreshnessStatus, ThesisInvalidation } from "./overview"

export type ShariahStatus =
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "UNKNOWN"
  | string

export interface ShariahMethodologyResult {
  id?: string | null
  name?: string | null
  status?: ShariahStatus
  isCompliant?: boolean | null
  verified?: boolean | null
  disposition?: string | null
  basis?: string | null
  alternateBasis?: unknown
  basesDisagree?: boolean | null
  reason?: string | null
}

export interface ShariahComplianceData {
  success?: boolean
  symbol?: string | null
  summary?: {
    headline?: string | null
    status?: ShariahStatus
    confidence?: string | number
    methodologyId?: string
    methodologyName?: string
    explanation?: string | null
    purificationRatePercent?: number | null
    purificationRateFormatted?: string | null
  }
  primaryMethodology?: ShariahMethodologyResult
  methodologies?: {
    primary?: string
    results?: Record<string, ShariahMethodologyResult>
  }
  businessActivity?: {
    status?: string
    passed?: boolean | null
    reason?: string | null
    revenueRatios?: {
      impermissibleFormatted?: string | null
      interestIncomeFormatted?: string | null
      combinedImpureFormatted?: string | null
    } | null
  }
  financialScreen?: {
    status?: string
    passed?: boolean | null
    ratios?: {
      debtToAssetsFormatted?: string | null
      cashToAssetsFormatted?: string | null
      receivablesToAssetsFormatted?: string | null
      interestIncomeToRevenueFormatted?: string | null
      debtToMarketCapFormatted?: string | null
    }
  }
  verification?: {
    lastCheckedAt?: string | null
    isStale?: boolean | null
    dataQuality?: unknown
  } | null
  provider?: {
    id?: string | null
    name?: string | null
  } | null
}

export interface PriceZone {
  low?: number
  high?: number
  center?: number
  width?: number
  widthPercent?: number
}

export interface StructureReference {
  zone?: PriceZone | null
  distancePercent?: number
  role?: string
  classification?: string
  score?: number
  strengthScore?: number
  sourceCount?: number
  sources?: string[]
  nearCurrentPrice?: boolean
}

export interface MarketStructureData {
  provider?: string
  supportResistance?: {
    success?: boolean
    status?: "COMPLETE" | "PARTIAL" | "UNAVAILABLE"
    partialSuccess?: boolean
    provider?: string
    currentPrice?: number
    nearestSupport?: StructureReference | null
    nearestResistance?: StructureReference | null
    statistics?: {
      receivedBars?: number
      barsAnalyzed?: number
      droppedBars?: number
      rawPivotCount?: number
      totalZones?: number
      supportZonesBelowPrice?: number
      resistanceZonesAbovePrice?: number
    }
    evidence?: {
      status?: "COMPLETE" | "PARTIAL" | "UNAVAILABLE"
      coveragePercent?: number
      required?: string[]
      missing?: string[]
    }
    pricePosition?: {
      insideZone?: boolean
    }
    warnings?: string[]
    dataSource?: string
    methodology?: {
      pivotWindow?: number
      mergeThresholdPercent?: number
    }
  }
}

export interface ConfluenceData {
  success?: boolean
  provider?: string
  currentPrice?: number
  strongestZone?: StructureReference | null
  actionableZone?: StructureReference | null
  nearestSupport?: StructureReference | null
  nearestResistance?: StructureReference | null
  zones?: StructureReference[]
  methodology?: {
    actionableDistancePercent?: number
    minimumActionableSourceCount?: number
    minimumActionableScore?: number
  }
  warnings?: string[]
  dataSource?: string
}

export interface FundamentalsData {
  success?: boolean
  status?: "PARTIAL" | "UNAVAILABLE" | string
  provider?: string | null
  asOf?: string | null
  companyProfile?: {
    name?: string | null
    ticker?: string | null
    country?: string | null
    currency?: string | null
    exchange?: string | null
    industry?: string | null
    ipoDate?: string | null
    website?: string | null
    logo?: string | null
  } | null
  coverage?: {
    companyProfile?: string
    financialStatements?: string
    valuationAndPeers?: string
    earningsAndEstimates?: string
    filingsAndOwnership?: string
  }
  unavailableSections?: string[]
  limitations?: string[]
}

/*
 * The seven `evidenceState` values the backend can put on the wire.
 *
 * This is a deliberate, independent mirror of the canonical declaration in
 * `backend/analysis/agreement/agreementEngine.js`. The frontend cannot import
 * that module - it is CommonJS, server-only, and outside the Vite build - so the
 * strings are declared twice by necessity, not by oversight. What keeps them
 * honest is that both sides pin the same literals in their own test suite:
 * `backend/tests/testEvidenceAgreementContract.js` and
 * `VerdictCard.test.tsx`. A change on either side without the other fails there.
 *
 * These are wire values, not display copy. The UI renders them verbatim; it never
 * translates, prettifies or infers one. See docs/VERDICT_CONTRACT.md §2.1.
 */
export const EVIDENCE_STATES = [
  "Evidence unavailable",
  "Insufficient evidence",
  "No directional evidence",
  "Conflicting evidence",
  "Limited evidence",
  "Low agreement",
  "Moderate agreement",
  "High agreement",
] as const

export type EvidenceState = (typeof EVIDENCE_STATES)[number]

/* The four independent evidence families. The denominator is always four. */
export const EVIDENCE_FAMILY_IDS = [
  "trendPosition",
  "momentum",
  "priceAction",
  "volumeFlow",
] as const

export type EvidenceFamilyId = (typeof EVIDENCE_FAMILY_IDS)[number]
export type FamilyVote = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNAVAILABLE"

export const EXPECTED_EVIDENCE_FAMILIES = 4

export interface EvidenceFamilyMember {
  name: string
  vote: FamilyVote | (string & {})
}

export interface EvidenceFamily {
  id: EvidenceFamilyId | (string & {})
  label: string
  vote: FamilyVote | (string & {})
  members: EvidenceFamilyMember[]
}

/*
 * How many independent families back the dominant lean. This is a count, not a
 * score: it is not a probability, not predicted accuracy, not a performance
 * guarantee and not an empirically calibrated confidence value.
 */
export interface DirectionalSupport {
  direction: "BULLISH" | "BEARISH" | null
  supportingFamilies: number
  opposingFamilies: number
  neutralFamilies: number
}

/* How much of the expected evidence base was usable. The denominator never shrinks. */
export interface EvidenceCoverage {
  usableFamilies: number
  expectedFamilies: number
  unavailableFamilies: number
  families: EvidenceFamily[]
}

export interface EvidenceAgreement {
  state: EvidenceState | (string & {})
  support: DirectionalSupport
  coverage: EvidenceCoverage
  summary: string
}

export interface GuidanceRisk {
  level: string | null
  score: number | null
  volatility: string | null
  summary: string | null
  notes: string[]
}

export interface HistoricalBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HistoryResponse {
  success: boolean
  symbol: string
  interval: string
  bars?: HistoricalBar[]
  error?: string
  /*
   * Provenance as the backend actually sends it.
   *
   * `GET /history/:symbol` returns `marketEngine.getHistory` verbatim
   * (`backend/server.js`), and that record carries a provider LABEL - "TwelveData"
   * or "Finnhub" - stamped by the adapter that produced the bars.
   *
   * Optional because the field is read, never assumed: a response without it must
   * yield no provider at all. The frontend must never substitute a default, and
   * must never derive the provider from HISTORY_PROVIDER, the source defaults, the
   * environment, the symbol or the endpoint name. History defaults to Twelve Data
   * today; inferring "TwelveData" from that fact would be a fabricated claim about
   * where the data came from, and would keep asserting it after the selector moved.
   */
  provider?: string
}

export interface AnalysisResponse {
  success?: boolean
  error?: string
  data: {
    metadata?: DataFreshnessStatus
    thesisInvalidation?: ThesisInvalidation
    guidance?: {
      contractVersion: "1.0" | string
      symbol: string
      asOf: string
      horizon: string
      shariah: {
        status: ShariahStatus
        verdictPermitted: boolean
        reason?: string | null
      }
      verdict: {
        state: "FAVORED" | "NEUTRAL" | "CONFLICTING" | "LIMITED_EVIDENCE" | "UNAVAILABLE" | "WITHHELD" | string
        direction: "BULLISH" | "BEARISH" | null
      }
      /*
       * Canonical public verdict wording. The backend owns this string; the UI
       * renders it verbatim and never rebuilds it. See docs/VERDICT_CONTRACT.md.
       */
      publicLabel: string
      evidenceAgreement: EvidenceAgreement | null
      currentSituation: string
      supportingEvidence: Array<{ source: string; statement: string }>
      opposingEvidence: Array<{ source: string; statement: string }>
      meaning: string
      nextObservation: string
      confirmations: string[]
      invalidation: ThesisInvalidation | null
      risk: GuidanceRisk | null
      freshness: unknown
      limitations: string[]
      allowedNextStep: string
    }
    market: {
      success?: boolean
      provider?: string
      symbol?: string
      data?: {
        symbol?: string
        company?: string
        exchange?: string
        currency?: string
        price?: number
        previousClose?: number
        open?: number
        high?: number
        low?: number
        change?: number
        changePercent?: number
        timestamp?: number
      }
    }

    priceContext?: {
      livePrice?: number | null
      latestHistoricalClose?: number | null
      livePriceAvailable?: boolean
      historicalCloseAvailable?: boolean
      pricesMatch?: boolean
      analysisPrice?: number | null
      analysisPriceSource?: string
      note?: string
    }

    fundamentals?: FundamentalsData

    /*
      The backend withholds trend, agreement, and explanation
      unless Shariah compliance is CONFIRMED. When withheld,
      these sections arrive as stubs with withheld: true and
      the directional fields absent.
    */
    complianceGate?: {
      status?: "UNLOCKED" | "WITHHELD" | string
      unlocked?: boolean
      requiredStatus?: string
      shariahStatus?: ShariahStatus
      staleEvidence?: boolean
      reason?: string | null
      message?: string | null
    }

    trend: {
      success?: boolean
      withheld?: boolean
      reason?: string | null
      error?: string | null
      trend?: string
      score?: number | null
      status?: "COMPLETE" | "PARTIAL" | "UNAVAILABLE"
      provider?: string
      details?: string[]
      evidence?: {
        directionalAvailable: number
        directionalRequired: number
        directionalTotal: number
        coveragePercent: number
        missing: string[]
        adxAvailable: boolean
      }
      warning?: string | null
    }

    agreement: {
      success?: boolean
      withheld?: boolean
      reason?: string | null
      error?: string | null
      provider?: string
      symbol?: string
      evidenceState?: EvidenceState | (string & {})
      support?: DirectionalSupport
      coverage?: EvidenceCoverage
      summary?: string
      expectedIndicators?: number
      availableIndicators?: number
      agreement?: string
      direction?: string
      agreementSummary?: string
      agreementDetails?: string[]
      bullishSignals?: number
      bearishSignals?: number
      neutralSignals?: number
      bullish?: string[]
      bearish?: string[]
      neutral?: string[]
      totalIndicators?: number
      unavailableIndicators?: string[]
    }

    indicators: {
      rsi: {
        success?: boolean
        provider?: string
        symbol?: string
        rsi?: number
        signal?: string
        dataSource?: string
      }

      ema: {
        success?: boolean
        provider?: string
        symbol?: string
        ema20?: number
        currentPrice?: number
        signal?: string
        dataSource?: string
      }

      sma: {
        success?: boolean
        provider?: string
        symbol?: string
        sma50?: number
        currentPrice?: number
        signal?: string
        dataSource?: string
      }

      macd: {
        success?: boolean
        provider?: string
        symbol?: string
        macd?: number
        signalLine?: number
        histogram?: number
        signal?: string
        dataSource?: string
      }

      bollinger?: {
        success?: boolean
        provider?: string
        symbol?: string
        upperBand?: number
        middleBand?: number
        lowerBand?: number
        currentPrice?: number
        signal?: string
        dataSource?: string
      }

      adx: {
        success?: boolean
        provider?: string
        symbol?: string
        adx?: number
        plusDI?: number
        minusDI?: number
        signal?: string
        dataSource?: string
      }

      atr: {
        success?: boolean
        provider?: string
        symbol?: string
        atr?: number
        signal?: string
        dataSource?: string
      }

      obv: {
        success?: boolean
        provider?: string
        symbol?: string
        obv?: number
        signal?: string
        explanation?: string
        dataSource?: string
      }

      rvol: {
        success?: boolean
        provider?: string
        symbol?: string
        todayVolume?: number
        averageVolume30?: number
        rvol?: number
        signal?: string
        explanation?: string
        dataSource?: string
        session?: {
          status?: "OPEN" | "CLOSED" | "UNKNOWN" | string
          exchange?: string | null
          timezone?: string | null
          latestBarDate?: string | null
          exchangeLocalDate?: string | null
          exchangeLocalTime?: string | null
          reason?: string | null
        }
      }

      volumeSpike?: {
        success?: boolean
        provider?: string
        symbol?: string
        todayVolume?: number
        averageVolume30?: number
        rvol?: number
        volumeSpikeDetected?: boolean
        level?: string
        signal?: string
        explanation?: string
        dataSource?: string
      }

      candlestick?: {
        success?: boolean
        provider?: string
        symbol?: string
        pattern?: string
        bias?: string
        strength?: number
        lastCandle?: {
          open?: number
          high?: number
          low?: number
          close?: number
        }
        dataSource?: string
      }
    }

    marketStructure?: MarketStructureData

    confluence: ConfluenceData

    explanation: {
      success?: boolean
      withheld?: boolean
      reason?: string | null
      error?: string | null
      overallAssessment?: string
    }

    risk: {
      success?: boolean
      symbol?: string
      riskLevel?: string
      riskScore?: number
      volatility?: string
      currentPrice?: number | null
      atr?: number | null
      atrPercent?: number | null
      referenceDistances?: {
        tight?: {
          atrMultiplier?: number | null
          distance?: number | null
          percent?: number | null
        }
        standard?: {
          atrMultiplier?: number | null
          distance?: number | null
          percent?: number | null
        }
        wide?: {
          atrMultiplier?: number | null
          distance?: number | null
          percent?: number | null
        }
      }
      priceReferenceLevels?: {
        currentPrice?: number | null
        belowCurrentPrice?: {
          tight?: number | null
          standard?: number | null
          wide?: number | null
        }
        aboveCurrentPrice?: {
          tight?: number | null
          standard?: number | null
          wide?: number | null
        }
      }
      riskSummary?: string
      riskNotes?: string[]
      supportiveFactors?: string[]
      disclaimer?: string
    }

    shariah: ShariahComplianceData
  }
}

export type AnalysisData = AnalysisResponse["data"]
