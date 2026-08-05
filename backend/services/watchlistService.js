const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");

/*
  Resolved per call so a test can redirect storage to a temporary
  directory after this module has been required. Production and
  development never set AZALENS_STORAGE_DIR.
*/
function storageDirectory() {
  return (
    String(process.env.AZALENS_STORAGE_DIR || "").trim() ||
    path.join(__dirname, "../storage")
  );
}

function watchlistFile() {
  return path.join(storageDirectory(), "watchlists.json");
}

/*
  Defence in depth against unbounded storage and the O(n) parse and
  rewrite performed on every read and every mutation. It is NOT a
  provider-cost control - no watchlist route reaches any paid
  provider.

  100 symbols is five complete 20-symbol scanner selections
  (SCAN_UNIVERSE_LIMIT is 20). The product deliberately supports
  choosing a 20-symbol subset from a larger watchlist, so a smaller
  cap would remove a shipped workflow; beyond 100 a user would need
  six or more manual runs with no batching, pagination or saved
  subsets. ~7 KB at the measured 73 bytes per record.
*/
const WATCHLIST_RECORD_LIMIT = 100;

function limitError(current) {
  const error = new Error("Watchlist record limit reached.");

  error.code = "WATCHLIST_LIMIT_REACHED";
  error.limit = WATCHLIST_RECORD_LIMIT;
  error.current = current;

  return error;
}

/*
  This used to catch every error and return [], which reported a
  truncated or corrupted file to the user as an empty watchlist -
  data loss presented as a legitimate empty state. It now mirrors
  getPortfolio exactly: a missing file is seeded empty, malformed
  content fails visibly, and nothing malformed is ever silently
  overwritten or "repaired".
*/
async function getWatchlist() {
  try {
    const data = await fs.readFile(watchlistFile(), "utf8");

    if (!data.trim()) {
      return [];
    }

    const watchlist = JSON.parse(data);

    if (!Array.isArray(watchlist)) {
      throw new Error("Watchlist storage must contain an array.");
    }

    return watchlist;
  } catch (error) {
    if (error.code === "ENOENT") {
      await saveWatchlist([]);
      return [];
    }

    if (error instanceof SyntaxError) {
      throw new Error("Watchlist storage contains invalid JSON.");
    }

    throw error;
  }
}

/*
  Atomic replacement, matching portfolioService. This file previously
  wrote straight onto the live destination, so an interrupted write
  could leave a truncated file, and four concurrent creates persisted
  only one row while returning 201 four times.

  Atomic replacement prevents partial-file corruption and removes the
  concurrent-temp collision. It does NOT solve lost updates: two
  concurrent read-modify-write cycles still resolve last-write-wins.
  Locking or a database is the real answer and stays follow-up work.
*/
async function saveWatchlist(watchlist) {
  const destination = watchlistFile();
  const temporaryFile = `${destination}.${process.pid}.${crypto
    .randomUUID()
    .slice(0, 8)}.tmp`;

  try {
    await fs.writeFile(
      temporaryFile,
      JSON.stringify(watchlist, null, 2),
      "utf8"
    );

    await fs.rename(temporaryFile, destination);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {});
    throw error;
  }
}

async function addSymbol(symbol) {
  const normalizedSymbol = String(symbol).toUpperCase().trim();

  const watchlist = await getWatchlist();

  const exists = watchlist.some(
    (item) => item.symbol === normalizedSymbol
  );

  /*
    Duplicate detection runs BEFORE the cap check, deliberately, so a
    user at the limit re-adding an existing symbol still gets the
    accurate 409 rather than a misleading "limit reached".
  */
  if (exists) {
    throw new Error("Symbol already exists in watchlist.");
  }

  /*
    Only a new distinct record is rejected. Reads, and deletes that
    bring the collection back below the limit, are never blocked.
  */
  if (watchlist.length >= WATCHLIST_RECORD_LIMIT) {
    throw limitError(watchlist.length);
  }

  const newItem = {
    symbol: normalizedSymbol,
    addedAt: new Date().toISOString(),
  };

  watchlist.push(newItem);

  await saveWatchlist(watchlist);

  return newItem;
}

async function removeSymbol(symbol) {
  const normalizedSymbol = String(symbol).toUpperCase().trim();

  const watchlist = await getWatchlist();

  const filtered = watchlist.filter(
    (item) => item.symbol !== normalizedSymbol
  );

  if (filtered.length === watchlist.length) {
    throw new Error("Symbol not found.");
  }

  await saveWatchlist(filtered);

  return filtered;
}

module.exports = {
  WATCHLIST_RECORD_LIMIT,
  getWatchlist,
  addSymbol,
  removeSymbol,
};
