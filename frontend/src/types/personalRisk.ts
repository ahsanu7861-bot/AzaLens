import type { PersonalRiskOperation } from "../lib/personalRiskPendingIntent";

export type RiskPolicyVersion = {
  id: string; version_no: string; portfolio_value_basis: string;
  max_planned_loss_per_position_pct: string; max_aggregate_open_planned_loss_pct: string;
  daily_realized_gross_loss_limit_pct: string; weekly_realized_gross_loss_limit_pct: string;
  maximum_concurrent_open_positions: string; period_timezone: string;
  estimated_exit_slippage_bps: string; created_at: string;
};
export type CostComponent = {
  id: string; schedule_id: string; component_code: string; evidence_class: string;
  application_mode: string; proceeds_rate: string | null; quantity_rate: string | null;
  minimum_amount: string | null; maximum_amount: string | null; fixed_amount: string | null;
  source_authority: string; source_reference: string; source_effective_from: string;
  evidence_limitations: string;
};
export type CostSchedule = {
  id: string; version_no: string; broker_legal_entity: string; pricing_tier: string;
  account_currency: string; instrument_scope: string; effective_from: string;
  effective_through: string | null; maximum_modeled_sell_proceeds: string;
  maximum_modeled_exit_quantity: string; evidence_reference: string;
  evidence_captured_at: string; created_at: string; components: CostComponent[];
};
export type EquitySnapshot = {
  id: string; account_equity: string; currency: string; broker_identifier: string;
  confirmation_method: string; confirmation_reference: string; observed_at: string; recorded_at: string;
};
export type EquityBasis = {
  id: string; period_start: string; basis_sequence: string; period_timezone: string;
  source_snapshot_id: string; previous_basis_id: string | null; effective_equity: string;
  currency: string; recorded_at: string;
};
export type PendingResolution =
  | { operation: PersonalRiskOperation; state: "NOT_FOUND" }
  | ({ operation: PersonalRiskOperation; state: "COMMITTED"; replayed: true } & Record<string, string | boolean>);
export type PersonalRiskStatus = {
  observation: { instant: string; newYorkDate: string; newYorkWeek: string };
  policyVersion: RiskPolicyVersion | null; costSchedule: CostSchedule | null;
  equitySnapshot: EquitySnapshot | null; dailyBasis: EquityBasis | null; weeklyBasis: EquityBasis | null;
  bootstrapComplete: boolean; pendingIntent: PendingResolution | null;
};
export type MutationResult = Record<string, string | boolean> & { replayed: boolean };

export type PersonalRiskFailureCode =
  | "CLOSED_DEMO_ACCESS_REQUIRED" | "OWNER_IDENTITY_REQUIRED" | "OWNER_ORIGIN_REQUIRED"
  | "IDEMPOTENCY_CONFLICT" | "PERSONAL_RISK_INPUT_INVALID" | "NUMERIC_PRECISION_INVALID"
  | "PERSONAL_RISK_RESPONSE_INVALID" | "PERSONAL_RISK_UNAVAILABLE" | "NETWORK_AMBIGUOUS";
