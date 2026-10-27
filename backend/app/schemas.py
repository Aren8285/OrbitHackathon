from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


class AssetBase(BaseModel):
    name: str
    business_unit: Optional[str] = None
    criticality: int = 1
    exposure: float = 0.0
    value: float = 0.0
    owner: Optional[str] = None
    is_cloud: bool = False


class AssetCreate(AssetBase):
    pass


class Asset(AssetBase):
    id: int

    class Config:
        from_attributes = True


class VulnerabilityBase(BaseModel):
    cve: str
    asset_id: int
    severity: str = 'medium'
    cvss: float = 0.0
    epss: float = 0.0
    kev: bool = False
    status: str = 'open'
    description: Optional[str] = None


class VulnerabilityCreate(VulnerabilityBase):
    pass


class Vulnerability(VulnerabilityBase):
    id: int

    class Config:
        from_attributes = True


class ControlBase(BaseModel):
    name: str
    category: str = 'technical'
    cost: float = 0.0
    effectiveness: float = 0.0
    coverage: float = 0.0
    description: Optional[str] = None


class ControlCreate(ControlBase):
    pass


class Control(ControlBase):
    id: int

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


class RiskScore(BaseModel):
    asset_id: int
    asset_name: str
    criticality: float
    exposure: float
    technical_risk: float
    total_risk: float
    priority: float
