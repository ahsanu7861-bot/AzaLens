"use strict";

const express = require("express");
const { addSymbol, getWatchlist, removeSymbol, updateNote } = require("../services/watchlistService");

const router = express.Router();
const isValidSymbol = (symbol) => /^[A-Z0-9.\-]{1,12}$/.test(symbol);

function context(req) {
  return { db: req.db, userId: req.user?.id };
}

function sendError(res, error, fallback) {
  const contracts = {
    DUPLICATE_WATCHLIST_SYMBOL: [409, error.message],
    WATCHLIST_NOT_FOUND: [404, error.message],
    PERSISTENCE_FORBIDDEN: [403, "The watchlist operation is not permitted."],
    PERSISTENCE_UNAVAILABLE: [503, "Personal persistence is temporarily unavailable."],
    WATCHLIST_LIMIT_REACHED: [422, error.message],
  };
  const [status, message] = contracts[error?.code] || [500, fallback];
  const body = { success: false, code: error?.code || "PERSISTENCE_FAILURE", message };
  if (error?.code === "WATCHLIST_LIMIT_REACHED") {
    body.error = { code: error.code, message, limit: 100, current: 100 };
  }
  return res.status(status).json(body);
}

router.get("/", async (req, res) => {
  try {
    return res.status(200).json({ success: true, message: "Watchlist retrieved successfully.", data: await getWatchlist(context(req)) });
  } catch (error) {
    return sendError(res, error, "Unable to retrieve watchlist.");
  }
});

router.post("/", async (req, res) => {
  const symbol = typeof req.body?.symbol === "string" ? req.body.symbol.trim().toUpperCase() : "";
  const note = req.body?.note ?? null;
  if (!isValidSymbol(symbol)) return res.status(400).json({ success: false, message: "Symbol format is invalid." });
  if (note !== null && (typeof note !== "string" || note.length > 280)) return res.status(400).json({ success: false, message: "Note must contain at most 280 characters." });
  try {
    const data = await addSymbol({ ...context(req), symbol, note });
    return res.status(201).json({ success: true, message: `${symbol} added to watchlist.`, data });
  } catch (error) {
    return sendError(res, error, "Unable to add symbol to watchlist.");
  }
});

router.put("/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").trim().toUpperCase();
  const note = req.body?.note ?? null;
  if (!isValidSymbol(symbol)) return res.status(400).json({ success: false, message: "Symbol format is invalid." });
  if (note !== null && (typeof note !== "string" || note.length > 280)) return res.status(400).json({ success: false, message: "Note must contain at most 280 characters." });
  try {
    return res.json({ success: true, message: "Watchlist note updated successfully.", data: await updateNote({ ...context(req), symbol, note }) });
  } catch (error) {
    return sendError(res, error, "Unable to update watchlist note.");
  }
});

router.delete("/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").trim().toUpperCase();
  if (!isValidSymbol(symbol)) return res.status(400).json({ success: false, message: "Symbol format is invalid." });
  try {
    return res.json({ success: true, message: `${symbol} removed from watchlist.`, data: await removeSymbol({ ...context(req), symbol }) });
  } catch (error) {
    return sendError(res, error, "Unable to remove symbol from watchlist.");
  }
});

module.exports = router;
