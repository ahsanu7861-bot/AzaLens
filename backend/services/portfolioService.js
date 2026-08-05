const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");

/*
  The storage directory is resolved per call, not captured at module
  load, so a test can point it at a temporary directory after this
  module has already been required. Production and development never
  set AZALENS_STORAGE_DIR and keep the committed location.
*/
function storageDirectory() {
  return (
    String(process.env.AZALENS_STORAGE_DIR || "").trim() ||
    path.join(__dirname, "../storage")
  );
}

function portfolioFile() {
  return path.join(storageDirectory(), "portfolios.json");
}

/*
  Defence in depth against unbounded storage and the O(n) parse and
  rewrite that every read and every mutation performs on the whole
  collection. It is NOT a provider-cost control: since the
  portfolio-intelligence route was unmounted, no portfolio route can
  reach any paid provider.

  100 holdings is ~16 KB at the measured 163 bytes per record. The
  portfolio has no bulk import, no broker sync and no automated
  ingestion, so every record is entered by hand.
*/
const PORTFOLIO_RECORD_LIMIT = 100;

function limitError(current) {
  const error = new Error("Portfolio record limit reached.");

  error.code = "PORTFOLIO_LIMIT_REACHED";
  error.limit = PORTFOLIO_RECORD_LIMIT;
  error.current = current;

  return error;
}

async function getPortfolio() {
  try {
    const data = await fs.readFile(portfolioFile(), "utf8");

    if (!data.trim()) {
      return [];
    }

    const portfolio = JSON.parse(data);

    if (!Array.isArray(portfolio)) {
      throw new Error("Portfolio storage must contain an array.");
    }

    return portfolio;
  } catch (error) {
    if (error.code === "ENOENT") {
      await savePortfolio([]);
      return [];
    }

    if (error instanceof SyntaxError) {
      throw new Error("Portfolio storage contains invalid JSON.");
    }

    throw error;
  }
}

/*
  Atomic replacement: write a temporary file, then rename it over the
  destination. rename(2) is atomic within a filesystem, so a reader
  sees either the whole previous file or the whole new one - never a
  half-written collection.

  The temporary name carries the pid and a random suffix. It used to
  be a single fixed "portfolios.json.tmp" shared by every writer,
  which meant concurrent writes raced: the first rename consumed the
  shared temp file and the losers failed with ENOENT and returned
  HTTP 500.

  This fixes partial-file corruption and concurrent-temp collision.
  It does NOT solve lost updates. Two concurrent read-modify-write
  cycles still resolve last-write-wins, and the update read by the
  loser is silently discarded. Locking or a database is the real
  answer and is deliberately left as follow-up work.
*/
async function savePortfolio(portfolio) {
  const destination = portfolioFile();
  const temporaryFile = `${destination}.${process.pid}.${crypto
    .randomUUID()
    .slice(0, 8)}.tmp`;

  try {
    await fs.writeFile(
      temporaryFile,
      JSON.stringify(portfolio, null, 2),
      "utf8"
    );

    await fs.rename(temporaryFile, destination);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {});
    throw error;
  }
}

async function addHolding({ symbol, shares, averagePrice }) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const portfolio = await getPortfolio();

  const existingHolding = portfolio.find(
    (holding) => holding.symbol === normalizedSymbol
  );

  /*
    Duplicate detection runs BEFORE the cap check, deliberately. A
    user at the limit re-adding a symbol they already hold must get
    the accurate 409, not a misleading "limit reached".
  */
  if (existingHolding) {
    const error = new Error(
      "Symbol already exists in portfolio. Use the update endpoint instead."
    );

    error.code = "DUPLICATE_HOLDING";
    throw error;
  }

  /*
    Only the creation of a new distinct record is rejected. Reads,
    updates and deletes are never blocked, so a collection that is
    already over the limit stays fully readable and can be brought
    back down one delete at a time.
  */
  if (portfolio.length >= PORTFOLIO_RECORD_LIMIT) {
    throw limitError(portfolio.length);
  }

  const timestamp = new Date().toISOString();

  const holding = {
    symbol: normalizedSymbol,
    shares,
    averagePrice,
    addedAt: timestamp,
    updatedAt: timestamp,
  };

  portfolio.push(holding);
  await savePortfolio(portfolio);

  return holding;
}

async function updateHolding(symbol, updates) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const portfolio = await getPortfolio();

  const holdingIndex = portfolio.findIndex(
    (holding) => holding.symbol === normalizedSymbol
  );

  if (holdingIndex === -1) {
    const error = new Error("Holding not found.");
    error.code = "HOLDING_NOT_FOUND";
    throw error;
  }

  const currentHolding = portfolio[holdingIndex];

  const updatedHolding = {
    ...currentHolding,
    shares:
      updates.shares !== undefined
        ? updates.shares
        : currentHolding.shares,
    averagePrice:
      updates.averagePrice !== undefined
        ? updates.averagePrice
        : currentHolding.averagePrice,
    updatedAt: new Date().toISOString(),
  };

  portfolio[holdingIndex] = updatedHolding;
  await savePortfolio(portfolio);

  return updatedHolding;
}

async function removeHolding(symbol) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const portfolio = await getPortfolio();

  const holdingExists = portfolio.some(
    (holding) => holding.symbol === normalizedSymbol
  );

  if (!holdingExists) {
    const error = new Error("Holding not found.");
    error.code = "HOLDING_NOT_FOUND";
    throw error;
  }

  const updatedPortfolio = portfolio.filter(
    (holding) => holding.symbol !== normalizedSymbol
  );

  await savePortfolio(updatedPortfolio);

  return updatedPortfolio;
}

module.exports = {
  PORTFOLIO_RECORD_LIMIT,
  getPortfolio,
  addHolding,
  updateHolding,
  removeHolding,
};
