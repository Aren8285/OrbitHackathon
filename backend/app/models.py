import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base

ASSET_ID_PATTERN = r'^[A-Za-z][A-Za-z0-9._-]{0,49}$'


def generate_asset_id() -> str:
    """Fallback external ID when a manually created asset has none."""
    return f'GEN-{uuid.uuid4().hex[:8].upper()}'


class Asset(Base):
    """FinPay asset inventory (demo-data/finpay_assets.csv columns)."""

    __tablename__ = 'assets'

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String(50), nullable=False, unique=True, index=True)  # external id, e.g. A-001
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


class Vulnerability(Base):
    """One CVE finding on one asset (demo-data/finpay_vulns.csv columns).

    The same CVE may exist on many assets; the unique constraint prevents
    duplicate (asset, CVE) findings, most importantly on repeat imports.
    """

    __tablename__ = 'vulnerabilities'
    __table_args__ = (
        UniqueConstraint('asset_row_id', 'cve_id', name='uq_vulnerability_asset_cve'),
    )

    id = Column(Integer, primary_key=True, index=True)
    asset_row_id = Column(Integer, ForeignKey('assets.id'), nullable=False, index=True)
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


class Control(Base):
    """FinPay control catalog (demo-data/finpay_controls.csv columns)."""

    __tablename__ = 'controls'

    id = Column(Integer, primary_key=True, index=True)
    control_key = Column(String(100), nullable=False, unique=True, index=True)
    control_name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False, default='technical')
    coverage = Column(Float, nullable=False, default=0.0)  # 0-1 currently implemented
    implementation_status = Column(String(50), nullable=False, default='none')
    eff_low = Column(Float, nullable=False, default=0.0)   # 0-1
    eff_likely = Column(Float, nullable=False, default=0.0)  # 0-1
    eff_high = Column(Float, nullable=False, default=0.0)  # 0-1
    annual_cost = Column(Float, nullable=False, default=0.0)  # integer INR


class ImpactAssumption(Base):
    """Editable, clearly labeled financial impact assumption per asset.

    The demo CSVs carry no loss amounts, so no financial number is invented:
    scoring uses either the user-edited value or the documented default
    (asset criticality x IMPACT_REFERENCE_INR), always surfaced as an
    assumption the user can change through /assumptions/impact/{asset_id}.
    """

    __tablename__ = 'impact_assumptions'

    id = Column(Integer, primary_key=True, index=True)
    asset_row_id = Column(Integer, ForeignKey('assets.id'), nullable=False, unique=True, index=True)
    assumed_impact_inr = Column(Integer, nullable=False)  # integer INR, editable
    frequency_per_year = Column(Float, nullable=False, default=2.0)  # editable assumption
    compromise_probability = Column(Float, nullable=False, default=0.5)  # editable assumption
    basis = Column(String(100), nullable=False, default='default')  # default|edited
    updated_at = Column(DateTime, nullable=True, onupdate=None)


class Scenario(Base):
    __tablename__ = 'scenarios'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    probability = Column(Float, default=0.0)
    impact = Column(Float, default=0.0)
    annualized_loss = Column(Float, default=0.0)


class Remediation(Base):
    __tablename__ = 'remediations'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    priority = Column(Integer, default=1)
    estimated_cost = Column(Float, default=0.0)
    status = Column(String(50), default='planned')
    summary = Column(Text, nullable=True)
