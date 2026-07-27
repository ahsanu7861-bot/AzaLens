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

export interface AnalysisResponse {
  success?: boolean
  error?: string
  data: {
    metadata?: DataFreshnessStatus
    thesisInvalidation?: ThesisInvalidation
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
      confidence?: number
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
      agreementConfidence?: number | null
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
