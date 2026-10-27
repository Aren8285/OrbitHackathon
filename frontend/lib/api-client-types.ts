/**
 * Shared TypeScript shapes for the RiskOps API.
 *
 * These mirror the backend Pydantic schemas (schemas.py) so the frontend
 * never gets out of sync with the server contract. When a backend schema
 * changes, update both this file and the OpenAPI export.
 */

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

export interface AssetRuntime {
  priority_label?: 'P0' | 'P1' | 'P2' | 'P3';
  asset_id: string;
  asset_name: string;
  asset_type: string;
  environment: string;
  owner: string | null;
  business_unit: string | null;
  criticality: number;
  data_classification: string;
  internet_facing: boolean;
  revenue_dependency: number;
  operational_impact: number;
  compliance_impact: number;
  id: number;
}

export type AssetCreateRuntime = Omit<AssetRuntime, 'id'>;

// ---------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------

export interface ControlRuntime {
  control_key: string;
  control_name: string;
  category: string;
  coverage: number;
  implementation_status: string;
  eff_low: number;
  eff_likely: number;
  eff_high: number;
  annual_cost: number;
  id: number;
}

export type ControlCreateRuntime = Omit<ControlRuntime, 'id'>;

export interface ControlCostRuntime {
  control_id: string;
  control_name: string;
  category: string | null;
  cost_inr: number;
}

// ---------------------------------------------------------------------------
// vulnerabilities
// ---------------------------------------------------------------------------

export interface VulnerabilityRuntime {
  priority_label: 'P0' | 'P1' | 'P2' | 'P3';
  asset_id: string;
  cve_id: string;
  title: string;
  cvss_score: number;
  epss_score: number;
  is_kev: boolean;
  patch_available: boolean;
  patch_age_days: number;
  status: string;
  id: number;
}

export type VulnerabilityCreateRuntime = Omit<VulnerabilityRuntime, 'id'>;

// ---------------------------------------------------------------------------
// findings
// ---------------------------------------------------------------------------

export interface FindingSummaryRuntime {
  finding_id: string;
  cve_id: string;
  asset_asset_id: string;
  asset_name: string;
  asset_criticality: number;
  asset_category: string;
  title: string;
  cvss: number;
  kev: boolean;
  epss: number;
  priority: number;
}

export interface FindingRankingRuntime {
  priority_label: 'P0' | 'P1' | 'P2' | 'P3';
  asset_id: string;
  asset_name: string;
  cve_id: string;
  title: string;
  status: string;
  cvss_score: number;
  epss_score: number;
  is_kev: boolean;
  internet_facing: boolean;
  patch_age_days: number;
  criticality: number;
  exposure: number;
  technical_risk: number;
  financial_impact: number;
  assumed_impact_inr: number;
  priority: number;
  fictional: boolean;
  data_source: string;
}

// ---------------------------------------------------------------------------
// risk
// ---------------------------------------------------------------------------

export interface AssetRiskRankingRuntime {
  priority_label: 'P0' | 'P1' | 'P2' | 'P3';
  asset_id: string;
  asset_name: string;
  criticality: number;
  internet_facing: boolean;
  open_findings: number;
  kev_findings: number;
  max_technical_risk: number;
  max_priority: number;
  assumed_impact_inr: number;
}

export interface RiskSummaryRuntime {
  overall_risk_score: number;
  open_p0_p1_count: number;
  expected_annual_loss_inr: number;
  total_assets: number;
  critical_assets: number;
  open_vulnerabilities: number;
  total_vulnerabilities: number;
  kev_vulnerabilities: number;
  assumed_exposure_inr: number;
  financial_note: string;
}

// ---------------------------------------------------------------------------
// assumptions
// ---------------------------------------------------------------------------

export interface ImpactAssumptionRuntime {
  asset_id: string;
  asset_name: string;
  assumed_impact_inr: number;
  frequency_per_year: number;
  compromise_probability: number;
  is_assumption: boolean;
  basis: string;
  default_impact_inr: number;
  criticality: number;
}

export type ImpactAssumptionUpdateRuntime = {
  frequency_per_year?: number;
  compromise_probability?: number;
  assumed_impact_inr?: number;
};

// ---------------------------------------------------------------------------
// simulation
// ---------------------------------------------------------------------------

export interface SimulationRequestRuntime {
  frequency_per_year: number;
  compromise_probability: number;
  downtime_inr: number;
  recovery_inr: number;
  regulatory_inr: number;
  reputation_inr: number;
  severity_low_inr: number | null;
  severity_likely_inr: number | null;
  severity_high_inr: number | null;
  iterations: number;
  seed: number;
}

export interface SimulationResultRuntime {
  mean: number;
  histogram: Array<{low_inr: number; high_inr: number; count: number}>;
  distribution: string;
  iterations: number;
  seed: number;
  expected_annual_loss_inr: number;
  p50_inr: number;
  p95_inr: number;
  p10_inr: number;
  p25_inr: number;
  p75_inr: number;
  p90_inr: number;
  p99_inr: number;
  max_annual_loss_inr: number;
  mean_event_severity_inr: number;
  expected_compromised_events: number;
  zero_loss_share: number;
  rounding_inr: number;
  reproducible: boolean;
  source: string;
  asset_id: string | null;
  assumptions: Record<string, unknown>;
}

export interface AssetSimulationRuntime {
  asset_id: string;
  asset_name: string;
  simulation: SimulationResultRuntime;
  assumptions: ImpactAssumptionRuntime;
}

// ---------------------------------------------------------------------------
// optimizer
// ---------------------------------------------------------------------------

export interface ControlRecommendationRuntime {
  control_key: string;
  control_name: string;
  annual_cost_inr: number;
  effectiveness: number;
  marginal_benefit_inr: number;
  benefit_per_rupee: number;
  combined_after: number;
  cumulative_cost_inr: number;
  residual_after_inr: number;
}

export interface OptimizerRecommendationRuntime {
  selected_controls: string[];
  total_cost: number;
  expected_loss_before: number;
  expected_loss_after: number;
  percent_reduction: number;
  roi: number | null;
  budget_inr: number;
  spent_inr: number;
  remaining_budget_inr: number;
  inherent_loss_inr: number;
  combined_before: number;
  combined_after: number;
  residual_before_inr: number;
  residual_after_inr: number;
  total_expected_reduction_inr: number;
  recommended_controls: Array<ControlRecommendationRuntime>;
  never_exceeded_budget: boolean;
  asset_id: string;
  assumptions: Record<string, unknown>;
}

export type OptimizerRecommendationRequestRuntime = {
  budget_inr: number;
  must_include?: string[];
  exclude?: string[];
  asset_id?: string;
};

// ---------------------------------------------------------------------------
// remediation
// ---------------------------------------------------------------------------

export interface RemediationPlanRuntime {
  plan: Array<RemediationPlanItemRuntime>;
  total_cost: number;
}

export type RemediationTaskStatus = 'open' | 'in_progress' | 'completed' | 'verified';

export interface RemediationTaskRuntime {
  id: number | null;
  coverage: number;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  asset_id: string;
  vulnerability_id: number | null;
  estimated_risk_reduction: number;
  due_date: string;
  owner: string;
  control_key: string;
  control_name: string;
  category: string;
  status: RemediationTaskStatus;
  cost_inr: number;
  effectiveness: number;
  counts_toward_achieved_risk: boolean;
  updated_at: string | null;
}

export interface RemediationTaskUpdatePayload {
  status: RemediationTaskStatus;
}

export interface RemediationLossRangeRuntime {
  expected_annual_loss_inr: number;
  p50_inr: number;
  p95_inr: number;
}

export interface RemediationImpactRuntime {
  asset_id: string;
  status_counts: Record<'open' | 'in_progress' | 'completed' | 'verified', number>;
  verified_controls: Array<string>;
  combined_effectiveness: number;
  excluded_completed_effectiveness: number;
  before: RemediationLossRangeRuntime;
  after: RemediationLossRangeRuntime;
  expected_reduction_inr: number;
  assumptions: Record<string, string>;
}

// ---------------------------------------------------------------------------
// ai copilot
// ---------------------------------------------------------------------------

export interface CopilotTopRiskRuntime {
  rank: number;
  asset_id: string;
  cve_id: string;
  title: string;
  priority: number;
  technical_risk: number;
  criticality: number;
  fictional: boolean;
  data_source: string;
}

export interface CopilotRecommendationRuntime {
  control_key: string;
  control_name: string;
  annual_cost_inr: number;
  effectiveness: number;
  marginal_benefit_inr: number;
}

export interface CopilotMetricsRuntime {
  total_assets: number;
  critical_assets: number;
  open_vulnerabilities: number;
  kev_vulnerabilities: number;
  assumed_exposure_inr: number;
  financial_note: string;
  scenario_asset_id: string;
  expected_annual_loss_inr: number;
  p50_inr: number;
  p95_inr: number;
  budget_inr: number;
  top_risks: Array<CopilotTopRiskRuntime>;
  recommendations: Array<CopilotRecommendationRuntime>;
  data_sources_note: string;
}

export interface AiExplainResponseRuntime {
  explanation: string;
  source: 'llm' | 'fallback' | string;
  model: string;
  fallback_reason: string | null;
  metrics: CopilotMetricsRuntime;
  disclaimer: string;
}

export interface RemediationPlanItemRuntime {
  finding: FindingSummaryRuntime;
  control: {
    control_id: string;
    control_name: string;
    category: string | null;
    kev_relevant: boolean;
    tlp: string | null;
    cost_inr: number;
    cost_note: string | null;
    effectiveness: number;
    effectiveness_note: string | null;
  };
}
