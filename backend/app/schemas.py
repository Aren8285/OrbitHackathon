import re

from datetime import date
from typing import Dict, List, Optional, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

VULN_STATUSES = {'open', 'accepted', 'mitigated', 'false_positive'}
ASSET_ID_PATTERN = r'^[A-Za-z][A-Za-z0-9._-]{0,49}$'
CVE_PATTERN = r'^CVE-\d{4}-\d{4,7}$'


class StrictModel(BaseModel):
    """Base for API payloads: reject unknown/misspelled fields (e.g. `critcalaity`)."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True, extra='forbid')


# ---------------------------------------------------------------- Assets


class AssetBase(StrictModel):
    asset_id: str = Field(..., description='External asset ID, e.g. A-001')
    asset_name: str = Field(..., min_length=1, max_length=255)
    asset_type: str = Field(..., min_length=1, max_length=100)
    environment: str = Field('Production', min_length=1, max_length=50)
    owner: Optional[str] = Field(None, max_length=255)
    business_unit: Optional[str] = Field(None, max_length=255)
    criticality: int = Field(..., ge=1, le=10)
    data_classification: str = Field('Internal', min_length=1, max_length=50)
    internet_facing: bool = False
    revenue_dependency: int = Field(1, ge=1, le=10)
    operational_impact: int = Field(1, ge=1, le=10)
    compliance_impact: int = Field(1, ge=1, le=10)

    @field_validator('asset_id')
    @classmethod
    def check_asset_id(cls, value: str) -> str:
        if not re.match(ASSET_ID_PATTERN, value):
            raise ValueError('asset_id must start with a letter and use only letters, digits, . _ - (max 50 chars)')
        return value


class AssetCreate(AssetBase):
    pass


class AssetOut(AssetBase):
    priority_label: str = 'P3'
    id: int


# ---------------------------------------------------------------- Vulnerabilities


class VulnerabilityBase(StrictModel):
    asset_id: str = Field(..., description='External asset ID, e.g. A-001')
    cve_id: str = Field(..., min_length=9, max_length=50)
    title: str = Field(..., min_length=1, max_length=255)
    cvss_score: float = Field(..., ge=0.0, le=10.0)
    epss_score: float = Field(..., ge=0.0, le=1.0)
    is_kev: bool = False
    patch_available: bool = True
    patch_age_days: int = Field(0, ge=0, le=3650)
    status: str = 'open'

    @field_validator('cve_id')
    @classmethod
    def check_cve(cls, value: str) -> str:
        if not re.match(CVE_PATTERN, value):
            raise ValueError("cve_id must look like CVE-YYYY-NNNN (e.g. CVE-2024-1234)")
        return value.upper()

    @field_validator('status')
    @classmethod
    def check_status(cls, value: str) -> str:
        if value not in VULN_STATUSES:
            raise ValueError(f'status must be one of {sorted(VULN_STATUSES)}')
        return value


class VulnerabilityCreate(VulnerabilityBase):
    pass


class VulnerabilityOut(VulnerabilityBase):
    id: int
    priority_label: str = 'P3'
    priority_score: float = 0


# ---------------------------------------------------------------- Controls


class ControlBase(StrictModel):
    control_key: str = Field(..., min_length=1, max_length=100)
    control_name: str = Field(..., min_length=1, max_length=255)
    category: str = Field('technical', min_length=1, max_length=100)
    coverage: float = Field(0.0, ge=0.0, le=1.0)
    implementation_status: str = Field('none', min_length=1, max_length=50)
    eff_low: float = Field(0.0, ge=0.0, le=1.0)
    eff_likely: float = Field(0.0, ge=0.0, le=1.0)
    eff_high: float = Field(0.0, ge=0.0, le=1.0)
    annual_cost: int = Field(0, ge=0.0)

    @field_validator('control_key')
    @classmethod
    def check_key(cls, value: str) -> str:
        if not re.match(r'^[a-z0-9_]{1,100}$', value):
            raise ValueError('control_key must be snake_case (letters, digits, underscores)')
        return value

    @model_validator(mode='after')
    def check_effectiveness_range(self):
        if not (self.eff_low <= self.eff_likely <= self.eff_high):
            raise ValueError('eff_low must be <= eff_likely <= eff_high')
        return self


class ControlCreate(ControlBase):
    pass


class ControlOut(ControlBase):
    id: int


# ---------------------------------------------------------------- Import results


class ImportError_(StrictModel):
    row_number: int
    field: str
    message: str


class ImportResult(StrictModel):
    dataset: str
    rows_read: int
    created: int
    updated: int
    skipped: int


# ---------------------------------------------------------------- Legacy projections (kept for existing clients)


class ScenarioBase(BaseModel):
    name: str
    description: Optional[str] = None
    probability: float = 0.0
    impact: int = 0
    annualized_loss: int = 0


class ScenarioCreate(ScenarioBase):
    pass


class Scenario(ScenarioBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class RemediationBase(BaseModel):
    title: str
    priority: Literal['P0', 'P1', 'P2', 'P3'] = 'P3'
    estimated_cost: int = 0
    status: str = 'open'
    summary: Optional[str] = None


class RemediationCreate(RemediationBase):
    pass


class Remediation(RemediationBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class HealthStatus(BaseModel):
    status: str
    database: str
    assets: int
    vulnerabilities: int
    controls: int
    version: str


# ---------------------------------------------------------------- Remediation plan (remediation UI)


class FindingSummary(StrictModel):
    priority_label: str = 'P3'
    finding_id: int
    cve_id: str
    asset_asset_id: str
    asset_name: str
    asset_criticality: int
    asset_category: str
    title: str
    cvss: float
    kev: bool
    epss: float
    priority: float


class ControlSummary(StrictModel):
    control_id: str
    control_name: str
    category: str
    kev_relevant: bool = False
    tlp: Optional[str] = None
    cost_inr: int
    cost_note: Optional[str] = None
    effectiveness: float
    effectiveness_note: Optional[str] = None


class RemediationPlanItem(StrictModel):
    finding: FindingSummary
    control: ControlSummary


class RemediationPlan(StrictModel):
    plan: List[RemediationPlanItem]
    total_cost: int


class ControlCost(StrictModel):
    control_id: str
    control_name: str
    category: str
    cost_inr: int


# ---------------------------------------------------------------- Remediation tasks (persisted status)


TASK_STATUSES = ('open', 'in_progress', 'completed', 'verified')


class RemediationTaskUpdate(StrictModel):
    """Status change for one control's remediation task.

    extra='forbid': a misspelled field (e.g. `sttaus`) on a state-changing
    request must be rejected, not silently ignored.
    """

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True, extra='forbid')

    coverage: Optional[float] = Field(None, ge=0, le=1)
    owner: Optional[str] = Field(None, min_length=1, max_length=255)
    status: str = Field(..., description='open | in_progress | completed | verified')

    @field_validator('status')
    @classmethod
    def check_status(cls, value: str) -> str:
        if value not in TASK_STATUSES:
            raise ValueError(f'status must be one of {list(TASK_STATUSES)}')
        return value


class RemediationTaskOut(StrictModel):
    id: Optional[int] = None
    coverage: float
    priority: Literal['P0', 'P1', 'P2', 'P3']
    asset_id: str
    vulnerability_id: Optional[int] = None
    estimated_risk_reduction: int = Field(..., ge=0)
    due_date: date
    owner: str
    control_key: str
    control_name: str
    category: str
    status: str
    cost_inr: int = Field(..., ge=0)
    effectiveness: float = Field(..., ge=0, le=1)
    counts_toward_achieved_risk: bool
    updated_at: Optional[str] = None


class LossRange(StrictModel):
    """Loss is always shown as a range (P50 / P95), never one number."""

    expected_annual_loss_inr: int = Field(..., ge=0)
    p50_inr: int = Field(..., ge=0)
    p95_inr: int = Field(..., ge=0)


class RemediationImpact(StrictModel):
    """Before/after achieved-risk recalculation: only verified, implemented
    controls reduce residual loss."""

    asset_id: str
    status_counts: Dict[str, int]
    verified_controls: List[str]
    combined_effectiveness: float = Field(..., ge=0, le=1)
    excluded_completed_effectiveness: float = Field(..., ge=0, le=1)
    before: LossRange
    after: LossRange
    expected_reduction_inr: int = Field(..., ge=0)
    assumptions: Dict[str, str]


# ---------------------------------------------------------------- AI copilot (server-side LLM only)


class CopilotTopRisk(StrictModel):
    priority_label: str = 'P3'
    rank: int = Field(..., ge=1, le=100)
    asset_id: str
    cve_id: str
    title: str
    priority: float = Field(..., ge=0, le=1)
    technical_risk: float = Field(..., ge=0, le=1)
    criticality: float = Field(..., ge=0, le=1)
    fictional: bool
    data_source: str


class CopilotRecommendation(StrictModel):
    control_key: str
    control_name: str
    annual_cost_inr: int = Field(..., ge=0)
    effectiveness: float = Field(..., ge=0, le=1)
    marginal_benefit_inr: int = Field(..., ge=0)


class CopilotMetrics(StrictModel):
    """Server-computed, validated risk metrics. This is the ONLY data the
    LLM (or the deterministic fallback) ever sees or narrates."""

    total_assets: int = Field(..., ge=0)
    critical_assets: int = Field(..., ge=0)
    open_vulnerabilities: int = Field(..., ge=0)
    kev_vulnerabilities: int = Field(..., ge=0)
    assumed_exposure_inr: int = Field(..., ge=0)
    financial_note: str
    scenario_asset_id: str
    expected_annual_loss_inr: int = Field(..., ge=0)
    p50_inr: int = Field(..., ge=0)
    p95_inr: int = Field(..., ge=0)
    budget_inr: int = Field(..., ge=0)
    top_risks: List[CopilotTopRisk]
    recommendations: List[CopilotRecommendation]
    data_sources_note: str


class AiExplainResponse(StrictModel):
    explanation: str = Field(..., min_length=1)
    source: str = Field(..., description="'llm' when the provider answered, 'fallback' otherwise")
    model: str = 'template'
    fallback_reason: Optional[str] = None
    metrics: CopilotMetrics
    disclaimer: str


# ---------------------------------------------------------------- Impact assumptions (editable, labeled)


class ImpactAssumptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asset_id: str
    asset_name: str
    assumed_impact_inr: int = Field(..., ge=0, description='Assumed full-impact loss for this asset, integer INR')
    frequency_per_year: float = Field(..., ge=0, description='Assumed loss events per year (editable)')
    compromise_probability: float = Field(..., ge=0, le=1, description='Assumed chance an event compromises the asset (editable)')
    is_assumption: bool
    basis: str
    default_impact_inr: int
    criticality: float


class ImpactAssumptionUpdate(BaseModel):
    frequency_per_year: Optional[float] = Field(None, ge=0, le=50)
    compromise_probability: Optional[float] = Field(None, ge=0, le=1)
    assumed_impact_inr: Optional[int] = Field(None, ge=0, le=10_000_000_000, description='integer INR')


class RiskSummary(BaseModel):
    total_assets: int
    critical_assets: int
    open_vulnerabilities: int
    total_vulnerabilities: int
    kev_vulnerabilities: int
    assumed_exposure_inr: int
    financial_note: str


    overall_risk_score: float
    open_p0_p1_count: int
    scenario_count: int
    expected_annual_loss_inr: int
    mean: int
    p50_inr: int
    p90_inr: int
    p95_inr: int
    p99_inr: int
    histogram: List[Dict[str, int]]


class FindingRanking(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    priority_label: Literal['P0', 'P1', 'P2', 'P3']
    asset_id: str
    asset_name: str
    cve_id: str
    title: str
    status: str
    cvss_score: float
    epss_score: float
    is_kev: bool
    internet_facing: bool
    patch_age_days: int
    criticality: float
    exposure: float
    technical_risk: float
    financial_impact: float
    assumed_impact_inr: int
    priority: float
    fictional: bool
    data_source: str


class AssetRiskRanking(BaseModel):
    priority_label: Literal['P0', 'P1', 'P2', 'P3']
    asset_id: str
    asset_name: str
    criticality: float
    internet_facing: bool
    open_findings: int
    kev_findings: int
    max_technical_risk: float
    max_priority: float
    assumed_impact_inr: int


# ---------------------------------------------------------------- Simulation & optimization


class SimulationRequest(BaseModel):
    scenario_key: Optional[str] = None
    frequency_per_year: float = Field(2.0, ge=0, le=50, description='Expected loss events per year')
    compromise_probability: float = Field(0.5, ge=0.0, le=1.0)
    downtime_inr: int = Field(0, ge=0)
    recovery_inr: int = Field(0, ge=0)
    regulatory_inr: int = Field(0, ge=0)
    reputation_inr: int = Field(0, ge=0)
    severity_low_inr: Optional[int] = Field(None, ge=0)
    severity_likely_inr: Optional[int] = Field(None, ge=0)
    severity_high_inr: Optional[int] = Field(None, ge=0)
    iterations: int = Field(10_000, ge=1_000, le=50_000)
    seed: int = Field(20261027)

    @model_validator(mode='after')
    def check_severity(self):
        provided = [v for v in (self.severity_low_inr, self.severity_likely_inr, self.severity_high_inr) if v is not None]
        if provided and len(provided) != 3:
            raise ValueError('provide all of severity_low_inr, severity_likely_inr, severity_high_inr together')
        return self


class SimulationResult(BaseModel):
    mean: int
    histogram: List[Dict[str, int]]
    distribution: str
    iterations: int
    seed: int
    expected_annual_loss_inr: int
    p50_inr: int
    p95_inr: int
    p10_inr: int
    p25_inr: int
    p75_inr: int
    p90_inr: int
    p99_inr: int
    max_annual_loss_inr: int
    mean_event_severity_inr: int = 0
    expected_compromised_events: float = 0
    zero_loss_share: float
    rounding_inr: int
    reproducible: bool
    source: str
    asset_id: Optional[str] = None
    assumptions: dict


class ControlRecommendation(BaseModel):
    control_key: str
    control_name: str
    annual_cost_inr: int
    effectiveness: float
    marginal_benefit_inr: int
    benefit_per_rupee: Optional[float]
    combined_after: float
    cumulative_cost_inr: int
    residual_after_inr: int


class OptimizerRecommendation(BaseModel):
    selected_controls: List[str]
    total_cost: int
    expected_loss_before: int
    expected_loss_after: int
    percent_reduction: float
    roi: Optional[float]
    budget_inr: int
    spent_inr: int
    remaining_budget_inr: int
    inherent_loss_inr: int
    combined_before: float
    combined_after: float
    residual_before_inr: int
    residual_after_inr: int
    total_expected_reduction_inr: int
    recommended_controls: List[ControlRecommendation]
    never_exceeded_budget: bool
    asset_id: Optional[str] = None
    assumptions: dict


class RiskScenarioOut(StrictModel):
    simulation: Optional[dict] = None
    id: int
    company_id: int
    scenario_key: str
    name: str
    asset_id: str
    assumptions_note: str
    applicable_control_keys: List[str]
    frequency_low: float
    frequency_likely: float
    frequency_high: float
    compromise_probability_low: float
    compromise_probability_likely: float
    compromise_probability_high: float
    downtime_cost_low: int
    downtime_cost_likely: int
    downtime_cost_high: int
    recovery_cost_low: int
    recovery_cost_likely: int
    recovery_cost_high: int
    regulatory_cost_low: int
    regulatory_cost_likely: int
    regulatory_cost_high: int
    reputation_cost_low: int
    reputation_cost_likely: int
    reputation_cost_high: int


class OptimizerRequest(StrictModel):
    budget: int = Field(..., ge=0, validation_alias=AliasChoices('budget', 'budget_inr'))
    must_include: List[str] = Field(default_factory=list)
    exclude: List[str] = Field(default_factory=list)
    asset_id: Optional[str] = None

    @field_validator('must_include', 'exclude')
    @classmethod
    def unique_keys(cls, value):
        if len(value) != len(set(value)):
            raise ValueError('Control keys must be unique')
        return value


class AiStatus(BaseModel):
    provider: str
    key_present: bool
    configured_chain: List[str]
    available_models: List[str]
    last_used_model: Optional[str] = None
