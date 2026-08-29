"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BASIC_PLAN_ID = "basic_internal";

const COORDINATION_MODES = Object.freeze({
  DISABLED: "disabled",
  SINGLE_INSTANCE: "single_instance",
  MULTI_INSTANCE: "multi_instance",
  SHARED_ATOMIC: "shared_atomic",
});

const TWELVE_DATA_CREDIT_WEIGHTS = Object.freeze({
  quote: 1,
  time_series: 1,
  symbol_search: 1,
  profile: 10,
  stocks: 1,
  logo: 1,
  profile_bundle: 12,
});

const TWELVE_DATA_PLAN_PRESETS = Object.freeze({
  basic_internal: Object.freeze({
    id: BASIC_PLAN_ID,
    creditsPerMinute: 8,
    creditsPerDay: 800,
    enabled: true,
    purpose: "private_internal_use",
  }),
  venture_610: Object.freeze({
    id: "venture_610",
    creditsPerMinute: 610,
    creditsPerDay: null,
    enabled: false,
    purpose: "future_authenticated_display",
  }),
  venture_1597: Object.freeze({
    id: "venture_1597",
    creditsPerMinute: 1597,
    creditsPerDay: null,
    enabled: false,
    purpose: "future_authenticated_display",
  }),
  venture_2584: Object.freeze({
    id: "venture_2584",
    creditsPerMinute: 2584,
    creditsPerDay: null,
    enabled: false,
    purpose: "future_authenticated_display",
  }),
});

class TwelveDataCreditBudgetError extends Error {
  constructor(reason, retryAfterMs = null) {
    super("Twelve Data request refused by the local credit budget.");
    this.name = "TwelveDataCreditBudgetError";
    this.code = "TWELVE_DATA_CREDIT_BUDGET_EXCEEDED";
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

function acknowledged(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function resolveTwelveDataGovernorRuntime(env = process.env) {
  const mode = String(
    env.TWELVE_DATA_CREDIT_COORDINATION_MODE ||
      COORDINATION_MODES.DISABLED
  )
    .trim()
    .toLowerCase();
  const singleInstanceAcknowledged = acknowledged(
    env.TWELVE_DATA_SINGLE_INSTANCE_ACK
  );
  const durableLedgerAcknowledged = acknowledged(
    env.TWELVE_DATA_CREDIT_LEDGER_DURABLE_ACK
  );
  const configuredPath = String(
    env.TWELVE_DATA_CREDIT_LEDGER_PATH || ""
  ).trim();
  const absoluteLedgerPath = Boolean(
    configuredPath && path.isAbsolute(configuredPath)
  );

  let enabled = false;
  let reason = "coordination_disabled";

  if (mode === COORDINATION_MODES.SINGLE_INSTANCE) {
    if (!singleInstanceAcknowledged) {
      reason = "single_instance_not_acknowledged";
    } else if (!absoluteLedgerPath) {
      reason = "durable_ledger_path_required";
    } else if (!durableLedgerAcknowledged) {
      reason = "durable_ledger_not_acknowledged";
    } else {
      enabled = true;
      reason = null;
    }
  } else if (
    mode === COORDINATION_MODES.MULTI_INSTANCE ||
    mode === COORDINATION_MODES.SHARED_ATOMIC
  ) {
    reason = "shared_atomic_coordinator_unavailable";
  } else if (mode !== COORDINATION_MODES.DISABLED) {
    reason = "coordination_mode_invalid";
  }

  return Object.freeze({
    mode,
    enabled,
    reason,
    storagePath: enabled ? configuredPath : null,
    durableLedger: enabled && durableLedgerAcknowledged,
    singleInstanceAcknowledged:
      enabled && singleInstanceAcknowledged,
    multiInstanceSafe: false,
  });
}

class TwelveDataCreditGovernor {
  constructor(options = {}) {
    const plan = options.plan || TWELVE_DATA_PLAN_PRESETS[BASIC_PLAN_ID];
    if (!plan.enabled) {
      throw new Error(`Twelve Data plan preset ${plan.id} is disabled.`);
    }

    this.plan = plan;
    this.now = options.now || Date.now;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.minuteWindowMs = options.minuteWindowMs || 60_000;
    this.maxQueueLength = options.maxQueueLength ?? 8;
    this.maxQueueWaitMs = options.maxQueueWaitMs ?? 5_000;
    this.storagePath = options.storagePath || null;
    this.minuteKey = null;
    this.dayKey = null;
    this.minuteCredits = 0;
    this.dayCredits = 0;
    this.refusals = 0;
    this.queue = [];
  }

  mergePersistedAccounting() {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    let persisted;
    try {
      persisted = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
    } catch {
      throw this.refusal("accounting_ledger_invalid");
    }
    if (
      persisted?.version !== 1 ||
      persisted?.planId !== this.plan.id ||
      !Number.isInteger(persisted?.minuteCredits) ||
      !Number.isInteger(persisted?.dayCredits)
    ) {
      throw this.refusal("accounting_ledger_invalid");
    }
    if (persisted.minuteKey === this.minuteKey) {
      this.minuteCredits = Math.max(
        this.minuteCredits,
        persisted.minuteCredits
      );
    }
    if (persisted.dayKey === this.dayKey) {
      this.dayCredits = Math.max(this.dayCredits, persisted.dayCredits);
    }
  }

  persistAccounting() {
    if (!this.storagePath) return;
    const directory = path.dirname(this.storagePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const temporaryPath = `${this.storagePath}.${process.pid}.tmp`;
    const payload = JSON.stringify({
      version: 1,
      planId: this.plan.id,
      minuteKey: this.minuteKey,
      dayKey: this.dayKey,
      minuteCredits: this.minuteCredits,
      dayCredits: this.dayCredits,
    });
    fs.writeFileSync(temporaryPath, payload, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temporaryPath, this.storagePath);
    fs.chmodSync(this.storagePath, 0o600);
  }

  withAccountingLock(callback) {
    if (!this.storagePath) return callback();
    const directory = path.dirname(this.storagePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const lockPath = `${this.storagePath}.lock`;
    let lockDescriptor;
    try {
      lockDescriptor = fs.openSync(lockPath, "wx", 0o600);
    } catch {
      throw this.refusal("accounting_ledger_locked");
    }
    try {
      return callback();
    } finally {
      fs.closeSync(lockDescriptor);
      fs.unlinkSync(lockPath);
    }
  }

  refresh(now = this.now()) {
    const minuteKey = Math.floor(now / this.minuteWindowMs);
    const dayKey = new Date(now).toISOString().slice(0, 10);
    if (this.minuteKey !== minuteKey) {
      this.minuteKey = minuteKey;
      this.minuteCredits = 0;
    }
    if (this.dayKey !== dayKey) {
      this.dayKey = dayKey;
      this.dayCredits = 0;
    }
  }

  refusal(reason, retryAfterMs = null) {
    this.refusals += 1;
    return new TwelveDataCreditBudgetError(reason, retryAfterMs);
  }

  tryReserve(credits) {
    const requested = Number(credits);
    if (!Number.isInteger(requested) || requested < 1) {
      throw new Error("Twelve Data credit reservation must be a positive integer.");
    }

    return this.withAccountingLock(() => {
      const now = this.now();
      this.refresh(now);
      if (requested > this.plan.creditsPerMinute) {
        throw this.refusal("request_exceeds_minute_limit");
      }
      this.mergePersistedAccounting();
      if (
        this.plan.creditsPerDay !== null &&
        this.dayCredits + requested > this.plan.creditsPerDay
      ) {
        throw this.refusal("daily_limit_exhausted");
      }
      if (this.minuteCredits + requested > this.plan.creditsPerMinute) {
        const retryAfterMs =
          (this.minuteKey + 1) * this.minuteWindowMs - now;
        throw this.refusal("minute_limit_exhausted", retryAfterMs);
      }

      this.minuteCredits += requested;
      this.dayCredits += requested;
      this.persistAccounting();
      return Object.freeze({
        planId: this.plan.id,
        credits: requested,
        reservedAt: new Date(now).toISOString(),
      });
    });
  }

  reserve(credits, options = {}) {
    const mode = options.mode || "reject";
    try {
      return Promise.resolve(this.tryReserve(credits));
    } catch (error) {
      if (
        mode !== "queue" ||
        error.reason !== "minute_limit_exhausted"
      ) {
        return Promise.reject(error);
      }
      // A request that is safely queued was delayed, not refused.
      this.refusals -= 1;
      if (this.queue.length >= this.maxQueueLength) {
        return Promise.reject(this.refusal("queue_full"));
      }
      if (
        !Number.isFinite(error.retryAfterMs) ||
        error.retryAfterMs > this.maxQueueWaitMs
      ) {
        return Promise.reject(this.refusal("queue_wait_exceeded"));
      }

      return new Promise((resolve, reject) => {
        const queued = { credits, resolve, reject, timer: null };
        queued.timer = this.setTimer(() => {
          this.queue = this.queue.filter((entry) => entry !== queued);
          try {
            resolve(this.tryReserve(credits));
          } catch (reservationError) {
            reject(reservationError);
          }
        }, error.retryAfterMs);
        this.queue.push(queued);
      });
    }
  }

  snapshot() {
    return this.withAccountingLock(() => {
      this.refresh();
      this.mergePersistedAccounting();
      return {
        planId: this.plan.id,
        limits: {
          creditsPerMinute: this.plan.creditsPerMinute,
          creditsPerDay: this.plan.creditsPerDay,
        },
        accounting: {
          minuteCreditsReserved: this.minuteCredits,
          dayCreditsReserved: this.dayCredits,
          minuteCreditsRemaining:
            this.plan.creditsPerMinute - this.minuteCredits,
          dayCreditsRemaining:
            this.plan.creditsPerDay === null
              ? null
              : this.plan.creditsPerDay - this.dayCredits,
          queueDepth: this.queue.length,
          refusals: this.refusals,
        },
      };
    });
  }
}

const activeRuntime = resolveTwelveDataGovernorRuntime();
const activeGovernor = activeRuntime.enabled
  ? new TwelveDataCreditGovernor({
    storagePath: activeRuntime.storagePath,
  })
  : null;

function shouldBypassForDeterministicTests() {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.TWELVE_DATA_CREDIT_GOVERNOR_TEST_ENFORCE !== "true"
  );
}

async function reserveTwelveDataCredits(endpoint, options = {}) {
  const credits = TWELVE_DATA_CREDIT_WEIGHTS[endpoint];
  if (!credits) {
    throw new Error(`Unknown Twelve Data credit weight: ${endpoint}`);
  }
  if (shouldBypassForDeterministicTests()) {
    return Object.freeze({
      planId: BASIC_PLAN_ID,
      credits,
      deterministicTestBypass: true,
    });
  }
  if (!activeRuntime.enabled || !activeGovernor) {
    return Promise.reject(
      new TwelveDataCreditBudgetError(activeRuntime.reason)
    );
  }
  return activeGovernor.reserve(credits, options);
}

function getTwelveDataCreditSnapshot() {
  const accounting = activeGovernor
    ? activeGovernor.snapshot().accounting
    : {
      minuteCreditsReserved: 0,
      dayCreditsReserved: 0,
      minuteCreditsRemaining:
        TWELVE_DATA_PLAN_PRESETS[BASIC_PLAN_ID].creditsPerMinute,
      dayCreditsRemaining:
        TWELVE_DATA_PLAN_PRESETS[BASIC_PLAN_ID].creditsPerDay,
      queueDepth: 0,
      refusals: 0,
    };

  return {
    planId: BASIC_PLAN_ID,
    limits: {
      creditsPerMinute:
        TWELVE_DATA_PLAN_PRESETS[BASIC_PLAN_ID].creditsPerMinute,
      creditsPerDay:
        TWELVE_DATA_PLAN_PRESETS[BASIC_PLAN_ID].creditsPerDay,
    },
    coordination: {
      mode: activeRuntime.mode,
      enabled: activeRuntime.enabled,
      durableLedger: activeRuntime.durableLedger,
      singleInstanceAcknowledged:
        activeRuntime.singleInstanceAcknowledged,
      multiInstanceSafe: activeRuntime.multiInstanceSafe,
      reason: activeRuntime.reason,
    },
    accounting,
  };
}

module.exports = {
  BASIC_PLAN_ID,
  COORDINATION_MODES,
  TWELVE_DATA_CREDIT_WEIGHTS,
  TWELVE_DATA_PLAN_PRESETS,
  TwelveDataCreditBudgetError,
  TwelveDataCreditGovernor,
  getTwelveDataCreditSnapshot,
  resolveTwelveDataGovernorRuntime,
  reserveTwelveDataCredits,
};
