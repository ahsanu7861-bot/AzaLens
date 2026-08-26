"use strict";

/* Synthetic provider-shaped fixtures. No response was captured from Twelve Data. */
function responseFor(endpoint, symbol = "AAPL") {
  const fixtures = {
    quote: { symbol, close: "227.30", previous_close: "223.94", timestamp: 1787356800 },
    profile: { symbol, name: "Synthetic Company", exchange: "NASDAQ", country: "United States" },
    stocks: { data: [{ symbol, name: "Synthetic Company", exchange: "NASDAQ", country: "United States", type: "Common Stock" }] },
    logo: { url: "https://example.invalid/synthetic-logo.png" },
    symbol_search: { data: [{ symbol, instrument_type: "Common Stock", exchange: "NASDAQ", country: "United States" }] },
    time_series: { meta: { symbol, interval: "1day" }, values: [{ datetime: "2026-08-25", open: "225", high: "228", low: "224", close: "227", volume: "1000" }] },
  };
  return fixtures[endpoint];
}

module.exports = { responseFor };
