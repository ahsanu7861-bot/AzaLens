"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const portfolioRouter = fs.readFileSync(path.join(__dirname, "../routes/portfolioRoutes.js"), "utf8");

assert.doesNotMatch(server, /api\/portfolio\/intelligence/);
assert.doesNotMatch(portfolioRouter, /getMasterAnalysis|masterAnalysisService/);
assert.doesNotMatch(server, /api\/explanation/);
assert.match(server, /app\.get\("\/api\/analyze\/:symbol", strictLimiter/);
assert.match(server, /app\.use\("\/api\/portfolio", requirePersonalPersistence, portfolioRoutes\)/);

console.log("Removed portfolio-intelligence and explanation routes remain absent; the authenticated portfolio router has no analysis/provider dependency.");
