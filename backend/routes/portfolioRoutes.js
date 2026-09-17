"use strict";

const express = require("express");
const { addHolding, getPortfolio, removeHolding, updateHolding } = require("../services/portfolioService");

const isValidSymbol = (symbol) => /^[A-Z0-9.\-]{1,12}$/.test(symbol);
const isValidCurrency = (currency) => /^[A-Z]{3}$/.test(currency);

function context(req) {
  return { db: req.db, userId: req.user?.id };
}

function sendError(res, error, fallback) {
  if (error instanceof TypeError) return res.status(400).json({ success: false, code: "INVALID_DECIMAL", message: error.message });
  const contracts = {
    DUPLICATE_HOLDING: [409, error.message],
    HOLDING_NOT_FOUND: [404, error.message],
    PERSISTENCE_FORBIDDEN: [403, "The portfolio operation is not permitted."],
    PERSISTENCE_UNAVAILABLE: [503, "Personal persistence is temporarily unavailable."],
    PORTFOLIO_LIMIT_REACHED: [422, error.message],
  };
  const [status, message] = contracts[error?.code] || [500, fallback];
  const body = { success: false, code: error?.code || "PERSISTENCE_FAILURE", message };
  if (error?.code === "PORTFOLIO_LIMIT_REACHED") body.error = { code: error.code, message, limit: 50, current: 50 };
  return res.status(status).json(body);
}

function normalizeInput(body = {}) {
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "USD";
  if (!isValidSymbol(symbol)) throw new TypeError("Symbol format is invalid.");
  if (!isValidCurrency(currency)) throw new TypeError("Currency must be a three-letter code.");
  return { symbol, shares: body.shares, averagePrice: body.averagePrice, currency };
}

function createPortfolioRouter({ intelligenceLimiter } = {}) {
  if (typeof intelligenceLimiter !== "function") throw new Error("createPortfolioRouter requires intelligenceLimiter to be a middleware function.");
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      return res.json({ success: true, message: "Portfolio retrieved successfully.", data: await getPortfolio(context(req)) });
    } catch (error) {
      return sendError(res, error, "Unable to retrieve portfolio.");
    }
  });

  router.post("/", async (req, res) => {
    try {
      const input = normalizeInput(req.body);
      const data = await addHolding({ ...context(req), ...input });
      return res.status(201).json({ success: true, message: "Holding added successfully.", data });
    } catch (error) {
      return sendError(res, error, "Unable to add holding.");
    }
  });

  router.put("/:symbol", async (req, res) => {
    try {
      const input = normalizeInput({ ...req.body, symbol: req.params.symbol });
      return res.json({ success: true, message: "Holding updated successfully.", data: await updateHolding({ ...context(req), ...input }) });
    } catch (error) {
      return sendError(res, error, "Unable to update holding.");
    }
  });

  router.delete("/:symbol", async (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ success: false, message: "Symbol format is invalid." });
    try {
      return res.json({ success: true, message: "Holding removed successfully.", data: await removeHolding({ ...context(req), symbol }) });
    } catch (error) {
      return sendError(res, error, "Unable to remove holding.");
    }
  });

  return router;
}

module.exports = createPortfolioRouter;
