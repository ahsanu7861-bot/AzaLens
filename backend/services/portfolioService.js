"use strict";

const PORTFOLIO_RECORD_LIMIT = 50;
const SELECT_COLUMNS = "symbol,shares,average_price,currency,opened_at,updated_at";
const MAX_SAFE_SCALED_DECIMAL = BigInt(Number.MAX_SAFE_INTEGER);

function requireContext(db, userId) {
  if (!db || typeof db.from !== "function" || typeof userId !== "string" || !userId) {
    const error = new Error("Personal persistence is temporarily unavailable.");
    error.code = "PERSISTENCE_UNAVAILABLE";
    throw error;
  }
}

function canonicalDecimal(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite decimal number.`);
  }
  const text = String(value);
  if (/e/i.test(text) || !/^\d+(?:\.\d{1,8})?$/.test(text) || value <= 0) {
    throw new TypeError(`${field} must be greater than zero with at most eight decimal places.`);
  }
  const [whole, fraction = ""] = text.split(".");
  const scaled = BigInt(whole + fraction.padEnd(8, "0"));
  if (whole.length > 12 || scaled > MAX_SAFE_SCALED_DECIMAL) {
    throw new TypeError(`${field} is outside the exact JSON number range.`);
  }
  return `${whole}.${fraction.padEnd(8, "0")}`;
}

function mapDatabaseError(error) {
  if (!error) return;
  if (error.code === "23505") {
    const mapped = new Error("Symbol already exists in portfolio. Use the update endpoint instead.");
    mapped.code = "DUPLICATE_HOLDING";
    throw mapped;
  }
  if (error.code === "PT422" && error.message === "PORTFOLIO_LIMIT_REACHED") {
    const mapped = new Error("Portfolio record limit reached.");
    Object.assign(mapped, { code: "PORTFOLIO_LIMIT_REACHED", limit: 50, current: 50 });
    throw mapped;
  }
  const mapped = new Error(error.code === "42501" ? "The portfolio operation is not permitted." : "The portfolio operation failed.");
  mapped.code = error.code === "42501" ? "PERSISTENCE_FORBIDDEN" : "PERSISTENCE_FAILURE";
  throw mapped;
}

const toHolding = (row) => ({
  symbol: row.symbol,
  shares: Number(row.shares),
  averagePrice: Number(row.average_price),
  currency: row.currency,
  openedAt: row.opened_at,
  updatedAt: row.updated_at,
});

async function getPortfolio({ db, userId }) {
  requireContext(db, userId);
  const { data, error } = await db.from("portfolio_holdings").select(SELECT_COLUMNS)
    .eq("user_id", userId).order("opened_at", { ascending: true }).order("symbol", { ascending: true });
  mapDatabaseError(error);
  return (data || []).map(toHolding);
}

async function addHolding({ db, userId, symbol, shares, averagePrice, currency = "USD" }) {
  requireContext(db, userId);
  const payload = { user_id: userId, symbol, shares: canonicalDecimal(shares, "Shares"), average_price: canonicalDecimal(averagePrice, "Average price"), currency };
  const { data, error } = await db.from("portfolio_holdings").insert(payload).select(SELECT_COLUMNS).single();
  mapDatabaseError(error);
  return toHolding(data);
}

async function updateHolding({ db, userId, symbol, shares, averagePrice, currency = "USD" }) {
  requireContext(db, userId);
  const payload = { shares: canonicalDecimal(shares, "Shares"), average_price: canonicalDecimal(averagePrice, "Average price"), currency };
  const { data, error } = await db.from("portfolio_holdings").update(payload)
    .eq("user_id", userId).eq("symbol", symbol).select(SELECT_COLUMNS);
  mapDatabaseError(error);
  if (!data?.length) {
    const missing = new Error("Holding not found.");
    missing.code = "HOLDING_NOT_FOUND";
    throw missing;
  }
  return toHolding(data[0]);
}

async function removeHolding({ db, userId, symbol }) {
  requireContext(db, userId);
  const { data, error } = await db.from("portfolio_holdings").delete()
    .eq("user_id", userId).eq("symbol", symbol).select("symbol");
  mapDatabaseError(error);
  if (!data?.length) {
    const missing = new Error("Holding not found.");
    missing.code = "HOLDING_NOT_FOUND";
    throw missing;
  }
  return getPortfolio({ db, userId });
}

module.exports = { PORTFOLIO_RECORD_LIMIT, addHolding, canonicalDecimal, getPortfolio, removeHolding, updateHolding };
