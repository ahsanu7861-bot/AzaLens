"use strict";

/*
  Frozen B4 validation matrix. These are test cases, not production defaults,
  recommendations, or a declaration that every market is licensed. Changing
  the matrix changes the evidence population and therefore requires review.
*/
const TRIAL_MATRIX_VERSION = "b4a-v1";

const TRIAL_SYMBOL_MATRIX = Object.freeze([
  Object.freeze({ bucket: "us-mega-cap", symbol: "AAPL", reason: "high-liquidity US common stock" }),
  Object.freeze({ bucket: "us-large-cap", symbol: "JPM", reason: "US financial-sector common stock" }),
  Object.freeze({ bucket: "us-mid-cap", symbol: "DKS", reason: "mid-cap consumer listing" }),
  Object.freeze({ bucket: "us-small-cap", symbol: "CROX", reason: "smaller-cap US listing" }),
  Object.freeze({ bucket: "punctuated-symbol", symbol: "BRK.B", reason: "class-share symbol normalization" }),
  Object.freeze({ bucket: "adr-asia", symbol: "BABA", reason: "US-listed Asian ADR" }),
  Object.freeze({ bucket: "adr-europe", symbol: "NVO", reason: "US-listed European ADR" }),
  Object.freeze({ bucket: "adr-japan", symbol: "TM", reason: "US-listed Japanese ADR" }),
  Object.freeze({ bucket: "recent-growth", symbol: "PLTR", reason: "newer high-volume US listing" }),
]);

module.exports = { TRIAL_MATRIX_VERSION, TRIAL_SYMBOL_MATRIX };
