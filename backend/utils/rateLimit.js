"use strict";

const rateLimit = require("express-rate-limit");
const {
  isGlobalLimiterExempt,
} = require("./rateLimitPaths");

const WINDOW_MS = 60_000;
const GLOBAL_LIMIT_PER_WINDOW = 30;
const STRICT_LIMIT_PER_WINDOW = 10;

function isOptionsRequest(req) {
  return req.method === "OPTIONS";
}

function buildRateLimitHandler(message) {
  return function rateLimitHandler(req, res) {
    res.status(429).json({
      success: false,
      error: message,
      requestId: req.requestId,
    });
  };
}

function createGlobalLimiter() {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: GLOBAL_LIMIT_PER_WINDOW,
    standardHeaders: true,
    legacyHeaders: false,
    skip(req) {
      return (
        isOptionsRequest(req) ||
        isGlobalLimiterExempt(req)
      );
    },
    handler: buildRateLimitHandler(
      "Too many requests. Please slow down and try again shortly."
    ),
  });
}

function createStrictLimiter() {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: STRICT_LIMIT_PER_WINDOW,
    standardHeaders: true,
    legacyHeaders: false,
    skip(req) {
      return isOptionsRequest(req);
    },
    handler: buildRateLimitHandler(
      "Too many requests to this resource. Please slow down and try again shortly."
    ),
  });
}

module.exports = {
  createGlobalLimiter,
  createStrictLimiter,
};
