from sqlalchemy import Boolean, Column, Float, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Asset(Base):
    __tablename__ = 'assets'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    business_unit = Column(String(255), nullable=True)
    criticality = Column(Integer, default=1)
    exposure = Column(Float, default=0.0)
    value = Column(Float, default=0.0)
    owner = Column(String(255), nullable=True)
    is_cloud = Column(Boolean, default=False)
    vulnerabilities = relationship('Vulnerability', back_populates='asset')


class Vulnerability(Base):
    __tablename__ = 'vulnerabilities'

    id = Column(Integer, primary_key=True, index=True)
    cve = Column(String(50), unique=True, index=True)
    asset_id = Column(Integer, ForeignKey('assets.id'))
    severity = Column(String(20), default='medium')
    cvss = Column(Float, default=0.0)
    epss = Column(Float, default=0.0)
    kev = Column(Boolean, default=False)
    status = Column(String(50), default='open')
    description = Column(Text, nullable=True)
    asset = relationship('Asset', back_populates='vulnerabilities')


class Control(Base):
    __tablename__ = 'controls'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100), default='technical')
    cost = Column(Float, default=0.0)
    effectiveness = Column(Float, default=0.0)
    coverage = Column(Float, default=0.0)
    description = Column(Text, nullable=True)


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
