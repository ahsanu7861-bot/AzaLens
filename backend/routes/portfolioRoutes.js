const express = require("express");
const {
  getPortfolio,
  addHolding,
  updateHolding,
  removeHolding,
} = require("../services/portfolioService");

function isValidSymbol(symbol) {
  return /^[A-Z0-9.\-]{1,15}$/.test(symbol);
}

function validateHolding(symbol, shares, averagePrice) {
  if (typeof symbol !== "string" || !isValidSymbol(symbol.trim().toUpperCase())) {
    return "A valid stock symbol is required.";
  }

  if (typeof shares !== "number" || shares <= 0) {
    return "Shares must be greater than zero.";
  }

  if (typeof averagePrice !== "number" || averagePrice <= 0) {
    return "Average price must be greater than zero.";
  }

  return null;
}

function createPortfolioRouter({ intelligenceLimiter } = {}) {
  if (typeof intelligenceLimiter !== "function") {
    throw new Error(
      "createPortfolioRouter requires intelligenceLimiter to be a middleware function."
    );
  }

  const router = express.Router();

  // ======================================
  // GET Portfolio
  // ======================================

  router.get("/", async (req, res) => {
    try {
      const portfolio = await getPortfolio();

      res.json({
        success: true,
        message: "Portfolio retrieved successfully.",
        data: portfolio,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve portfolio.",
      });
    }
  });

  // ======================================
  // ADD Holding
  // ======================================

  router.post("/", async (req, res) => {
    try {
      const { symbol, shares, averagePrice } = req.body;

      const validationError = validateHolding(
        symbol,
        shares,
        averagePrice
      );

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }

      const holding = await addHolding({
        symbol,
        shares,
        averagePrice,
      });

      res.status(201).json({
        success: true,
        message: "Holding added successfully.",
        data: holding,
      });
    } catch (error) {
      if (error.code === "DUPLICATE_HOLDING") {
        return res.status(409).json({
          success: false,
          message: error.message,
        });
      }

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Unable to add holding.",
      });
    }
  });

  // ======================================
  // UPDATE Holding
  // ======================================

  router.put("/:symbol", async (req, res) => {
    try {
      const symbol = String(req.params.symbol || "").trim().toUpperCase();
      const { shares, averagePrice } = req.body || {};
      const validationError = validateHolding(symbol, shares, averagePrice);

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError,
        });
      }

      const updated = await updateHolding(
        symbol,
        { shares, averagePrice }
      );

      res.json({
        success: true,
        message: "Holding updated successfully.",
        data: updated,
      });
    } catch (error) {
      if (error.code === "HOLDING_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Unable to update holding.",
      });
    }
  });

  // ======================================
  // DELETE Holding
  // ======================================

  router.delete("/:symbol", async (req, res) => {
    try {
      const portfolio = await removeHolding(req.params.symbol);

      res.json({
        success: true,
        message: "Holding removed successfully.",
        data: portfolio,
      });
    } catch (error) {
      if (error.code === "HOLDING_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Unable to remove holding.",
      });
    }
  });

  /*
    GET /intelligence is deliberately NOT mounted.

    It called getMasterAnalysis() once per holding in an uncapped
    loop (services/portfolioIntelligenceService.js), so a single
    unauthenticated request bought one full provider pipeline -
    2 Finnhub + 1 Twelve Data + 1 Halal Terminal screening - per
    holding, with no limit on how many holdings an anonymous
    caller could first add through POST /. No client has ever
    called it: no frontend consumer exists on any ref in this
    repository's history.

    The route stays unmounted until a real consumer exists AND
    the fan-out is bounded. backend/tests/testPortfolioIntelligenceRemoved.js
    proves it 404s and that no request to that path can reach
    getMasterAnalysis. The service module is left in place for a
    separate orphan-cleanup change.

    intelligenceLimiter remains a required constructor argument:
    it is the injection point a bounded replacement would use, and
    testPortfolioRouterFactory.js asserts the contract.
  */

  return router;
}

module.exports = createPortfolioRouter;
