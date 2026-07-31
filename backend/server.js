require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const {
  getEnvironmentConfig
} = require("./config/environment");
const {
  getShariahRuntimeConfig
} = require("./config/shariahRuntime");

const {
  buildLivenessSnapshot,
  buildReadinessSnapshot,
  getMetricsSnapshot,
  isMetricsAuthorized,
  requestObservability,
  writeLog
} = require("./utils/observability");
const {
  getEstimatedBudgetSnapshot
} = require("./utils/halalTerminalBudget");

// ============================
// Import Services
// ============================

const { getMarketData, getHistory } = require("./services/marketEngine");
const { getRSI } = require("./services/rsiService");
const { getEMA } = require("./services/emaService");
const { getSMA } = require("./services/smaService");
const { getMACD } = require("./services/macdService");
const { getBollinger } = require("./services/bollingerService");
const { getATR } = require("./services/atrService");
const { getADX } = require("./services/adxService");
const { getOBV } = require("./services/obvService");
const { getRVOL } = require("./services/rvolService");
const { getVolumeSpike } = require("./services/volumeSpikeService");
const { getCandlestick } = require("./services/candlestickService");

const {
  getMasterAnalysis
} = require("./services/masterAnalysisService");

const {
  getExplanation
} = require("./services/explanationService");
const {
  searchSymbols
} = require("./providers/marketDataProvider");
const {
  middleware: closedDemoGate,
  registerClosedDemoRoutes
} = require("./middleware/closedDemoGate");
// ============================
// Routes
// ============================

const watchlistRoutes = require("./routes/watchlistRoutes");
const scannerRoutes = require("./routes/scannerRoutes");
const createPortfolioRouter = require("./routes/portfolioRoutes");
const {
  createGlobalLimiter,
  createStrictLimiter
} = require("./utils/rateLimit");

const app = express();

// Render places this service behind two trusted proxy hops (an edge
// proxy, then an internal proxy) before requests reach this process.
// Trusting exactly 3 hops means req.ip resolves to the genuine client
// address and ignores any values a client prepends to X-Forwarded-For
// itself - see backend/tests/testTrustProxy.js for the verified chain.
app.set("trust proxy", 3);

const globalLimiter = createGlobalLimiter();
const strictLimiter = createStrictLimiter();
const portfolioRoutes = createPortfolioRouter({
  intelligenceLimiter: strictLimiter
});
const PORT = process.env.PORT || 5000;
const environmentConfig =
  getEnvironmentConfig(process.env);

// ============================
// CORS Allowlist
// ============================

const CORS_PRODUCTION_ORIGINS = [
  "https://azalens.com",
  "https://www.azalens.com",
  "https://azalens.vercel.app"
];

/*
  Vercel previews for this project only. Never broadly allow
  *.vercel.app - that would let any other Vercel-hosted project
  read cross-origin responses from this API.
*/
const CORS_VERCEL_PREVIEW_ORIGIN_PATTERN =
  /^https:\/\/azalens-(?:git-[a-z0-9-]+|[a-z0-9]+)-ahsan-khan2\.vercel\.app$/i;

const CORS_DEV_ORIGIN_PATTERN =
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function isAllowedCorsOrigin(origin) {
  if (!origin) {
    // No Origin header: curl, CI, health checks, server-to-server
    // calls. Not a browser cross-origin request - nothing to check.
    return true;
  }

  if (
    CORS_PRODUCTION_ORIGINS.includes(
      origin
    )
  ) {
    return true;
  }

  if (
    CORS_VERCEL_PREVIEW_ORIGIN_PATTERN.test(
      origin
    )
  ) {
    return true;
  }

  if (
    !environmentConfig.isProduction &&
    CORS_DEV_ORIGIN_PATTERN.test(origin)
  ) {
    return true;
  }

  return false;
}

// ============================
// Middleware
// ============================

app.use(requestObservability);
app.use(express.json());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      callback(
        null,
        isAllowedCorsOrigin(origin)
      );
    }
  })
);
app.use(helmet());
app.use(
  ["/health", "/ops/metrics"],
  (req, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );
    next();
  }
);
app.use(globalLimiter);

registerClosedDemoRoutes(app);

// Protect every provider-backed/product-data route, including legacy routes.
app.use([
  "/api",
  "/stock",
  "/history",
  "/rsi",
  "/ema",
  "/sma",
  "/macd",
  "/bollinger",
  "/atr",
  "/adx",
  "/obv",
  "/rvol",
  "/volume-spike",
  "/candlestick"
], closedDemoGate);

// ============================
// API Routes
// ============================
app.use("/api/watchlist", watchlistRoutes);
if (environmentConfig.featureFlags.scanner) {
  app.use("/api/scanner", strictLimiter, scannerRoutes);
}
app.use("/api/portfolio", portfolioRoutes);
// ============================
// Home
// ============================

app.get("/", (req, res) => {
  res.json({
    project: "AzaLens",
    version: "0.1.0",
    status: "Running",
    message: "Welcome to AzaLens 🚀"
  });
});

// ============================
// Health
// ============================

app.get("/health", (req, res) => {
  const health =
    buildLivenessSnapshot();

  res.json({
    status: "Healthy",
    uptime: health.uptimeSeconds,
    timestamp: health.timestamp,
    requestId: req.requestId,
    deployment: health.deployment
  });
});

app.get("/health/live", (req, res) => {
  res.status(200).json({
    ...buildLivenessSnapshot(),
    requestId: req.requestId
  });
});

app.get("/health/ready", (req, res) => {
  const readiness =
    buildReadinessSnapshot();

  res
    .status(readiness.ready ? 200 : 503)
    .json({
      ...readiness,
      requestId: req.requestId
    });
});

app.get("/ops/metrics", (req, res) => {
  if (!isMetricsAuthorized(req)) {
    const metricsConfigured = Boolean(
      String(
        process.env
          .OBSERVABILITY_METRICS_TOKEN ||
          ""
      ).trim()
    );

    return res
      .status(metricsConfigured ? 401 : 404)
      .json({
        success: false,
        error: metricsConfigured
          ? "Metrics authentication is required."
          : "Route not found.",
        requestId: req.requestId
      });
  }

  return res.status(200).json({
    success: true,
    requestId: req.requestId,
    data: {
      ...getMetricsSnapshot(),
      halalTerminalBudget:
        getEstimatedBudgetSnapshot(
          getShariahRuntimeConfig()
        )
    }
  });
});

// ============================
// Version
// ============================

app.get("/version", (req, res) => {
  res.json({
    project: "AzaLens",
    version: environmentConfig.releaseVersion,
    environment: environmentConfig.environment,
    features: environmentConfig.featureFlags
  });
});

// ============================
// Live Quote
// ============================

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (!query || query.length > 80) {
    return res.status(400).json({
      success: false,
      message: "Enter a company name or stock symbol."
    });
  }

  try {
    const data = await searchSymbols(query);
    return res.status(200).json({
      success: true,
      message: "Listed equities retrieved successfully.",
      assetClass: "equity",
      data
    });
  } catch (error) {
    writeLog("warn", "Equity symbol search failed", {
      requestId: req.requestId,
      provider: "Finnhub",
      error: error?.message
    });
    return res.status(503).json({
      success: false,
      message: "Stock search is temporarily unavailable."
    });
  }
});

app.get("/stock/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getMarketData(symbol);

    res.json(result);
  } catch (error) {
    console.error("Live Quote Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// Historical Data
// ============================

app.get("/history/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const interval =
      req.query.interval || "1day";

    const result =
      await getHistory(
        symbol,
        interval
      );

    res.json(result);
  } catch (error) {
    console.error("Historical Data Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// RSI
// ============================

app.get("/rsi/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getRSI(symbol);

    res.json(result);
  } catch (error) {
    console.error("RSI Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// EMA
// ============================

app.get("/ema/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getEMA(symbol);

    res.json(result);
  } catch (error) {
    console.error("EMA Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// SMA
// ============================

app.get("/sma/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getSMA(symbol);

    res.json(result);
  } catch (error) {
    console.error("SMA Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// MACD
// ============================

app.get("/macd/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getMACD(symbol);

    res.json(result);
  } catch (error) {
    console.error("MACD Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// Bollinger Bands
// ============================

app.get("/bollinger/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getBollinger(symbol);

    res.json(result);
  } catch (error) {
    console.error("Bollinger Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// ATR
// ============================

app.get("/atr/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getATR(symbol);

    res.json(result);
  } catch (error) {
    console.error("ATR Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// ADX
// ============================

app.get("/adx/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getADX(symbol);

    res.json(result);
  } catch (error) {
    console.error("ADX Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// OBV
// ============================

app.get("/obv/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getOBV(symbol);

    res.json(result);
  } catch (error) {
    console.error("OBV Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// Relative Volume
// ============================

app.get("/rvol/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getRVOL(symbol);

    res.json(result);
  } catch (error) {
    console.error("RVOL Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// Volume Spike Detector
// ============================

app.get("/volume-spike/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getVolumeSpike(symbol);

    res.json(result);
  } catch (error) {
    console.error("Volume Spike Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================
// Candlestick Pattern Engine
// ============================

app.get("/candlestick/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getCandlestick(symbol);

    res.json(result);
  } catch (error) {
    console.error("Candlestick Route Error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/*
  The legacy /trend and /agreement routes were removed:
  they served the trade-optimization verdict directly and
  bypassed the Shariah compliance gate. Verdict output is
  only available through /api/analyze, where the gate is
  enforced server-side.
*/

// ============================
// Master Analysis Engine
// ============================

app.get("/api/analyze/:symbol", strictLimiter, async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getMasterAnalysis(symbol);

    if (
      result?.meta &&
      typeof result.meta === "object"
    ) {
      result.meta.requestId =
        req.requestId;
    }

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json(result);
  } catch (error) {
    console.error("Master Analysis Route Error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to generate master analysis.",
      details: error.message
    });
  }
});

// ============================
// Explanation Engine
// ============================

app.get("/api/explanation/:symbol", strictLimiter, async (req, res) => {
  try {
    const symbol = req.params.symbol
      .trim()
      .toUpperCase();

    const result = await getExplanation(symbol);

    const statusCode = result.success ? 200 : 500;

    res.status(statusCode).json(result);
  } catch (error) {
    console.error("Explanation Route Error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to generate explanation.",
      details: error.message
    });
  }
});

// ============================
// 404 Route
// ============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found.",
    requestId: req.requestId
  });
});

// ============================
// Error Boundary
// ============================

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode =
    Number(error?.status) >= 400 &&
    Number(error?.status) < 600
      ? Number(error.status)
      : 500;

  writeLog("error", "unhandled_http_error", {
    requestId: req.requestId,
    method: req.method,
    route:
      req.route?.path || "UNMATCHED",
    statusCode,
    errorName:
      error?.name || "Error",
    errorCode:
      error?.code || null
  });

  return res.status(statusCode).json({
    success: false,
    error:
      statusCode === 400
        ? "Invalid request payload."
        : "An unexpected server error occurred.",
    requestId: req.requestId
  });
});

// ============================
// Start Server
// ============================

function startServer(port = PORT) {
  return app.listen(port, () => {
    writeLog("info", "service_started", {
      port: Number(port),
      environment:
        process.env.NODE_ENV ||
        "development"
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer
};
