import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, Float, ForeignKey, ForeignKeyConstraint, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship, validates

from app.database import Base
from app.money import INR

ASSET_ID_PATTERN = r'^[A-Za-z][A-Za-z0-9._-]{0,49}$'


def generate_asset_id() -> str:
    """Fallback external ID when a manually created asset has none."""
    return f'GEN-{uuid.uuid4().hex[:8].upper()}'


FINPAY_COMPANY_ID = 1


class Company(Base):
    __tablename__ = 'companies'
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True)


class CompanyOwned:
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=False, index=True, default=FINPAY_COMPANY_ID)


class Asset(CompanyOwned, Base):
    """FinPay asset inventory (demo-data/finpay_assets.csv columns)."""

    __tablename__ = 'assets'

    id = Column(Integer, primary_key=True, index=True)
    __table_args__ = (UniqueConstraint('company_id', 'asset_id'), UniqueConstraint('company_id', 'id'))
    asset_id = Column(String(50), nullable=False, index=True)  # external id, e.g. A-001
    asset_name = Column(String(255), nullable=False, index=True)
    asset_type = Column(String(100), nullable=False)
    environment = Column(String(50), nullable=False, default='Production')
    owner = Column(String(255), nullable=True)
    business_unit = Column(String(255), nullable=True)
    criticality = Column(Integer, nullable=False, default=1)  # 1-10
    data_classification = Column(String(50), nullable=False, default='Internal')
    internet_facing = Column(Boolean, nullable=False, default=False)
    revenue_dependency = Column(Integer, nullable=False, default=1)  # 1-10
    operational_impact = Column(Integer, nullable=False, default=1)  # 1-10
    compliance_impact = Column(Integer, nullable=False, default=1)  # 1-10

    vulnerabilities = relationship(
        'Vulnerability',
        back_populates='asset',
        cascade='all, delete-orphan',
        passive_deletes=True,
    )

    @property
    def name(self) -> str:
        """Backwards-compatible alias for the legacy `name` field."""
        return self.asset_name


class Vulnerability(CompanyOwned, Base):
    """One CVE finding on one asset (demo-data/finpay_vulns.csv columns).

    The same CVE may exist on many assets; the unique constraint prevents
    duplicate (asset, CVE) findings, most importantly on repeat imports.
    """

    __tablename__ = 'vulnerabilities'
    __table_args__ = (
        UniqueConstraint('company_id', 'asset_row_id', 'cve_id', name='uq_vulnerability_asset_cve'),
        UniqueConstraint('company_id', 'id'),
        ForeignKeyConstraint(['company_id', 'asset_row_id'], ['assets.company_id', 'assets.id']),
    )

    id = Column(Integer, primary_key=True, index=True)
    asset_row_id = Column(Integer, nullable=False, index=True)
    cve_id = Column(String(50), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    cvss_score = Column(Float, nullable=False, default=0.0)  # 0-10
    epss_score = Column(Float, nullable=False, default=0.0)  # 0-1
    is_kev = Column(Boolean, nullable=False, default=False)
    patch_available = Column(Boolean, nullable=False, default=True)
    patch_age_days = Column(Integer, nullable=False, default=0)
    status = Column(String(50), nullable=False, default='open')  # open|accepted|mitigated|false_positive

    asset = relationship('Asset', back_populates='vulnerabilities')

    @property
    def asset_id(self) -> str:
        """External asset ID, e.g. A-001, for API consumers."""
        return self.asset.asset_id


class Control(CompanyOwned, Base):
    """FinPay control catalog (demo-data/finpay_controls.csv columns)."""

    __tablename__ = 'controls'

    id = Column(Integer, primary_key=True, index=True)
    __table_args__ = (UniqueConstraint('company_id', 'control_key'),)
    control_key = Column(String(100), nullable=False, index=True)
    control_name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False, default='technical')
    coverage = Column(Float, nullable=False, default=0.0)  # 0-1 currently implemented
    implementation_status = Column(String(50), nullable=False, default='none')
    eff_low = Column(Float, nullable=False, default=0.0)   # 0-1
    eff_likely = Column(Float, nullable=False, default=0.0)  # 0-1
    eff_high = Column(Float, nullable=False, default=0.0)  # 0-1
    annual_cost = Column(INR, nullable=False, default=0)  # integer INR


class ImpactAssumption(CompanyOwned, Base):
    """Editable, clearly labeled financial impact assumption per asset.

    The demo CSVs carry no loss amounts, so no financial number is invented:
    scoring uses either the user-edited value or the documented default
    (asset criticality x IMPACT_REFERENCE_INR), always surfaced as an
    assumption the user can change through /assumptions/impact/{asset_id}.
    """

    __tablename__ = 'impact_assumptions'

    id = Column(Integer, primary_key=True, index=True)
    __table_args__ = (
        UniqueConstraint('company_id', 'asset_row_id'),
        ForeignKeyConstraint(['company_id', 'asset_row_id'], ['assets.company_id', 'assets.id']),
    )
    asset_row_id = Column(Integer, nullable=False, index=True)
    assumed_impact_inr = Column(INR, nullable=False)  # integer INR, editable
    frequency_per_year = Column(Float, nullable=False, default=2.0)  # editable assumption
    compromise_probability = Column(Float, nullable=False, default=0.5)  # editable assumption
    basis = Column(String(100), nullable=False, default='default')  # default|edited
    updated_at = Column(DateTime, nullable=True, onupdate=None)


class Scenario(CompanyOwned, Base):
    __tablename__ = 'scenarios'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    probability = Column(Float, default=0.0)
    impact = Column(INR, default=0)
    annualized_loss = Column(INR, default=0)


class Remediation(CompanyOwned, Base):
    __tablename__ = 'remediations'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    priority = Column(String(2), default='P3')
    estimated_cost = Column(INR, default=0)
    status = Column(String(50), default='open')
    summary = Column(Text, nullable=True)


class RemediationTask(CompanyOwned, Base):
    """Execution status for one control's remediation action.

    Statuses:
      - ``open`` / ``in_progress``: not implemented
      - ``completed``: implemented, not yet verified
      - ``verified``:  implemented AND verified in production

    Only ``verified`` tasks count toward achieved-risk calculations.
    Rows are seeded for demo controls; unseeded imports get transient task
    defaults on reads and persist them on the first explicit update.
    """

    __tablename__ = 'remediation_tasks'

    id = Column(Integer, primary_key=True, index=True)
    __table_args__ = (
        UniqueConstraint('company_id', 'control_key', 'asset_id', 'vulnerability_id'),
        ForeignKeyConstraint(['company_id', 'control_key'], ['controls.company_id', 'controls.control_key']),
        ForeignKeyConstraint(['company_id', 'asset_id'], ['assets.company_id', 'assets.asset_id']),
        ForeignKeyConstraint(['company_id', 'vulnerability_id'], ['vulnerabilities.company_id', 'vulnerabilities.id']),
        CheckConstraint("status IN ('open', 'in_progress', 'completed', 'verified')"),
        CheckConstraint("priority IN ('P0', 'P1', 'P2', 'P3')"),
        CheckConstraint('estimated_risk_reduction >= 0'),
    )
    control_key = Column(String(100), nullable=False, index=True)
    status = Column(String(20), nullable=False, default='open')
    priority = Column(String(2), nullable=False, default='P3')
    asset_id = Column(String(50), nullable=False)
    vulnerability_id = Column(Integer, nullable=True)
    estimated_risk_reduction = Column(INR, nullable=False, default=0)
    due_date = Column(Date, nullable=False)
    owner = Column(String(255), nullable=False, default='Unassigned')
    updated_at = Column(DateTime, nullable=True)


class RiskScenario(CompanyOwned, Base):
    """Explicit three-point assumptions. Costs are INR; rates are unitless."""
    __tablename__ = 'risk_scenarios'
    __table_args__ = (
        UniqueConstraint('company_id', 'scenario_key'),
        UniqueConstraint('company_id', 'id'),
        ForeignKeyConstraint(['company_id', 'asset_id'], ['assets.company_id', 'assets.asset_id']),
        *[CheckConstraint(f'0 <= {field}_low AND {field}_low <= {field}_likely AND {field}_likely <= {field}_high')
          for field in ('frequency', 'compromise_probability', 'downtime_cost', 'recovery_cost', 'regulatory_cost', 'reputation_cost')],
        CheckConstraint('compromise_probability_high <= 1'),
    )
    id = Column(Integer, primary_key=True)
    scenario_key = Column(String(100), nullable=False)
    name = Column(String(255), nullable=False)
    asset_id = Column(String(50), nullable=False)
    assumptions_note = Column(Text, nullable=False)
    applicable_control_keys = Column(JSON, nullable=False)
    frequency_low = Column(Float, nullable=False)
    frequency_likely = Column(Float, nullable=False)
    frequency_high = Column(Float, nullable=False)
    compromise_probability_low = Column(Float, nullable=False)
    compromise_probability_likely = Column(Float, nullable=False)
    compromise_probability_high = Column(Float, nullable=False)
    downtime_cost_low = Column(INR, nullable=False)
    downtime_cost_likely = Column(INR, nullable=False)
    downtime_cost_high = Column(INR, nullable=False)
    recovery_cost_low = Column(INR, nullable=False)
    recovery_cost_likely = Column(INR, nullable=False)
    recovery_cost_high = Column(INR, nullable=False)
    regulatory_cost_low = Column(INR, nullable=False)
    regulatory_cost_likely = Column(INR, nullable=False)
    regulatory_cost_high = Column(INR, nullable=False)
    reputation_cost_low = Column(INR, nullable=False)
    reputation_cost_likely = Column(INR, nullable=False)
    reputation_cost_high = Column(INR, nullable=False)


class SimulationResult(CompanyOwned, Base):
    """Storage for calculated scenario distributions, never populated by GETs."""
    __tablename__ = 'simulation_results'
    __table_args__ = (
        ForeignKeyConstraint(['company_id', 'scenario_id'], ['risk_scenarios.company_id', 'risk_scenarios.id']),
        CheckConstraint('p50_inr <= p90_inr AND p90_inr <= p95_inr AND p95_inr <= p99_inr'),
        CheckConstraint('expected_annual_loss_inr >= 0 AND p50_inr >= 0'),
        CheckConstraint('iterations > 0'),
    )
    id = Column(Integer, primary_key=True)
    scenario_id = Column(Integer, nullable=False, index=True)
    seed = Column(Integer, nullable=False, default=20261027)
    iterations = Column(Integer, nullable=False, default=10000)
    expected_annual_loss_inr = Column(INR, nullable=False)
    p50_inr = Column(INR, nullable=False)
    p90_inr = Column(INR, nullable=False)
    p95_inr = Column(INR, nullable=False)
    p99_inr = Column(INR, nullable=False)
    histogram = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
