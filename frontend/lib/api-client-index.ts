/**
 * Public API surface consumed by the RiskOps UI.
 *
 * Implementations call the backend FastAPI via `fetch` with a single origin
 * (`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`). Every endpoint is
 * typed against the OpenAPI contract so the UI can't drift from the server.
 */

export type {
  ApiFetchOptions,
  AssetsListParams,
  Asset,
  AssetCreatePayload,
  AssetSummary,
  AssetsSummaryResponse,
  Control,
  ControlCostItem,
  ControlsCostResponse,
  ControlCreatePayload,
  Vulnerability,
  VulnerabilityCreatePayload,
  FindingSummary,
  FindingRanking,
  FindingRankingsResponse,
  AssetRiskRanking,
  AssetRiskRankingsResponse,
  RiskSummaryResponse,
  ImpactAssumption,
  ImpactAssumptionsResponse,
  ImpactAssumptionUpdatePayload,
  SimulationRequestPayload,
  SimulationResultPayload,
  RunSimulationResponse,
  AssetSimulationResponse,
  ControlRecommendationPayload,
  OptimizerRecommendationPayload,
  OptimizerRecommendationRequestPayload,
} from './api-client-types';

export {
  apiFetch,
  mapApiError,
  ApiError,
  type ApiFetchOptions,
  type ApiErrorPayload,
} from './api-client-error';

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
