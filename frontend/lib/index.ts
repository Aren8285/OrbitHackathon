/**
 * Public frontend library surface for RiskOps.
 *
 * Import from '@/lib' in Next.js app and component code. All network access
 * goes through `api` (legacy, page-friendly shape) or the module objects
 * (`assets`, `risk`, ...) — neither duplicates response data or formulas.
 */

// ---------------------------------------------------------------------------
// fetch / error helpers
// ---------------------------------------------------------------------------

export {
  apiFetch,
  apiFetchJson,
  fetchWithBackoff,
  mapApiError,
  type ApiFetchOptions,
  type ApiErrorPayload,
} from './api-client-error';

// ---------------------------------------------------------------------------
// module objects (mirror backend routers)
// ---------------------------------------------------------------------------

export {
  assets,
  controls,
  vulnerabilities,
  findings,
  risk,
  assumptions,
  simulation,
  optimizer,
  remediation,
  ai,
  health,
} from './api-client';
export type { HealthStatusRuntime } from './api-client';

// ---------------------------------------------------------------------------
// runtime response types (mirror the backend OpenAPI schema)
// ---------------------------------------------------------------------------

export type {
  AssetRuntime,
  AssetCreateRuntime,
  ControlRuntime,
  ControlCreateRuntime,
  ControlCostRuntime,
  VulnerabilityRuntime,
  VulnerabilityCreateRuntime,
  FindingSummaryRuntime,
  FindingRankingRuntime,
  AssetRiskRankingRuntime,
  RiskSummaryRuntime,
  ImpactAssumptionRuntime,
  ImpactAssumptionUpdateRuntime,
  SimulationRequestRuntime,
  SimulationResultRuntime,
  ControlRecommendationRuntime,
  OptimizerRecommendationRuntime,
  OptimizerRecommendationRequestRuntime,
  RemediationPlanRuntime,
  RemediationPlanItemRuntime,
  RemediationTaskRuntime,
  RemediationTaskStatus,
  RemediationTaskUpdatePayload,
  RemediationImpactRuntime,
  RemediationLossRangeRuntime,
  CopilotMetricsRuntime,
  CopilotTopRiskRuntime,
  CopilotRecommendationRuntime,
  AiExplainResponseRuntime,
} from './api-client-types';
export type { AiExplanationRuntime } from './api-client';

import {
  ai as _aiMod,
  assets as _assetsMod,
  assumptions as _assumptionsMod,
  findings as _findingsMod,
  health as _healthMod,
  optimizer as _optimizerMod,
  remediation as _remediationMod,
  risk as _riskMod,
  simulation as _simulationMod,
  vulnerabilities as _vulnsMod,
} from './api-client';
import type {
  RemediationTaskStatus,
} from './api-client-types';
import type {
  FindingSummaryRuntime,
  OptimizerRecommendationRequestRuntime,
  RemediationPlanItemRuntime,
} from './api-client-types';

// ---------------------------------------------------------------------------
// page-facing aliases (names the UI has always imported)
// ---------------------------------------------------------------------------

export type SimulationRequest = import('./api-client-types').SimulationRequestRuntime;
export type SimulationResult = import('./api-client-types').SimulationResultRuntime;
export type Finding = FindingSummaryRuntime;
export type OptimizerRecommendationRequest = OptimizerRecommendationRequestRuntime;

/** Flat control cost/category lookup used by the remediation UI. */
export type Control = {
  control_id: string;
  control_name: string;
  category: string | null;
  control_category?: string | null;
  cost_inr: number;
};

/** GET /health response shape. */
export type HealthStatus = {
  status: string;
  database: string;
  assets: number;
  vulnerabilities: number;
  controls: number;
  version: string;
};

/** One optimizer table row (legacy UI shape, mapped from the backend row). */
export type Recommendation = {
  control_id: string;
  control_name: string;
  category: string | null;
  priority_rank: number;
  rationale: string;
  cost_inr: number;
  effectiveness: number;
  benefit_per_rupee: number | null;
  residual_loss_reduction_inr: number;
  combined_after: number;
  cumulative_cost_inr: number;
};

/** One remediation plan row (legacy UI shape, mapped from the backend row). */
export type PlanItem = Omit<RemediationPlanItemRuntime, 'control'> & {
  control: RemediationPlanItemRuntime['control'] & {
    control_category?: string | null;
  };
  covered_cost: number;
};

// ---------------------------------------------------------------------------
// `api` — the aggregate object the pages call
// ---------------------------------------------------------------------------

export const api: {
  health: { get: () => Promise<HealthStatus> };
  assets: {
    list: (limit?: number) => Promise<import('./api-client-types').AssetRuntime[]>;
    get: (assetId: string) => Promise<import('./api-client-types').AssetRuntime>;
  };
  controls: {
    list: () => Promise<Array<Control>>;
    cost: () => Promise<Array<Control>>;
  };
  vulnerabilities: {
    list: () => Promise<import('./api-client-types').VulnerabilityRuntime[]>;
  };
  risk: {
    summary: () => Promise<import('./api-client-types').RiskSummaryRuntime>;
    assetRankings: () => Promise<Array<import('./api-client-types').AssetRiskRankingRuntime>>;
  };
  findingRankings: {
    list: (openOnly?: boolean) => Promise<Array<import('./api-client-types').FindingRankingRuntime>>;
  };
  assumptions: {
    list: () => Promise<Array<import('./api-client-types').ImpactAssumptionRuntime>>;
    get: (assetId: string) => Promise<import('./api-client-types').ImpactAssumptionRuntime>;
    update: (
      assetId: string,
      payload: import('./api-client-types').ImpactAssumptionUpdateRuntime,
    ) => Promise<import('./api-client-types').ImpactAssumptionRuntime>;
  };
  simulation: {
    run: (
      payload: SimulationRequest,
    ) => Promise<import('./api-client-types').SimulationResultRuntime>;
    // GET /simulation/assets/{id} returns schemas.SimulationResult at the root.
    asset: (assetId: string) => Promise<import('./api-client-types').SimulationResultRuntime>;
  };
  optimizer: {
    list: (payload: OptimizerRecommendationRequest) => Promise<Array<Recommendation>>;
    full: (
      payload: OptimizerRecommendationRequest,
    ) => Promise<import('./api-client-types').OptimizerRecommendationRuntime>;
  };
  remediation: {
    plan: () => Promise<Array<PlanItem>>;
    costs: () => Promise<Array<Control>>;
    tasks: () => Promise<Array<import('./api-client-types').RemediationTaskRuntime>>;
    updateTask: (
      controlKey: string,
      status: import('./api-client-types').RemediationTaskStatus,
    ) => Promise<import('./api-client-types').RemediationTaskRuntime>;
    impact: () => Promise<import('./api-client-types').RemediationImpactRuntime>;
  };
  ai: {
    explain: () => Promise<import('./api-client-types').AiExplainResponseRuntime>;
  };
} = {
  health: {
    get: () => _healthMod.get(),
  },
  assets: {
    list: (limit?: number) => _assetsMod.list(limit != null ? { limit } : undefined),
    get: (assetId) => _assetsMod.get(assetId),
  },
  controls: {
    list: () => _remediationMod.costs().then((rows) => rows.map(controlFromCostRow)),
    cost: () => _remediationMod.costs(),
  },
  vulnerabilities: {
    list: () => _vulnsMod.list(),
  },
  risk: {
    summary: () => _riskMod.summary(),
    assetRankings: () => _riskMod.assetRiskRankings(),
  },
  findingRankings: {
    list: (openOnly = true) => _findingsMod.rankings.list(openOnly),
  },
  assumptions: {
    list: () => _assumptionsMod.list(),
    get: (assetId) => _assumptionsMod.get(assetId),
    update: (assetId, payload) => _assumptionsMod.update(assetId, payload),
  },
  simulation: {
    run: (payload) => _simulationMod.run(payload),
    asset: (assetId) => _simulationMod.assets.get(assetId),
  },
  optimizer: {
    list: (payload) => _optimizerMod.recommendations(payload).then((full) =>
      full.recommended_controls.map((c, i) => ({
        control_id: c.control_key,
        control_name: c.control_name,
        category: null,
        priority_rank: i + 1,
        rationale:
          `After this step cumulative cost is INR ` +
          `${c.cumulative_cost_inr.toLocaleString('en-IN')} and combined ` +
          `effectiveness reaches ${(c.combined_after * 100).toFixed(1)}%.`,
        cost_inr: c.annual_cost_inr,
        effectiveness: c.effectiveness,
        benefit_per_rupee: c.benefit_per_rupee,
        residual_loss_reduction_inr: c.marginal_benefit_inr,
        combined_after: c.combined_after,
        cumulative_cost_inr: c.cumulative_cost_inr,
      })),
    ),
    full: (payload) => _optimizerMod.recommendations(payload),
  },
  remediation: {
    plan: async () => {
      const full = await _remediationMod.plan();
      return full.plan.map((item) => ({
        ...item,
        control: {
          ...item.control,
          control_category: item.control.category,
        },
        covered_cost: item.control.cost_inr,
      }));
    },
    costs: () => _remediationMod.costs(),
    tasks: () => _remediationMod.tasks(),
    updateTask: (controlKey, status) => _remediationMod.updateTask(controlKey, status),
    impact: () => _remediationMod.impact(),
  },
  ai: {
    explain: () => _aiMod.explain(),
  },
};

function controlFromCostRow(row: {
  control_id: string;
  control_name: string;
  category: string;
  cost_inr: number;
}): Control {
  return {
    control_id: row.control_id,
    control_name: row.control_name,
    category: row.category,
    control_category: row.category,
    cost_inr: row.cost_inr,
  };
}

// ---------------------------------------------------------------------------
// formatting helpers
// ---------------------------------------------------------------------------

export {
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  severityLevel,
  severityLabel,
  severityColor,
  severityBadge,
  severityDot,
  priorityColor,
  controlShortName,
  chartSeriesLabel,
  inrSuffix,
  rupeeSymbol,
  type CurrencyOpts,
  type SeverityLevel,
} from './format';
