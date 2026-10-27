/**
 * Client-side API surface for the RiskOps UI.
 *
 * Each top-level module mirrors a backend router prefix and is typed against
 * the server's OpenAPI schema. Requests use `fetch` with a single origin
 * (`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`).
 *
 * Paths are versioned implicitly by the backend (they include the resource
 * name, e.g. `/assets`). Do not introduce ad-hoc path constants here — add a
 * named function instead, matching the router names in `backend/app/routers/`.
 */

import {
  type ApiFetchOptions,
  apiFetch,
  mapApiError,
  type ApiErrorPayload,
} from './api-client-error';

// ---------------------------------------------------------------------------
// shared runtime types (mirrors api-client-types.ts so the UI can use them
// without importing the types barrel twice)
// ---------------------------------------------------------------------------

/** Runtime shape of the server's risk summary (no hardcoded values). */
export type RiskSummaryRuntime = {
  total_assets: number;
  critical_assets: number;
  open_vulnerabilities: number;
  total_vulnerabilities: number;
  kev_vulnerabilities: number;
  assumed_exposure_inr: number;
  financial_note: string;
};

/** Runtime shape for the /simulation/run response. */
export type SimulationResultRuntime = {
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
  iterations: number;
  seed: number;
  rounding_inr: number;
  reproducible: boolean;
  source: string;
  asset_id: string | null;
  assumptions: Record<string, unknown>;
};

/** Runtime shape for optimizer recommendations. */
export type ControlRecommendationRuntime = {
  control_key: string;
  control_name: string;
  annual_cost_inr: number;
  effectiveness: number;
  marginal_benefit_inr: number;
  benefit_per_rupee: number;
  combined_after: number;
  cumulative_cost_inr: number;
  residual_after_inr: number;
};

export type OptimizerRecommendationRuntime = {
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
};

/** Runtime shape for a single remediation plan item. */
export type RemediationPlanItemRuntime = {
  finding: {
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
  };
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
};

/** Runtime shape for /remediation/plan. */
export type RemediationPlanRuntime = {
  plan: Array<RemediationPlanItemRuntime>;
  total_cost: number;
};

// ---------------------------------------------------------------------------
// module: assets
// ---------------------------------------------------------------------------

export const assets = {
  list: async (params?: { limit?: number }): Promise<Array<AssetRuntime>> => {
    const q = new URLSearchParams();
    if (params?.limit != null) {
      q.set('limit', String(params.limit));
    }
    return apiFetch<Array<AssetRuntime>>(`/assets?${q.toString()}`);
  },

  get: async (assetId: string): Promise<AssetRuntime> => {
    return apiFetch<AssetRuntime>(`/assets/${assetId}`);
  },

  create: async (payload: AssetCreateRuntime): Promise<AssetRuntime> => {
    return apiFetch<AssetRuntime>('/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};

// ---------------------------------------------------------------------------
// module: controls
// ---------------------------------------------------------------------------

export const controls = {
  list: async (): Promise<Array<ControlRuntime>> => {
    return apiFetch<Array<ControlRuntime>>('/controls');
  },

  get: async (controlKey: string): Promise<ControlRuntime> => {
    return apiFetch<ControlRuntime>(`/controls/${controlKey}`);
  },

  create: async (payload: ControlCreateRuntime): Promise<ControlRuntime> => {
    return apiFetch<ControlRuntime>('/controls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // cost/category lookup used by the remediation UI
  cost: async (): Promise<Array<ControlCostRuntime>> => {
    return apiFetch<Array<ControlCostRuntime>>('/remediation/costs');
  },
};

// ---------------------------------------------------------------------------
// module: vulnerabilities
// ---------------------------------------------------------------------------

export const vulnerabilities = {
  list: async (): Promise<Array<VulnerabilityRuntime>> => {
    return apiFetch<Array<VulnerabilityRuntime>>('/vulnerabilities');
  },

  get: async (cveId: string): Promise<VulnerabilityRuntime> => {
    return apiFetch<VulnerabilityRuntime>(`/vulnerabilities/${cveId}`);
  },

  create: async (payload: VulnerabilityCreateRuntime): Promise<VulnerabilityRuntime> => {
    return apiFetch<VulnerabilityRuntime>('/vulnerabilities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};

// ---------------------------------------------------------------------------
// module: findings (ranked open findings)
// ---------------------------------------------------------------------------

export const findings = {
  rankings: {
    list: async (
      limit?: number,
    ): Promise<Array<FindingRankingRuntime>> => {
      const q = new URLSearchParams();
      if (limit != null) {
        q.set('limit', String(limit));
      }
      return apiFetch<Array<FindingRankingRuntime>>(
        `/findings/rankings?${q.toString()}`,
      );
    },
  },
};

// ---------------------------------------------------------------------------
// module: risk
// ---------------------------------------------------------------------------

export const risk = {
  summary: async (): Promise<RiskSummaryRuntime> => {
    return apiFetch<RiskSummaryRuntime>('/risk/summary');
  },

  assetRiskRankings: async (): Promise<Array<AssetRiskRankingRuntime>> => {
    return apiFetch<Array<AssetRiskRankingRuntime>>('/risk/assets_ranked');
  },
};

// ---------------------------------------------------------------------------
// module: assumptions (impact assumptions, editable)
// ---------------------------------------------------------------------------

export const assumptions = {
  list: async (): Promise<Array<ImpactAssumptionRuntime>> => {
    return apiFetch<Array<ImpactAssumptionRuntime>>('/assumptions/impact');
  },

  get: async (assetId: string): Promise<ImpactAssumptionRuntime> => {
    return apiFetch<ImpactAssumptionRuntime>(`/assumptions/impact/${assetId}`);
  },

  update: async (
    assetId: string,
    payload: ImpactAssumptionUpdateRuntime,
  ): Promise<ImpactAssumptionRuntime> => {
    return apiFetch<ImpactAssumptionRuntime>(
      `/assumptions/impact/${assetId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
  },
};

// ---------------------------------------------------------------------------
// module: simulation
// ---------------------------------------------------------------------------

export const simulation = {
  run: async (
    payload: SimulationRequestRuntime,
  ): Promise<SimulationResultRuntime> => {
    return apiFetch<SimulationResultRuntime>('/simulation/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  assets: {
    get: async (
      assetId: string,
    ): Promise<AssetSimulationRuntime> => {
      return apiFetch<AssetSimulationRuntime>(`/simulation/assets/${assetId}`);
    },
  },
};

// ---------------------------------------------------------------------------
// module: optimizer
// ---------------------------------------------------------------------------

export const optimizer = {
  recommendations: async (
    payload: OptimizerRecommendationRequestRuntime,
  ): Promise<OptimizerRecommendationRuntime> => {
    const q = new URLSearchParams();
    q.set('budget_inr', String(payload.budget_inr));
    if (payload.asset_id) {
      q.set('asset_id', payload.asset_id);
    }
    return apiFetch<OptimizerRecommendationRuntime>(
      `/optimizer/recommendations?${q.toString()}`,
    );
  },
};

// ---------------------------------------------------------------------------
// module: remediation
// ---------------------------------------------------------------------------

export const remediation = {
  plan: async (): Promise<RemediationPlanRuntime> => {
    return apiFetch<RemediationPlanRuntime>('/remediation/plan');
  },

  costs: async (): Promise<Array<ControlCostRuntime>> => {
    return apiFetch<Array<ControlCostRuntime>>('/remediation/costs');
  },
};

// ---------------------------------------------------------------------------
// re-export the shared error + fetch helpers so pages don't import two files
// ---------------------------------------------------------------------------

export { mapApiError, type ApiErrorPayload } from './api-client-error';
