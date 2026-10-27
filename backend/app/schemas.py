import re

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

VULN_STATUSES = {'open', 'accepted', 'mitigated', 'false_positive'}
ASSET_ID_PATTERN = r'^[A-Za-z][A-Za-z0-9._-]{0,49}$'
CVE_PATTERN = r'^CVE-\d{4}-\d{4,7}$'


class StrictModel(BaseModel):
    """Base for API payloads: reject unknown/misspelled fields (e.g. `critcalaity`)."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


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
    annual_cost: float = Field(0.0, ge=0.0)

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
    impact: float = 0.0
    annualized_loss: float = 0.0


class ScenarioCreate(ScenarioBase):
    pass


class Scenario(ScenarioBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class RemediationBase(BaseModel):
    title: str
    priority: int = 1
    estimated_cost: float = 0.0
    status: str = 'planned'
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
    cost_inr: float
    cost_note: Optional[str] = None
    effectiveness: float
    effectiveness_note: Optional[str] = None


class RemediationPlanItem(StrictModel):
    finding: FindingSummary
    control: ControlSummary


class RemediationPlan(StrictModel):
    plan: List[RemediationPlanItem]
    total_cost: float


class ControlCost(StrictModel):
    control_id: str
    control_name: str
    category: str
    cost_inr: float


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


class FindingRanking(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    mean_event_severity_inr: int
    expected_compromised_events: float
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
    benefit_per_rupee: float
    combined_after: float
    cumulative_cost_inr: int
    residual_after_inr: int


class OptimizerRecommendation(BaseModel):
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
    asset_id: str
    assumptions: dict
