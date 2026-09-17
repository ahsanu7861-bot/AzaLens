"use strict";

const WATCHLIST_RECORD_LIMIT = 100;
const SELECT_COLUMNS = "symbol,note,added_at";

function requireContext(db, userId) {
  if (!db || typeof db.from !== "function" || typeof userId !== "string" || !userId) {
    const error = new Error("Personal persistence is temporarily unavailable.");
    error.code = "PERSISTENCE_UNAVAILABLE";
    throw error;
  }
}

function mapDatabaseError(error) {
  if (!error) return;
  if (error.code === "23505") {
    const mapped = new Error("Symbol already exists in watchlist.");
    mapped.code = "DUPLICATE_WATCHLIST_SYMBOL";
    throw mapped;
  }
  if (error.code === "PT422" && error.message === "WATCHLIST_LIMIT_REACHED") {
    const mapped = new Error("Watchlist record limit reached.");
    Object.assign(mapped, { code: "WATCHLIST_LIMIT_REACHED", limit: 100, current: 100 });
    throw mapped;
  }
  const mapped = new Error(error.code === "42501" ? "The watchlist operation is not permitted." : "The watchlist operation failed.");
  mapped.code = error.code === "42501" ? "PERSISTENCE_FORBIDDEN" : "PERSISTENCE_FAILURE";
  throw mapped;
}

const toItem = (row) => ({ symbol: row.symbol, note: row.note ?? null, addedAt: row.added_at });

async function getWatchlist({ db, userId }) {
  requireContext(db, userId);
  const { data, error } = await db.from("watchlists").select(SELECT_COLUMNS)
    .eq("user_id", userId).order("added_at", { ascending: true }).order("symbol", { ascending: true });
  mapDatabaseError(error);
  return (data || []).map(toItem);
}

async function addSymbol({ db, userId, symbol, note = null }) {
  requireContext(db, userId);
  const { data, error } = await db.from("watchlists").insert({ user_id: userId, symbol, note })
    .select(SELECT_COLUMNS).single();
  mapDatabaseError(error);
  return toItem(data);
}

async function updateNote({ db, userId, symbol, note }) {
  requireContext(db, userId);
  const { data, error } = await db.from("watchlists").update({ note })
    .eq("user_id", userId).eq("symbol", symbol).select(SELECT_COLUMNS);
  mapDatabaseError(error);
  if (!data?.length) {
    const missing = new Error("Symbol not found.");
    missing.code = "WATCHLIST_NOT_FOUND";
    throw missing;
  }
  return toItem(data[0]);
}

async function removeSymbol({ db, userId, symbol }) {
  requireContext(db, userId);
  const { data, error } = await db.from("watchlists").delete()
    .eq("user_id", userId).eq("symbol", symbol).select("symbol");
  mapDatabaseError(error);
  if (!data?.length) {
    const missing = new Error("Symbol not found.");
    missing.code = "WATCHLIST_NOT_FOUND";
    throw missing;
  }
  return getWatchlist({ db, userId });
}

module.exports = { WATCHLIST_RECORD_LIMIT, addSymbol, getWatchlist, removeSymbol, updateNote };
