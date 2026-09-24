import axios from "axios";
import { api } from "./api";
import type { PersonalRiskOperation } from "../lib/personalRiskPendingIntent";
import type { CostComponent, CostSchedule, EquityBasis, EquitySnapshot, MutationResult, PersonalRiskFailureCode, PersonalRiskStatus, RiskPolicyVersion } from "../types/personalRisk";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const INTEGER = /^(?:0|[1-9][0-9]*)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXPECTED_COMPONENTS = ["CLOSE_COMMISSION", "FINRA_TAF_REFERENCE", "REGULATORY_ALLOWANCE", "SEC_REFERENCE"];

export class PersonalRiskClientError extends Error {
  readonly code: PersonalRiskFailureCode;
  readonly status?: number;

  constructor(code: PersonalRiskFailureCode, status?: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: string[]) {
  const record = object(value);
  if (Object.keys(record).sort().join("|") !== [...keys].sort().join("|")) invalid();
  return record;
}
function invalid(): never { throw new PersonalRiskClientError("PERSONAL_RISK_RESPONSE_INVALID", 502); }
function text(value: unknown) { if (typeof value !== "string") invalid(); return value as string; }
function uuid(value: unknown) { const result = text(value); if (!UUID.test(result)) invalid(); return result; }
function decimal(value: unknown) { const result = text(value); if (!DECIMAL.test(result)) invalid(); return result; }
function integer(value: unknown) { const result = text(value); if (!INTEGER.test(result)) invalid(); return result; }
function timestamp(value: unknown) { const result = text(value); if (!Number.isFinite(Date.parse(result))) invalid(); return result; }
function date(value: unknown) { const result = text(value); if (!DATE.test(result)) invalid(); return result; }
function nullable<T>(value: unknown, read: (input: unknown) => T) { return value === null ? null : read(value); }

function policy(value: unknown): RiskPolicyVersion {
  const r = exact(value, ["id","version_no","portfolio_value_basis","max_planned_loss_per_position_pct","max_aggregate_open_planned_loss_pct","daily_realized_gross_loss_limit_pct","weekly_realized_gross_loss_limit_pct","maximum_concurrent_open_positions","period_timezone","estimated_exit_slippage_bps","created_at"]);
  return { id: uuid(r.id), version_no: integer(r.version_no), portfolio_value_basis: text(r.portfolio_value_basis), max_planned_loss_per_position_pct: decimal(r.max_planned_loss_per_position_pct), max_aggregate_open_planned_loss_pct: decimal(r.max_aggregate_open_planned_loss_pct), daily_realized_gross_loss_limit_pct: decimal(r.daily_realized_gross_loss_limit_pct), weekly_realized_gross_loss_limit_pct: decimal(r.weekly_realized_gross_loss_limit_pct), maximum_concurrent_open_positions: integer(r.maximum_concurrent_open_positions), period_timezone: text(r.period_timezone), estimated_exit_slippage_bps: decimal(r.estimated_exit_slippage_bps), created_at: timestamp(r.created_at) };
}
function component(value: unknown): CostComponent {
  const r = exact(value, ["id","schedule_id","component_code","evidence_class","application_mode","proceeds_rate","quantity_rate","minimum_amount","maximum_amount","fixed_amount","source_authority","source_reference","source_effective_from","evidence_limitations"]);
  return { id: uuid(r.id), schedule_id: uuid(r.schedule_id), component_code: text(r.component_code), evidence_class: text(r.evidence_class), application_mode: text(r.application_mode), proceeds_rate: nullable(r.proceeds_rate, decimal), quantity_rate: nullable(r.quantity_rate, decimal), minimum_amount: nullable(r.minimum_amount, decimal), maximum_amount: nullable(r.maximum_amount, decimal), fixed_amount: nullable(r.fixed_amount, decimal), source_authority: text(r.source_authority), source_reference: text(r.source_reference), source_effective_from: date(r.source_effective_from), evidence_limitations: text(r.evidence_limitations) };
}
function schedule(value: unknown): CostSchedule {
  const r = exact(value, ["id","version_no","broker_legal_entity","pricing_tier","account_currency","instrument_scope","effective_from","effective_through","maximum_modeled_sell_proceeds","maximum_modeled_exit_quantity","evidence_reference","evidence_captured_at","created_at","components"]);
  if (!Array.isArray(r.components)) invalid();
  const components = r.components.map(component);
  if (JSON.stringify(components.map((item) => item.component_code)) !== JSON.stringify(EXPECTED_COMPONENTS)) invalid();
  return { id: uuid(r.id), version_no: integer(r.version_no), broker_legal_entity: text(r.broker_legal_entity), pricing_tier: text(r.pricing_tier), account_currency: text(r.account_currency), instrument_scope: text(r.instrument_scope), effective_from: date(r.effective_from), effective_through: nullable(r.effective_through, date), maximum_modeled_sell_proceeds: decimal(r.maximum_modeled_sell_proceeds), maximum_modeled_exit_quantity: decimal(r.maximum_modeled_exit_quantity), evidence_reference: text(r.evidence_reference), evidence_captured_at: timestamp(r.evidence_captured_at), created_at: timestamp(r.created_at), components };
}
function snapshot(value: unknown): EquitySnapshot {
  const r = exact(value, ["id","account_equity","currency","broker_identifier","confirmation_method","confirmation_reference","observed_at","recorded_at"]);
  return { id: uuid(r.id), account_equity: decimal(r.account_equity), currency: text(r.currency), broker_identifier: text(r.broker_identifier), confirmation_method: text(r.confirmation_method), confirmation_reference: text(r.confirmation_reference), observed_at: timestamp(r.observed_at), recorded_at: timestamp(r.recorded_at) };
}
function basis(value: unknown): EquityBasis {
  const r = exact(value, ["id","period_start","basis_sequence","period_timezone","source_snapshot_id","previous_basis_id","effective_equity","currency","recorded_at"]);
  return { id: uuid(r.id), period_start: date(r.period_start), basis_sequence: integer(r.basis_sequence), period_timezone: text(r.period_timezone), source_snapshot_id: uuid(r.source_snapshot_id), previous_basis_id: nullable(r.previous_basis_id, uuid), effective_equity: decimal(r.effective_equity), currency: text(r.currency), recorded_at: timestamp(r.recorded_at) };
}
function pending(value: unknown) {
  if (value === null) return null;
  const r = object(value);
  if (!["POLICY_VERSION","COST_SCHEDULE","EQUITY_SNAPSHOT"].includes(String(r.operation)) || !["NOT_FOUND","COMMITTED"].includes(String(r.state))) invalid();
  if (r.state === "NOT_FOUND") { exact(value, ["operation","state"]); return { operation: r.operation as PersonalRiskOperation, state: "NOT_FOUND" as const }; }
  if (r.replayed !== true) invalid();
  const allowed = r.operation === "POLICY_VERSION" ? ["operation","state","policyVersionId","versionNo","replayed"] : r.operation === "COST_SCHEDULE" ? ["operation","state","scheduleVersionId","versionNo","replayed"] : ["operation","state","equitySnapshotId","dailyBasisId","weeklyBasisId","dailyEffectiveEquity","weeklyEffectiveEquity","replayed"];
  exact(value, allowed);
  for (const [key, item] of Object.entries(r)) {
    if (key.endsWith("Id")) uuid(item);
    if (key === "versionNo") integer(item);
    if (key.endsWith("EffectiveEquity")) decimal(item);
  }
  return r as PersonalRiskStatus["pendingIntent"];
}

export function validateStatusResponse(value: unknown): PersonalRiskStatus {
  const envelope = exact(value, ["success","data"]);
  if (envelope.success !== true) invalid();
  const r = exact(envelope.data, ["observation","policyVersion","costSchedule","equitySnapshot","dailyBasis","weeklyBasis","bootstrapComplete","pendingIntent"]);
  const observation = exact(r.observation, ["instant","newYorkDate","newYorkWeek"]);
  if (typeof r.bootstrapComplete !== "boolean") invalid();
  return { observation: { instant: timestamp(observation.instant), newYorkDate: date(observation.newYorkDate), newYorkWeek: date(observation.newYorkWeek) }, policyVersion: nullable(r.policyVersion, policy), costSchedule: nullable(r.costSchedule, schedule), equitySnapshot: nullable(r.equitySnapshot, snapshot), dailyBasis: nullable(r.dailyBasis, basis), weeklyBasis: nullable(r.weeklyBasis, basis), bootstrapComplete: r.bootstrapComplete, pendingIntent: pending(r.pendingIntent) };
}

function validateMutation(value: unknown, operation: PersonalRiskOperation): MutationResult {
  const envelope = exact(value, ["success","data"]); if (envelope.success !== true) invalid();
  const r = object(envelope.data);
  const keys = operation === "POLICY_VERSION" ? ["policyVersionId","versionNo","replayed"] : operation === "COST_SCHEDULE" ? ["scheduleVersionId","versionNo","replayed"] : ["equitySnapshotId","dailyBasisId","weeklyBasisId","dailyEffectiveEquity","weeklyEffectiveEquity","replayed"];
  exact(r, keys); if (typeof r.replayed !== "boolean") invalid();
  for (const [key, item] of Object.entries(r)) { if (key.endsWith("Id")) uuid(item); if (key === "versionNo") integer(item); if (key.endsWith("EffectiveEquity")) decimal(item); }
  return r as MutationResult;
}

function safeError(error: unknown): never {
  if (error instanceof PersonalRiskClientError) throw error;
  if (!axios.isAxiosError(error)) throw new PersonalRiskClientError("NETWORK_AMBIGUOUS");
  const status = error.response?.status;
  const rawCode = error.response?.data?.code ?? error.response?.data?.error?.code;
  const allowed: PersonalRiskFailureCode[] = ["CLOSED_DEMO_ACCESS_REQUIRED","OWNER_IDENTITY_REQUIRED","OWNER_ORIGIN_REQUIRED","IDEMPOTENCY_CONFLICT","PERSONAL_RISK_INPUT_INVALID","NUMERIC_PRECISION_INVALID","PERSONAL_RISK_RESPONSE_INVALID","PERSONAL_RISK_UNAVAILABLE"];
  const code = allowed.includes(rawCode) ? rawCode : status === 502 ? "PERSONAL_RISK_RESPONSE_INVALID" : status === 503 || !error.response ? "NETWORK_AMBIGUOUS" : "PERSONAL_RISK_UNAVAILABLE";
  throw new PersonalRiskClientError(code, status);
}

export async function getPersonalRiskStatus(options: { observedAt?: string; pending?: { operation: PersonalRiskOperation; idempotencyKey: string } } = {}) {
  try {
    const params: Record<string,string> = {}; const headers: Record<string,string> = {};
    if (options.observedAt) params.observedAt = options.observedAt;
    if (options.pending) { params.operation = options.pending.operation; headers["Idempotency-Key"] = options.pending.idempotencyKey; }
    return validateStatusResponse((await api.get("/api/personal-risk/bootstrap-status", { params, headers })).data);
  } catch (error) { return safeError(error); }
}
async function post(operation: PersonalRiskOperation, endpoint: string, idempotencyKey: string, body: object) {
  try { return validateMutation((await api.post(endpoint, body, { headers: { "Idempotency-Key": idempotencyKey } })).data, operation); }
  catch (error) { return safeError(error); }
}
export const createPolicyVersion = (key: string) => post("POLICY_VERSION", "/api/personal-risk/policy-versions", key, { confirmed: true });
export const createCostSchedule = (key: string) => post("COST_SCHEDULE", "/api/personal-risk/cost-schedules", key, { confirmed: true });
export const createEquitySnapshot = (key: string, body: { accountEquity: string; observedAt: string; accountValueConfirmed: true; basisTighteningConfirmed: boolean }) => post("EQUITY_SNAPSHOT", "/api/personal-risk/equity-snapshots", key, body);
