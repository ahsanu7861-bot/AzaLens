"use strict";

const express = require("express");
const { getWatchlist } = require("../services/watchlistService");
const {
  SCAN_UNIVERSE_LIMIT,
  normalizeSymbols,
  scanWatchlist,
} = require("../services/scannerService");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const symbols = normalizeSymbols(req.body?.symbols);
    const watchlist = await getWatchlist();
    const allowed = new Set(
      watchlist.map((item) =>
        String(item?.symbol || "").trim().toUpperCase()
      )
    );

    if (symbols.some((symbol) => !allowed.has(symbol))) {
      return res.status(400).json({
        success: false,
        message:
          "Scanner can only evaluate stocks currently in your watchlist.",
      });
    }

    const data = await scanWatchlist(symbols);
    return res.status(200).json({
      success: true,
      message: `${data.symbolsTouched} watchlist stocks scanned.`,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to run scanner.";
    const isInputError =
      message.includes("Select") ||
      message.includes("at most") ||
      message.includes("invalid");

    return res.status(isInputError ? 400 : 503).json({
      success: false,
      message,
    });
  }
});

router.get("/policy", (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      universe: "WATCHLIST_SELECTION",
      universeLimit: SCAN_UNIVERSE_LIMIT,
      execution: "MANUAL_ONLY",
      shariahCalls: 0,
      fundamentalsCalls: 0,
    },
  });
});

module.exports = router;
