const fs = require("fs");
const path = require("path");

// ============================================================
// AzaLens - Halal Terminal Monthly Budget Guard
// The ledger uses a conservative estimated token cost because
// provider responses do not currently expose a trusted token total.
// ============================================================

const LEDGER_VERSION = 1;

function getUtcMonth(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function emptyLedger() {
  return {
    version: LEDGER_VERSION,
    months: {},
  };
}

function readLedger(ledgerPath) {
  try {
    const raw = fs.readFileSync(ledgerPath, "utf8");
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !parsed.months ||
      typeof parsed.months !== "object"
    ) {
      throw new Error("Usage ledger has an invalid structure.");
    }

    return {
      ledger: parsed,
      error: null,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        ledger: emptyLedger(),
        error: null,
      };
    }

    return {
      ledger: null,
      error,
    };
  }
}

function writeLedger(ledgerPath, ledger) {
  const directory = path.dirname(ledgerPath);
  const temporaryPath = `${ledgerPath}.${process.pid}.${Date.now()}.tmp`;

  fs.mkdirSync(directory, {
    recursive: true,
  });

  try {
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify(ledger, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      }
    );
    fs.renameSync(temporaryPath, ledgerPath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

function acquireLedgerLock(ledgerPath) {
  const directory = path.dirname(ledgerPath);
  const lockPath = `${ledgerPath}.lock`;

  fs.mkdirSync(directory, {
    recursive: true,
  });

  let descriptor;

  try {
    descriptor = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(
      descriptor,
      `${process.pid} ${new Date().toISOString()}\n`,
      "utf8"
    );

    return {
      descriptor,
      lockPath,
    };
  } catch (error) {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    }

    throw error;
  }
}

function releaseLedgerLock(lock) {
  if (!lock) {
    return;
  }

  try {
    fs.closeSync(lock.descriptor);
  } finally {
    if (fs.existsSync(lock.lockPath)) {
      fs.unlinkSync(lock.lockPath);
    }
  }
}

function buildBlockedResult(code, message, details = {}) {
  return {
    allowed: false,
    code,
    message,
    ...details,
  };
}

function getEstimatedBudgetSnapshot(config, now = new Date()) {
  const month = getUtcMonth(now);
  const configuredMonthlyBudget =
    Number.isFinite(config.monthlyTokenBudget) &&
    config.monthlyTokenBudget >= 0
      ? config.monthlyTokenBudget
      : 0;
  const { ledger, error } = readLedger(
    config.usageLedgerPath
  );

  const base = {
    source: "local-estimate",
    month,
    configuredMonthlyBudget,
    ledgerStorage: "local-filesystem",
    ledgerPersistence: "not-guaranteed",
  };

  if (error) {
    return {
      ...base,
      available: false,
      errorCode: "HALAL_TERMINAL_LEDGER_UNAVAILABLE",
    };
  }

  const current = ledger.months[month] || {
    estimatedTokensUsed: 0,
    requests: 0,
  };
  const validCurrent =
    current &&
    typeof current === "object" &&
    !Array.isArray(current) &&
    Number.isFinite(current.estimatedTokensUsed) &&
    current.estimatedTokensUsed >= 0 &&
    Number.isFinite(current.requests) &&
    current.requests >= 0;

  if (!validCurrent) {
    return {
      ...base,
      available: false,
      errorCode: "HALAL_TERMINAL_LEDGER_UNAVAILABLE",
    };
  }

  return {
    ...base,
    available: true,
    locallyEstimatedUsed: current.estimatedTokensUsed,
    locallyEstimatedRemaining: Math.max(
      configuredMonthlyBudget -
        current.estimatedTokensUsed,
      0
    ),
    locallyRecordedRequests: current.requests,
  };
}

function reserveEstimatedTokens(config, symbol, now = new Date()) {
  const monthlyBudget = config.monthlyTokenBudget;
  const estimatedCost = config.estimatedTokensPerRequest;
  const month = getUtcMonth(now);

  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    return buildBlockedResult(
      "HALAL_TERMINAL_BUDGET_DISABLED",
      "The monthly Halal Terminal token budget is zero."
    );
  }

  if (!Number.isFinite(estimatedCost) || estimatedCost <= 0) {
    return buildBlockedResult(
      "HALAL_TERMINAL_COST_ESTIMATE_INVALID",
      "The estimated token cost per screening is invalid."
    );
  }

  let lock;

  try {
    lock = acquireLedgerLock(config.usageLedgerPath);
  } catch {
    return buildBlockedResult(
      "HALAL_TERMINAL_LEDGER_BUSY",
      "The token-usage ledger is locked, so the provider call was blocked.",
      {
        month,
      }
    );
  }

  try {
    const { ledger, error } = readLedger(config.usageLedgerPath);

    if (error) {
      return buildBlockedResult(
        "HALAL_TERMINAL_LEDGER_UNAVAILABLE",
        "The local token-usage ledger could not be read safely.",
        {
          month,
        }
      );
    }

    const current = ledger.months[month] || {
      estimatedTokensUsed: 0,
      requests: 0,
    };
    const validCurrent =
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      Number.isFinite(current.estimatedTokensUsed) &&
      current.estimatedTokensUsed >= 0 &&
      Number.isFinite(current.requests) &&
      current.requests >= 0;

    if (!validCurrent) {
      return buildBlockedResult(
        "HALAL_TERMINAL_LEDGER_UNAVAILABLE",
        "The token-usage ledger contains invalid monthly totals.",
        {
          month,
        }
      );
    }

    const estimatedTokensUsed = current.estimatedTokensUsed;
    const projectedTokens = estimatedTokensUsed + estimatedCost;

    if (projectedTokens > monthlyBudget) {
      return buildBlockedResult(
        "HALAL_TERMINAL_MONTHLY_BUDGET_EXCEEDED",
        "This screening would exceed the configured monthly token budget.",
        {
          month,
          monthlyBudget,
          estimatedTokensUsed,
          estimatedCost,
          projectedTokens,
        }
      );
    }

    ledger.version = LEDGER_VERSION;
    ledger.months[month] = {
      estimatedTokensUsed: projectedTokens,
      requests: current.requests + 1,
      lastSymbol: symbol,
      lastReservedAt: now.toISOString(),
    };

    try {
      writeLedger(config.usageLedgerPath, ledger);
    } catch {
      return buildBlockedResult(
        "HALAL_TERMINAL_LEDGER_UNAVAILABLE",
        "The local token-usage ledger could not be updated safely.",
        {
          month,
        }
      );
    }

    return {
      allowed: true,
      code: "HALAL_TERMINAL_BUDGET_RESERVED",
      month,
      monthlyBudget,
      estimatedTokensUsed: projectedTokens,
      estimatedCost,
      remainingEstimatedTokens:
        monthlyBudget - projectedTokens,
    };
  } finally {
    releaseLedgerLock(lock);
  }
}

module.exports = {
  getEstimatedBudgetSnapshot,
  getUtcMonth,
  readLedger,
  reserveEstimatedTokens,
};
