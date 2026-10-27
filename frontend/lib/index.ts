/**
 * Public frontend library surface for RiskOps.
 *
 * Import from '@/lib' in Next.js app and component code.
 */

// fetch / error helpers
export { apiFetch, mapApiError, type ApiFetchOptions, type ApiErrorPayload } from './api-client-error';
export { apiFetchJson, fetchWithBackoff } from './api-client';

// server API modules (typed, mirrors backend routers)
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
} from './api-client';

// named types used across the UI
export type {
  AssetRuntime,
  AssetCreateRuntime,
  ControlRuntime,
  ControlCreateRuntime,
  ControlCostRuntime,
  VulnerabilityRuntime,
  VulnerabilityCreateRuntime,
  FindingRankingRuntime,
  FindingSummaryRuntime,
  AssetRiskRankingRuntime,
  RiskSummaryRuntime,
  ImpactAssumptionRuntime,
  ImpactAssumptionUpdateRuntime,
  SimulationRequestRuntime,
  SimulationResultRuntime,
  AssetSimulationRuntime,
  ControlRecommendationRuntime,
  OptimizerRecommendationRuntime,
  OptimizerRecommendationRequestRuntime,
  RemediationPlanRuntime,
  RemediationPlanItemRuntime,
} from './api-client-types';

// formatting helpers
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
