"use strict";

const RPC_NAMES = Object.freeze({
  policy: "create_personal_risk_policy_version",
  schedule: "create_broker_cost_schedule_version",
  equity: "create_broker_equity_snapshot",
});

const OPERATION_TABLES = Object.freeze({
  POLICY_VERSION: "personal_risk_policy_versions",
  COST_SCHEDULE: "broker_cost_schedule_versions",
  EQUITY_SNAPSHOT: "broker_equity_snapshots",
});

const POLICY_ARGUMENTS = Object.freeze({
  p_max_planned_loss_per_position_pct: "0.500000",
  p_max_aggregate_open_planned_loss_pct: "2.000000",
  p_daily_realized_gross_loss_limit_pct: "1.000000",
  p_weekly_realized_gross_loss_limit_pct: "2.500000",
  p_maximum_concurrent_open_positions: 5,
  p_estimated_exit_slippage_bps: "25.0000",
});

const SCHEDULE_ARGUMENTS = Object.freeze({
  p_effective_from: "2026-09-19",
  p_evidence_reference: "saxo-owner-evidence://mena-classic/trade-ticket/2026-09-19",
  p_evidence_captured_at: "2026-09-19T02:00:43+05:00",
  p_broker_source_reference: "saxo-owner-evidence://mena-classic/trade-ticket/2026-09-19",
  p_sec_source_reference: "https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2",
  p_finra_source_reference: "https://www.finra.org/sites/default/files/2024-11/sr-finra-2024-019.pdf",
  p_allowance_approval_reference: "founder-approval://azalens/personal-risk-contract/2026-09-19",
});

const SCHEDULE_CONTRACT = Object.freeze({
  brokerLegalEntity: "Saxo Bank",
  finraSourceEffectiveFrom: "2026-01-01",
});

const EQUITY_CONSTANTS = Object.freeze({
  currency: "USD",
  brokerIdentifier: "Saxo MENA",
  confirmationMethod: "OWNER_CONFIRMED_BROKER_VALUE",
});

const EXPECTED_COMPONENTS = Object.freeze([
  "CLOSE_COMMISSION",
  "FINRA_TAF_REFERENCE",
  "REGULATORY_ALLOWANCE",
  "SEC_REFERENCE",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const TEXT_CASTS = Object.freeze({
  policy: "id,version_no_text:version_no::text,portfolio_value_basis,max_planned_loss_per_position_pct_text:max_planned_loss_per_position_pct::text,max_aggregate_open_planned_loss_pct_text:max_aggregate_open_planned_loss_pct::text,daily_realized_gross_loss_limit_pct_text:daily_realized_gross_loss_limit_pct::text,weekly_realized_gross_loss_limit_pct_text:weekly_realized_gross_loss_limit_pct::text,maximum_concurrent_open_positions_text:maximum_concurrent_open_positions::text,period_timezone,estimated_exit_slippage_bps_text:estimated_exit_slippage_bps::text,created_at",
  schedule: "id,version_no_text:version_no::text,broker_legal_entity,pricing_tier,account_currency,instrument_scope,effective_from,effective_through,maximum_modeled_sell_proceeds_text:maximum_modeled_sell_proceeds::text,maximum_modeled_exit_quantity_text:maximum_modeled_exit_quantity::text,evidence_reference,evidence_captured_at,created_at",
  component: "id,schedule_id,component_code,evidence_class,application_mode,proceeds_rate_text:proceeds_rate::text,quantity_rate_text:quantity_rate::text,minimum_amount_text:minimum_amount::text,maximum_amount_text:maximum_amount::text,fixed_amount_text:fixed_amount::text,source_authority,source_reference,source_effective_from,evidence_limitations",
  equity: "id,account_equity_text:account_equity::text,currency,broker_identifier,confirmation_method,confirmation_reference,observed_at,recorded_at",
  basis: "id,period_start,basis_sequence_text:basis_sequence::text,period_timezone,source_snapshot_id,previous_basis_id,effective_equity_text:effective_equity::text,currency,recorded_at",
});

class PersonalRiskError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireContext(db, userId) {
  if (!db || typeof db.rpc !== "function" || typeof db.from !== "function" || !userId) {
    throw new PersonalRiskError("PERSONAL_RISK_UNAVAILABLE");
  }
}

function mapDatabaseError(error) {
  if (!error) return;
  const mapped = {
    "23505": "IDEMPOTENCY_CONFLICT",
    "22003": "NUMERIC_PRECISION_INVALID",
    "22023": "PERSONAL_RISK_INPUT_INVALID",
    "42501": "PERSONAL_RISK_FORBIDDEN",
  }[error.code] || "PERSONAL_RISK_UNAVAILABLE";
  throw new PersonalRiskError(mapped);
}

function requireOneRow(data) {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== "object") {
    throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
  }
  return data[0];
}

function requireUuid(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
  return value;
}

function requireCanonical(value, pattern = DECIMAL_PATTERN) {
  if (typeof value !== "string" || !pattern.test(value)) throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
  return value;
}

function restoreTextCasts(row, decimalFields = [], integerFields = []) {
  if (!row) return null;
  const result = { ...row };
  for (const field of decimalFields) {
    const alias = `${field}_text`;
    result[field] = result[alias] === null ? null : requireCanonical(result[alias]);
    delete result[alias];
  }
  for (const field of integerFields) {
    const alias = `${field}_text`;
    result[field] = result[alias] === null ? null : requireCanonical(result[alias], INTEGER_PATTERN);
    delete result[alias];
  }
  return result;
}

function requireMutationIds(row, fields) {
  if (typeof row.replayed !== "boolean") throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
  return { ids: fields.map((field) => requireUuid(row[field])), replayed: row.replayed };
}

async function invoke(db, name, args) {
  const { data, error } = await db.rpc(name, args);
  mapDatabaseError(error);
  return requireOneRow(data);
}

async function rows(query) {
  const { data, error } = await query;
  mapDatabaseError(error);
  if (!Array.isArray(data)) throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
  return data;
}

async function exactlyOne(query) {
  return requireOneRow(await rows(query));
}

async function zeroOrOne(query) {
  const data = await rows(query);
  if (data.length > 1) throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
  return data[0] || null;
}

async function createPolicy({ db, userId, idempotencyKey }) {
  requireContext(db, userId);
  const rpcRow = await invoke(db, RPC_NAMES.policy, {
    p_client_idempotency_key: idempotencyKey,
    ...POLICY_ARGUMENTS,
  });
  const { ids: [id], replayed } = requireMutationIds(rpcRow, ["policy_version_id"]);
  const row = restoreTextCasts(await exactlyOne(db.from(OPERATION_TABLES.POLICY_VERSION)
    .select("id,version_no_text:version_no::text").eq("user_id", userId).eq("id", id).limit(2)), [], ["version_no"]);
  return { policyVersionId: requireUuid(row.id), versionNo: row.version_no, replayed };
}

async function createSchedule({ db, userId, idempotencyKey }) {
  requireContext(db, userId);
  const rpcRow = await invoke(db, RPC_NAMES.schedule, {
    p_idempotency_key: idempotencyKey,
    ...SCHEDULE_ARGUMENTS,
  });
  const { ids: [id], replayed } = requireMutationIds(rpcRow, ["schedule_version_id"]);
  const row = restoreTextCasts(await exactlyOne(db.from(OPERATION_TABLES.COST_SCHEDULE)
    .select("id,version_no_text:version_no::text,broker_legal_entity").eq("user_id", userId).eq("id", id).limit(2)), [], ["version_no"]);
  if (row.broker_legal_entity !== SCHEDULE_CONTRACT.brokerLegalEntity) {
    throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
  }
  return { scheduleVersionId: requireUuid(row.id), versionNo: row.version_no, replayed };
}

function newYorkPeriods(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const utc = new Date(`${day}T00:00:00Z`);
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - weekday + 1);
  return { day, week: utc.toISOString().slice(0, 10) };
}

async function latestBasis(db, userId, table, periodStart) {
  const row = await zeroOrOne(db.from(table)
    .select(TEXT_CASTS.basis)
    .eq("user_id", userId).eq("currency", "USD").eq("period_start", periodStart)
    .order("basis_sequence", { ascending: false }).limit(1));
  return restoreTextCasts(row, ["effective_equity"], ["basis_sequence"]);
}

function decimalLess(left, right) {
  const scaled = (text) => {
    requireCanonical(text);
    const [whole, fraction = ""] = text.split(".");
    if (fraction.length > 8) throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
    return BigInt(whole + fraction.padEnd(8, "0"));
  };
  return scaled(left) < scaled(right);
}

async function createEquity({ db, userId, idempotencyKey, accountEquity, observedAt, basisTighteningConfirmed }) {
  requireContext(db, userId);
  const periods = newYorkPeriods(new Date(observedAt));
  const [daily, weekly] = await Promise.all([
    latestBasis(db, userId, "daily_risk_equity_bases", periods.day),
    latestBasis(db, userId, "weekly_risk_equity_bases", periods.week),
  ]);
  const tightens = [daily, weekly].some((basis) => basis && decimalLess(accountEquity, basis.effective_equity));
  if (tightens && !basisTighteningConfirmed) throw new PersonalRiskError("PERSONAL_RISK_INPUT_INVALID");
  const compact = observedAt.replace(/[-:]/g, "").replace(".000Z", "Z");
  const rpcRow = await invoke(db, RPC_NAMES.equity, {
    p_client_idempotency_key: idempotencyKey,
    p_account_equity: accountEquity,
    p_currency: EQUITY_CONSTANTS.currency,
    p_broker_identifier: EQUITY_CONSTANTS.brokerIdentifier,
    p_confirmation_method: EQUITY_CONSTANTS.confirmationMethod,
    p_confirmation_reference: `saxo-owner-evidence://account-summary/${compact}`,
    p_observed_at: observedAt,
  });
  const { ids: [snapshotId, dailyId, weeklyId], replayed } = requireMutationIds(rpcRow,
    ["equity_snapshot_id", "daily_basis_id", "weekly_basis_id"]);
  const [dailyRow, weeklyRow] = await Promise.all([
    exactlyOne(db.from("daily_risk_equity_bases").select("id,source_snapshot_id,effective_equity_text:effective_equity::text")
      .eq("user_id", userId).eq("id", dailyId).eq("source_snapshot_id", snapshotId).limit(2)),
    exactlyOne(db.from("weekly_risk_equity_bases").select("id,source_snapshot_id,effective_equity_text:effective_equity::text")
      .eq("user_id", userId).eq("id", weeklyId).eq("source_snapshot_id", snapshotId).limit(2)),
  ]);
  const dailyReadback = restoreTextCasts(dailyRow, ["effective_equity"]);
  const weeklyReadback = restoreTextCasts(weeklyRow, ["effective_equity"]);
  return { equitySnapshotId: snapshotId, dailyBasisId: requireUuid(dailyReadback.id), weeklyBasisId: requireUuid(weeklyReadback.id),
    dailyEffectiveEquity: dailyReadback.effective_equity, weeklyEffectiveEquity: weeklyReadback.effective_equity, replayed };
}

async function resolvePending({ db, userId, operation, idempotencyKey }) {
  if (!operation) return null;
  const table = OPERATION_TABLES[operation];
  if (!table) throw new PersonalRiskError("PERSONAL_RISK_INPUT_INVALID");
  const columns = operation === "EQUITY_SNAPSHOT" ? "id" : "id,version_no_text:version_no::text";
  const row = await zeroOrOne(db.from(table).select(columns).eq("user_id", userId)
    .eq("client_idempotency_key", idempotencyKey).limit(2));
  if (!row) return { operation, state: "NOT_FOUND" };
  requireUuid(row.id);
  if (operation === "POLICY_VERSION") return { operation, state: "COMMITTED", policyVersionId: row.id, versionNo: requireCanonical(row.version_no_text, INTEGER_PATTERN), replayed: true };
  if (operation === "COST_SCHEDULE") return { operation, state: "COMMITTED", scheduleVersionId: row.id, versionNo: requireCanonical(row.version_no_text, INTEGER_PATTERN), replayed: true };
  const [daily, weekly] = await Promise.all([
    exactlyOne(db.from("daily_risk_equity_bases").select("id,effective_equity_text:effective_equity::text").eq("user_id", userId).eq("source_snapshot_id", row.id).limit(2)),
    exactlyOne(db.from("weekly_risk_equity_bases").select("id,effective_equity_text:effective_equity::text").eq("user_id", userId).eq("source_snapshot_id", row.id).limit(2)),
  ]);
  return { operation, state: "COMMITTED", equitySnapshotId: row.id, dailyBasisId: requireUuid(daily.id),
    weeklyBasisId: requireUuid(weekly.id), dailyEffectiveEquity: requireCanonical(daily.effective_equity_text),
    weeklyEffectiveEquity: requireCanonical(weekly.effective_equity_text), replayed: true };
}

async function getStatus({ db, userId, observedAt, operation, idempotencyKey }) {
  requireContext(db, userId);
  const instant = new Date(observedAt);
  const periods = newYorkPeriods(instant);
  const nyDay = periods.day;
  const [policy, schedule, equity, dailyBasis, weeklyBasis, pendingIntent] = await Promise.all([
    zeroOrOne(db.from("personal_risk_policy_versions").select(TEXT_CASTS.policy).eq("user_id", userId).order("version_no", { ascending: false }).limit(1)),
    zeroOrOne(db.from("broker_cost_schedule_versions").select(TEXT_CASTS.schedule).eq("user_id", userId).lte("effective_from", nyDay).or(`effective_through.is.null,effective_through.gte.${nyDay}`).order("version_no", { ascending: false }).limit(1)),
    zeroOrOne(db.from("broker_equity_snapshots").select(TEXT_CASTS.equity).eq("user_id", userId).order("recorded_at", { ascending: false }).order("id", { ascending: false }).limit(1)),
    latestBasis(db, userId, "daily_risk_equity_bases", periods.day),
    latestBasis(db, userId, "weekly_risk_equity_bases", periods.week),
    resolvePending({ db, userId, operation, idempotencyKey }),
  ]);
  let costSchedule = null;
  if (schedule) {
    if (schedule.broker_legal_entity !== SCHEDULE_CONTRACT.brokerLegalEntity) {
      throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
    }
    const { data, error } = await db.from("broker_cost_schedule_components")
      .select(TEXT_CASTS.component)
      .eq("user_id", userId).eq("schedule_id", schedule.id).order("component_code", { ascending: true });
    mapDatabaseError(error);
    const codes = (data || []).map((row) => row.component_code);
    if (JSON.stringify(codes) !== JSON.stringify(EXPECTED_COMPONENTS)) {
      throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
    }
    const finra = data.find((row) => row.component_code === "FINRA_TAF_REFERENCE");
    if (finra.source_effective_from !== SCHEDULE_CONTRACT.finraSourceEffectiveFrom) {
      throw new PersonalRiskError("PERSONAL_RISK_RESPONSE_INVALID");
    }
    costSchedule = { ...restoreTextCasts(schedule, ["maximum_modeled_sell_proceeds", "maximum_modeled_exit_quantity"], ["version_no"]),
      components: data.map((row) => restoreTextCasts(row, ["proceeds_rate", "quantity_rate", "minimum_amount", "maximum_amount", "fixed_amount"])) };
  }
  return {
    observation: { instant: observedAt, newYorkDate: periods.day, newYorkWeek: periods.week },
    policyVersion: restoreTextCasts(policy, ["max_planned_loss_per_position_pct", "max_aggregate_open_planned_loss_pct", "daily_realized_gross_loss_limit_pct", "weekly_realized_gross_loss_limit_pct", "estimated_exit_slippage_bps"], ["version_no", "maximum_concurrent_open_positions"]),
    costSchedule, equitySnapshot: restoreTextCasts(equity, ["account_equity"]),
    dailyBasis, weeklyBasis,
    bootstrapComplete: Boolean(policy && costSchedule && equity && dailyBasis && weeklyBasis),
    pendingIntent,
  };
}

module.exports = {
  EQUITY_CONSTANTS, EXPECTED_COMPONENTS, OPERATION_TABLES, POLICY_ARGUMENTS, RPC_NAMES,
  SCHEDULE_ARGUMENTS, SCHEDULE_CONTRACT, PersonalRiskError, createEquity, createPolicy, createSchedule,
  getStatus, mapDatabaseError, newYorkPeriods,
};
